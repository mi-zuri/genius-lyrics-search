// services/api.js
// Handles all communication with the Genius API
// Provides functions for searching, getting artist details, and fetching songs

// WARNING: This API token is publicly exposed on the client-side.
// For production, this is a major security risk.
//
// TODO: Create a server-side proxy to handle API requests. The server will
// store this token securely (e.g., as an environment variable) and make
// requests to the Genius API on behalf of the client. The client should
// only communicate with your server, not directly with the Genius API.

import { API_CONSTANTS } from '../utils.js';

const ACCESS_TOKEN = 'jSCG4Bi9gO_qm06bJgyGnuUKXmr07ILoVvlHkDcfrpJ3eOQ4FCoyq_0EbDbpnf12';
const BASE_URL = 'https://api.genius.com';

/**
 * Generic function to fetch data from the Genius API
 * @param {string} endpoint - API endpoint path (e.g., '/search', '/artists/123')
 * @param {Object} params - Query parameters to include in the request
 * @param {AbortSignal} signal - AbortSignal for canceling the request
 * @returns {Promise<Object>} The response data from the API
 * @throws {Error} If the request fails or returns invalid data
 */
async function fetchFromGenius(endpoint, params = {}, signal) {
    // Build the full URL with query parameters and access token
    const queryParams = new URLSearchParams({ ...params, access_token: ACCESS_TOKEN });
    const url = `${BASE_URL}${endpoint}?${queryParams}`;
    
    // Make the request with abort signal for cancellation
    const response = await fetch(url, { signal });
    
    // Handle HTTP errors
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.meta?.message || `Request failed with status ${response.status}`);
    }
    
    // Parse and validate response
    const data = await response.json();
    if (!data?.response) throw new Error('Invalid API response format');
    
    return data.response;
}

/**
 * Search for songs on Genius
 * @param {string} query - Search query string
 * @param {AbortSignal} signal - AbortSignal for canceling the request
 * @returns {Promise<Object>} Search results containing hits array
 */
export function searchGenius(query, signal) {
    return fetchFromGenius('/search', { q: query }, signal);
}

/**
 * Get detailed information about a specific artist
 * @param {string|number} artistId - The Genius artist ID
 * @param {AbortSignal} signal - AbortSignal for canceling the request
 * @returns {Promise<Object>} Artist details including name, image, URL, etc.
 */
export function getArtistDetails(artistId, signal) {
    return fetchFromGenius(`/artists/${artistId}`, {}, signal);
}

/**
 * Get detailed information about a specific song (includes album field)
 * @param {string|number} songId - The Genius song ID
 * @param {AbortSignal} signal - AbortSignal for canceling the request
 * @returns {Promise<Object>} Song details including album info
 */
function getSongDetails(songId, signal) {
    return fetchFromGenius(`/songs/${songId}`, {}, signal);
}

/**
 * Get detailed information about a specific album.
 * NOTE: /albums/:id is an undocumented Genius endpoint — it works today but
 * isn't part of the public API contract and could break without notice.
 * @param {string|number} albumId - The Genius album ID
 * @param {AbortSignal} signal - AbortSignal for canceling the request
 * @returns {Promise<Object>} Album details including name, cover, artist, etc.
 */
export function getAlbumDetails(albumId, signal) {
    return fetchFromGenius(`/albums/${albumId}`, {}, signal);
}

/**
 * Score how well an album matches the query, considering both album name and
 * artist name. Higher = better match. Returns 0 if no useful match.
 *
 * The query is split into tokens and each token is scored against the album's
 * name tokens (highest weight) and artist tokens (lower weight). Prefix matches
 * (e.g. "cerule" → "cerulean") are accepted because the last query token is
 * usually being typed and won't be complete yet.
 */
function scoreAlbumMatch(album, query) {
    const normalize = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const name = normalize(album?.name);
    const artist = normalize(album?.artist?.name || album?.primary_artist_names);
    const q = normalize(query);
    if (!q) return 0;

    // Whole-query matches on the album name dominate everything else.
    if (name === q) return 10000;
    if (name && (name.startsWith(q + ' ') || name === q)) return 5000;
    if (name.startsWith(q)) return 3000;

    // Per-token scoring across album name + artist name.
    const nameTokens = name.split(' ').filter(Boolean);
    const artistTokens = artist.split(' ').filter(Boolean);
    const nameSet = new Set(nameTokens);
    const artistSet = new Set(artistTokens);

    // Prefix match requires the query token to be at least 2 chars long, to
    // avoid noisy matches from incidental letters.
    const hasPrefix = (tokens, qt) => qt.length >= 2 && tokens.some(t => t.startsWith(qt));

    let score = 0;
    for (const qt of q.split(' ')) {
        if (nameSet.has(qt)) { score += 100; continue; }
        if (hasPrefix(nameTokens, qt)) { score += 80; continue; }
        if (artistSet.has(qt)) { score += 60; continue; }
        if (hasPrefix(artistTokens, qt)) { score += 40; continue; }
        // Last resort: substring anywhere in either field.
        if (name.includes(qt) || artist.includes(qt)) { score += 10; }
    }
    return score;
}

/**
 * Search for albums by querying songs and deduplicating their albums.
 * The Genius /search endpoint only returns songs, so we fan out to /songs/:id
 * for each top hit to extract its album, then dedupe by album.id.
 *
 * Two-stage candidate gathering: in addition to searching the full query, we
 * also search just the first token (typically the artist name). The full-query
 * search is the literal match; the artist-hint search broadens the pool so
 * albums whose individual songs don't surface for "aurora all m" can still
 * appear via the wider "aurora" net and then be reranked against the full
 * query. The two searches run in parallel, and hits are deduped by song id
 * before fan-out so we never fetch the same song's details twice.
 *
 * Results are reranked by how well each album's NAME matches the full query —
 * so an album literally called "Humble" outranks an album that merely contains
 * a song called "Humble". Song-search popularity is preserved as the tiebreaker
 * (the sort is stable).
 *
 * @param {string} query - Search query string
 * @param {AbortSignal} signal - AbortSignal for canceling the request
 * @returns {Promise<Array<Object>>} Array of unique album objects
 */
