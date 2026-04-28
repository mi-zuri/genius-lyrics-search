// components/ArtistView.js
// Handles the artist detail page view, including discography display and grid navigation
// Extends SelectableList to provide keyboard navigation through songs in a grid layout

import { SelectableList } from './SelectableList.js';
import { extractYear, debounce, UI_CONSTANTS } from '../utils.js';

export class ArtistView extends SelectableList {
    /**
     * Creates a new ArtistView instance
     * @param {Object} handlers - Object containing callback functions
     * @param {Function} handlers.onSongClick - Called when a song is clicked
     * @param {Function} handlers.onBackClick - Called when back button is clicked
     * @param {Function} handlers.onSpinnerClick - Called when spinner/status icon is clicked
     */
    constructor(handlers) {
        // Create the container element for this view
        const element = document.createElement('div');
        element.className = 'artist-view';
        
        // Initialize parent class with container and song item selector
        super(element, '.artist-song-item');
        
        this.handlers = handlers;
        this.artist = null; // Currently displayed artist
        this.columns = 0; // Number of columns in the grid layout
        
        // Debounce column calculation to avoid excessive recalculations during resize
        this.debouncedCalcCols = debounce(() => this.calculateColumns(), UI_CONSTANTS.RESIZE_DEBOUNCE_MS);
        
        this.setupArtistListeners();
    }

    /**
     * Override: CSS class for active songs in the grid
     */
    get activeClass() { return 'active-song'; }

    /**
     * Override: Handle song item clicks
     * @param {HTMLElement} item - The clicked song element
     */
    onItemClick(item) {
        if (item.dataset.songId) {
            this.handlers.onSongClick(item.dataset.songId);
        }
    }

    /**
     * Set up event listeners specific to the artist view
     */
    setupArtistListeners() {
        // Handle back button clicks and spinner clicks
        this.container.addEventListener('click', (e) => {
            if (e.target.closest('.back-btn')) {
                this.handlers.onBackClick();
            } else if (e.target.closest('.discography-spinner')) {
                this.handlers.onSpinnerClick();
            }
        });

        // Recalculate grid columns when window is resized
        window.addEventListener('resize', this.debouncedCalcCols);
    }

    /**
     * Calculate the number of columns in the song grid
     * Used for proper keyboard navigation in grid layout
     */
    calculateColumns() {
        const songs = this.getItems();
        
        // If fewer than 2 songs, just use song count
        if (songs.length < 2) {
            this.columns = songs.length;
            return;
        }

        // Detect columns by checking which items are on the same row
        const firstTop = songs[0].offsetTop;
        let cols = 1;
        
        // Count items on the first row
        for (let i = 1; i < songs.length; i++) {
            if (songs[i].offsetTop === firstTop) cols++;
            else break;
        }
        
        this.columns = cols;
    }

