// components/ResultsList.js
// Handles displaying and navigating search results (songs or artists)
// Extends SelectableList to provide keyboard navigation through results

import { SelectableList } from './SelectableList.js';
import { SEARCH_MODES } from '../utils.js';
import { extractYear } from '../utils.js';

export class ResultsList extends SelectableList {
    /**
     * Creates a new ResultsList instance
     * @param {Function} onResultClick - Callback when a result is clicked
     */
    constructor(onResultClick) {
        // Create the container element
        const element = document.createElement('div');
        element.className = 'results-list';

        // Initialize parent class with container and list item selector
        super(element, 'li[data-id]');

        this.onResultClickHandler = onResultClick;
    }

    /**
     * Override: CSS class for active results
     */
    get activeClass() { return 'active-result'; }

    /**
     * Override: Handle result item clicks
     * @param {HTMLElement} item - The clicked result element
     */
    onItemClick(item) {
        const { id, type, url } = item.dataset;

        // For songs, open the Genius page directly
        if (type === SEARCH_MODES.SONGS && url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        } else {
            // For artists/albums, trigger the callback to show detail view
            this.onResultClickHandler(id, type);
        }
    }

    /**
     * Update the results list with new search results
     * @param {Array<Object>} results - Array of result objects (songs or artists)
     * @param {string} type - Type of results (SEARCH_MODES.SONGS or SEARCH_MODES.ARTISTS)
     */
    update(results, type) {
        this.reset(); // Clear any active selection

        // Show empty state if no results. Callers in app.js are responsible
        // for not invoking update() with stale empty results (i.e. when the
        // user has already typed past the query the result is for), so an
        // empty results array here genuinely reflects the current query.
        if (!results?.length) {
            this.container.innerHTML = '<p class="empty-state">No results found</p>';
            return;
        }

        // Map each result type to its renderer
        const renderers = {
            [SEARCH_MODES.SONGS]: r => this.createSongItem(r),
            [SEARCH_MODES.ALBUMS]: r => this.createAlbumItem(r),
            [SEARCH_MODES.ARTISTS]: r => this.createArtistItem(r),
        };

        // Create list element and populate with results
        const list = document.createElement('ul');
        results.forEach(result => list.appendChild(renderers[type](result)));

        // Replace container contents
        this.container.innerHTML = '';
        this.container.appendChild(list);
    }

    /**
     * Create a list item element for a song result
     * @param {Object} song - Song data from API
     * @returns {HTMLElement} The created list item
     */
    createSongItem(song) {
        const item = document.createElement('li');
        
        // Store data attributes for click handling
        item.dataset.id = song.id;
        item.dataset.type = SEARCH_MODES.SONGS;
        item.dataset.url = song.url;
        
        // Render song thumbnail, title, artist, and year
        item.innerHTML = `
            <img src="${song.header_image_thumbnail_url}" alt="${song.title}">
            <div class="item-info">
                <strong class="item-title">${song.title}</strong>
                <p class="item-meta">${song.primary_artist?.name || 'Unknown'} • ${extractYear(song)}</p>
            </div>
        `;
        
        return item;
    }

    /**
     * Create a list item element for an album result
     * @param {Object} album - Album data (from song.album field)
     * @returns {HTMLElement} The created list item
     */
    createAlbumItem(album) {
        const item = document.createElement('li');

        item.dataset.id = album.id;
        item.dataset.type = SEARCH_MODES.ALBUMS;

        // Embedded album form lacks year components — use display string
        const meta = [album.artist?.name, album.release_date_for_display]
            .filter(Boolean).join(' • ');

        item.innerHTML = `
            <img src="${album.cover_art_url}" alt="${album.name}">
            <div class="item-info">
                <strong class="item-title">${album.name}</strong>
                <p class="item-meta">${meta || 'Album'}</p>
            </div>
        `;

        return item;
    }

    /**
     * Create a list item element for an artist result
     * @param {Object} artist - Artist data from API
     * @returns {HTMLElement} The created list item
     */
    createArtistItem(artist) {
        const item = document.createElement('li');
        
        // Store data attributes for click handling
        item.dataset.id = artist.id;
        item.dataset.type = SEARCH_MODES.ARTISTS;
        
        // Render artist image, name, and label
        item.innerHTML = `
            <img src="${artist.image_url}" alt="${artist.name}">
            <div class="item-info">
                <strong class="item-title">${artist.name}</strong>
                <p class="item-meta">Artist</p>
            </div>
        `;
        
        return item;
    }

    /**
     * Show loading state
     */
    showLoading() {
        this.container.innerHTML = '<p class="loading">🔎 Searching...</p>';
    }

    /**
     * Whether a populated result list is currently rendered (vs. loading/error/empty).
     */
    hasResults() {
        return !!this.container.querySelector('ul');
    }

    /**
     * Show error message
     * @param {string} message - Error message to display
     */
    showError(message) {
        this.container.innerHTML = `<p class="error">❌ ${message}</p>`;
    }

    /**
     * Clear all results and reset state
     */
    clear() {
        this.container.innerHTML = '';
        this.reset();
    }
}