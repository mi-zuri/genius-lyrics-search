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