    /**
     * Override: Handle keyboard navigation with grid-aware logic
     * @param {KeyboardEvent} event - The keyboard event
     */
    handleKeyDown(event) {
        const songs = this.getItems();
        
        // Handle Enter key specially
        if (event.key === 'Enter') {
            event.preventDefault();
            
            if (this.activeIndex === -1) {
                // If no song selected, Enter opens artist's Genius page
                if (this.artist?.url) {
                    window.open(this.artist.url, '_blank', 'noopener,noreferrer');
                }
            } else {
                // If song selected, Enter opens that song
                const song = songs[this.activeIndex];
                if (song?.dataset.songId) {
                    this.handlers.onSongClick(song.dataset.songId);
                }
            }
            return;
        }

        if (songs.length === 0) return;
        
        // Handle initial navigation when no item is selected
        if (this.activeIndex === -1) {
            if (event.key === 'ArrowUp') {
                // Up arrow selects last item
                this.setActiveIndex(songs.length - 1, true);
            } else if (['ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
                // Any other arrow selects first item
                this.setActiveIndex(0, true);
            }
            return;
        }
        
        // Calculate new index based on grid navigation
        const newIndex = this.calculateNewIndex(event.key, songs.length);
        if (newIndex !== this.activeIndex) {
            this.setActiveIndex(newIndex, true);
        }
    }

    /**
     * Calculate the new index when navigating in a grid layout
     * @param {string} key - The arrow key pressed
     * @param {number} total - Total number of items
     * @returns {number} The new index to select
     */
    calculateNewIndex(key, total) {
        const cols = this.columns;
        const current = this.activeIndex;
        
        switch(key) {
            case 'ArrowRight':
                // Move right, wrap to start of row if at end
                return ((current + 1) % cols === 0 || current === total - 1)
                    ? Math.floor(current / cols) * cols
                    : current + 1;
                    
            case 'ArrowLeft':
                // Move left, wrap to end of row if at start
                return (current % cols === 0)
                    ? Math.min(current + cols - 1, total - 1)
                    : current - 1;
                    
            case 'ArrowDown':
                // Move down one row, stay in same column
                const down = current + cols;
                return down >= total ? current % cols : down;
                
            case 'ArrowUp':
                // Move up one row, stay in same column
                const up = current - cols;
                if (up >= 0) return up;
                
                // If can't go up, wrap to last row in same column
                const col = current % cols;
                const lastRow = (total - 1) - ((total - 1) % cols) + col;
                return lastRow >= total ? lastRow - cols : lastRow;
                
            default:
                return current;
        }
    }

    /**
     * Display the artist page with header
     * @param {Object} artist - Artist data from API
     */
    showArtistPage(artist) {
        this.artist = artist;
        this.reset(); // Clear any active selection
        
        // Render artist header with back button and artist info
        this.container.innerHTML = `
            <div class="artist-header-section">
                <div class="artist-header-top">
                    <button class="back-btn">← Back to Results</button>
                    <a href="${artist.url}" target="_blank" rel="noopener noreferrer" class="artist-header-link">
                        <img src="${artist.image_url}" alt="${artist.name}" class="artist-image-header">
                        <h2 class="artist-name-header">${artist.name}</h2>
                    </a>
                </div>
            </div>
            <div class="artist-songs-section">
                <h3 class="section-title">
                    Discography 
                    <span class="discography-spinner" data-state="loading" title="Click to pause/resume loading"></span>
                </h3>
                <div class="artist-songs-grid" id="artist-songs-container"></div>
                <p id="artist-page-loader" class="loading" style="display: none;"></p>
            </div>
        `;
    }

    /**
     * Show the spinner in loading state
     */
    showLoadingState() {
        const spinner = this.container.querySelector('.discography-spinner');
        if (spinner) {
            spinner.dataset.state = 'loading';
            spinner.title = 'Click to pause loading';
        }
    }

    /**
     * Show the spinner in paused state
     */
    showPausedState() {
        const spinner = this.container.querySelector('.discography-spinner');
        if (spinner) {
            spinner.dataset.state = 'paused';
            spinner.title = 'Click to resume loading';
        }
    }

    /**
     * Show the spinner in complete state
     */
    showCompleteState() {
        const spinner = this.container.querySelector('.discography-spinner');
        if (spinner) {
            spinner.dataset.state = 'complete';
            spinner.title = 'All songs loaded';
        }
    }

    /**
     * Render songs in the grid
     * @param {Array<Object>} songs - Array of song objects
     * @param {boolean} replace - If true, replace existing songs; if false, append
     */
    renderSongs(songs, replace = false) {
        const container = this.container.querySelector('#artist-songs-container');
        if (!container) return;

        if (replace) {
            this.reset(); // Clear selection
            container.innerHTML = ''; // Clear existing songs
        }

        // Generate HTML for each song
        const html = songs.map(song => `
            <div class="artist-song-item" data-song-id="${song.id}">
                <img src="${song.song_art_image_thumbnail_url}" alt="${song.title}" loading="lazy">
                <div class="song-item-info">
                    <strong class="song-title">${song.title}</strong>
                    <p class="song-year">${extractYear(song)}</p>
                </div>
            </div>
        `).join('');

        container.insertAdjacentHTML('beforeend', html);
        
        // Recalculate columns after DOM update
        setTimeout(() => this.calculateColumns(), UI_CONSTANTS.COLUMN_CALC_DELAY_MS);
    }

    /**
     * Hide the loading spinner in the section title (deprecated - use showCompleteState instead)
     */
    hideSpinner() {
        this.showCompleteState();
    }

    /**
     * Hide or show the loader message
     * @param {boolean} noSongs - If true, show "no songs" message
     */
    hideLoader(noSongs = false) {
        const loader = this.container.querySelector('#artist-page-loader');
        if (loader) {
            if (noSongs) {
                loader.textContent = "😕 No songs found for this artist";
                loader.className = 'empty-state';
                loader.style.display = 'block';
            } else {
                loader.style.display = 'none';
            }
        }
    }

    /**
     * Show a loading message
     * @param {string} msg - Loading message to display
     */
    showLoading(msg = 'Loading...') {
        this.container.innerHTML = `<p class="loading">⏳ ${msg}</p>`;
    }

    /**
     * Show an error message
     * @param {string} msg - Error message to display
     */
    showError(msg) {
        this.container.innerHTML = `<p class="error">❌ ${msg}</p>`;
    }

    /**
     * Get the container element
     * @returns {HTMLElement} The container element
     */
    get element() {
        return this.container;
    }
}