// components/SearchBar.js
// Handles the search input and mode toggle (Songs/Artists)
// Provides the main search interface for the application

import { SEARCH_MODES } from '../utils.js';

export class SearchBar {
    /**
     * Creates a new SearchBar instance
     * @param {Function} onSearch - Callback function called when search input changes
     *                              Receives (query: string, mode: string) as parameters
     */
    constructor(onSearch) {
        this.onSearch = onSearch;
        
        // Create the container element
        this.element = document.createElement('div');
        this.element.className = 'search-bar';
        
        // Default to searching for songs
        this.currentMode = SEARCH_MODES.SONGS;
    }

    /**
     * Render the search bar HTML and set up references to elements
     * @returns {HTMLElement} The rendered search bar element
     */
    render() {
        // Create search input and mode toggle buttons
        this.element.innerHTML = `
            <input 
                type="text" 
                id="search-input" 
                placeholder="Search for songs or artists..."
                autocomplete="off"
            >
            <div class="search-modes">
                <div class="mode-toggle" data-mode="${SEARCH_MODES.SONGS}">
                    <button class="active" data-mode="${SEARCH_MODES.SONGS}">🎵 Songs</button>
                    <button data-mode="${SEARCH_MODES.ARTISTS}">👤 Artists</button>
                </div>
            </div>
        `;

        // Store references to key elements
        this.input = this.element.querySelector('#search-input');
        this.modeToggle = this.element.querySelector('.mode-toggle');
        
        this.attachListeners();
        
        return this.element;
    }

    /**
     * Attach event listeners to search input and mode buttons
     */
    attachListeners() {
        // Trigger search when user types in the input
        this.input.addEventListener('input', () => {
            this.onSearch(this.input.value.trim(), this.currentMode);
        });

        // Handle mode toggle button clicks
        this.element.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
        });
    }

    /**
     * Change the search mode (Songs or Artists)
     * @param {string} mode - The new mode (SEARCH_MODES.SONGS or SEARCH_MODES.ARTISTS)
     */
    setMode(mode) {
        // Don't do anything if already in this mode
        if (mode === this.currentMode) return;
        
        this.currentMode = mode;
        
        // Update the toggle's data attribute for CSS animation
        this.modeToggle.dataset.mode = mode;
        
        // Update button active states
        this.element.querySelectorAll('button').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === mode);
        });
        
        // Trigger a new search with the current query in the new mode
        this.onSearch(this.input.value.trim(), this.currentMode);
    }

    /**
     * Toggle between Songs and Artists mode
     */
    toggleMode() {
        const newMode = this.currentMode === SEARCH_MODES.SONGS 
            ? SEARCH_MODES.ARTISTS 
            : SEARCH_MODES.SONGS;
        this.setMode(newMode);
    }

    /**
     * Get the current search mode
     * @returns {string} Current mode (SEARCH_MODES.SONGS or SEARCH_MODES.ARTISTS)
     */
    getMode() {
        return this.currentMode;
    }

    /**
     * Focus the search input
     */
    focus() {
        this.input.focus();
    }

    /**
     * Clear the search input
     */
    clear() {
        this.input.value = '';
    }
    
    /**
     * Remove the last character from the search input
     * Used when handling backspace key outside of input field
     */
    removeLastChar() {
        if (this.input.value.length > 0) {
            this.input.value = this.input.value.slice(0, -1);
            this.onSearch(this.input.value.trim(), this.currentMode);
        }
    }
}