export async function searchAlbumsFromQuery(query, signal) {
    const tokens = query.trim().split(/\s+/).filter(Boolean);
    const artistHint = tokens[0] || '';
    // Skip the artist-hint search if the full query is already a single token
    // (it would be identical work).
    const useArtistHint = tokens.length > 1;

    const [fullResponse, artistResponse] = await Promise.all([
        fetchFromGenius('/search', { q: query }, signal),
        useArtistHint
            ? fetchFromGenius('/search', { q: artistHint }, signal).catch(() => ({ hits: [] }))
            : Promise.resolve({ hits: [] }),
    ]);

    // Merge hits, full-query first so its songs win ordering ties downstream.
    const hitsBySongId = new Map();
    [...(fullResponse.hits || []), ...(artistResponse.hits || [])].forEach(hit => {
        const id = hit.result?.id;
        if (id != null && !hitsBySongId.has(id)) {
            hitsBySongId.set(id, hit);
        }
    });

    // Cap the song-detail fan-out. Without this we can fire ~20 /songs/:id
    // requests per keystroke, which is what makes albums mode feel slow. The
    // top entries already reflect Genius's ranking (full-query first, then
    // artist-hint), so trimming the tail costs little quality.
    const ALBUM_FANOUT_CAP = 12;
    const cappedIds = Array.from(hitsBySongId.keys()).slice(0, ALBUM_FANOUT_CAP);

    // Fetch song details in parallel — needed because /search results don't
    // include the album field, only /songs/:id does.
    const songDetails = await Promise.all(
        cappedIds.map(id => getSongDetails(id, signal).catch(() => null))
    );

    // Dedupe albums by id, preserving merged search ranking order
    const albumsMap = new Map();
    songDetails.forEach(detail => {
        const album = detail?.song?.album;
        if (album && !albumsMap.has(album.id)) {
            albumsMap.set(album.id, album);
        }
    });

    // Rerank by album+artist name match against the full query (stable sort
    // keeps original popularity order among ties)
    return Array.from(albumsMap.values())
        .sort((a, b) => scoreAlbumMatch(b, query) - scoreAlbumMatch(a, query));
}

/**
 * Fetch all tracks of an album, paginating through results.
 * Mirrors fetchAllArtistSongs: progressive callback, pausable, abortable.
 * NOTE: /albums/:id/tracks is an undocumented Genius endpoint.
 *
 * @param {string|number} albumId - The Genius album ID
 * @param {Function} onPageLoaded - Callback called with each page of tracks: (tracks: Array) => void
 * @param {AbortSignal} signal - AbortSignal for canceling the request
 * @param {Function} checkPaused - Function that returns true if fetching should pause
 * @returns {Promise<void>} Resolves when all pages have been loaded
 */
export async function fetchAllAlbumTracks(albumId, onPageLoaded, signal, checkPaused) {
    let page = 1;

    while (page) {
        if (signal?.aborted) return;

        // Wait while paused
        if (checkPaused && checkPaused()) {
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (!checkPaused() || signal?.aborted) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);
            });
            if (signal?.aborted) return;
        }

        try {
            const response = await fetchFromGenius(`/albums/${albumId}/tracks`, {
                per_page: API_CONSTANTS.SONGS_PER_PAGE,
                page
            }, signal);

            if (response.tracks?.length > 0) {
                onPageLoaded(response.tracks);
            }

            page = response.next_page;
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error fetching album tracks:', error);
            }
            throw error;
        }
    }
}

/**
 * Fetch all songs by an artist, paginating through results
 * This function loads songs progressively and calls a callback for each page
 * Supports pausing and resuming via a checkPaused callback
 * 
 * @param {string|number} artistId - The Genius artist ID
 * @param {Function} onPageLoaded - Callback called with each page of songs: (songs: Array) => void
 * @param {AbortSignal} signal - AbortSignal for canceling the request
 * @param {Function} checkPaused - Function that returns true if fetching should pause
 * @returns {Promise<void>} Resolves when all pages have been loaded
 * @throws {Error} If a request fails (unless aborted)
 */
export async function fetchAllArtistSongs(artistId, onPageLoaded, signal, checkPaused) {
    let page = 1; // Start with first page
    
    // Continue fetching pages until there are no more
    while (page) {
        // Check if request was aborted
        if (signal?.aborted) return;
        
        // Check if fetching should be paused
        if (checkPaused && checkPaused()) {
            // Wait for pause to be lifted before continuing
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (!checkPaused() || signal?.aborted) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100); // Check every 100ms
            });
            
            // If aborted while paused, exit
            if (signal?.aborted) return;
        }
        
        try {
            // Fetch one page of songs
            const response = await fetchFromGenius(`/artists/${artistId}/songs`, {
                per_page: API_CONSTANTS.SONGS_PER_PAGE,
                page,
                sort: API_CONSTANTS.SORT_BY
            }, signal);

            // If page has songs, call the callback
            if (response.songs?.length > 0) {
                onPageLoaded(response.songs);
            }
            
            // Update page number (will be null/undefined if no more pages)
            page = response.next_page;
        } catch (error) {
            // Don't throw errors for aborted requests
            if (error.name !== 'AbortError') {
                console.error('Error fetching artist songs:', error);
            }
            throw error;
        }
    }
}