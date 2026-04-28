// app.js
// Main application entry point
// Coordinates all components and handles global keyboard shortcuts and navigation

import { SearchBar } from './components/SearchBar.js';
import { ResultsList } from './components/ResultsList.js';
import { ArtistView } from './components/ArtistView.js';
import { searchGenius, getArtistDetails, fetchAllArtistSongs } from './services/api.js';
import { SEARCH_MODES, debounce, sortSongsByDate, UI_CONSTANTS } from './utils.js';

/**
 * Main application class
 * Manages application state and coordinates between components
 */
class MusicApp {
    constructor() {
        // Application state
        this.state = {
            currentView: 'results',    // 'results' or 'artist'
            scrollPosition: 0,         // Save scroll position when navigating to artist view
        };
        
        // Controller for aborting in-flight API requests
        this.fetchController = null;
        
        // State for progressive song fetching
        this.songFetchState = {
            isPaused: false,
            isComplete: false,
            resumeCallback: null
        };

        // Get references to container elements in the DOM
        this.containers = {
            searchBar: document.getElementById('search-bar-container'),
            resultsList: document.getElementById('results-list-container'),
            artistView: document.getElementById('artist-view-container')
        };
        
        this.initComponents();
        this.attachGlobalListeners();
    }

    /**
     * Initialize all UI components
     */
    initComponents() {
        // Create SearchBar with debounced search handler
        this.searchBar = new SearchBar(
            debounce((q, m) => this.handleSearch(q, m), UI_CONSTANTS.SEARCH_DEBOUNCE_MS)
        );
        
        // Create ResultsList with click handler
        this.resultsList = new ResultsList(
            (id, type) => this.handleResultClick(id, type)
        );
        
        // Create ArtistView with handlers for song clicks, back button, and spinner toggle
        this.artistView = new ArtistView({
            onSongClick: (id) => window.open(`https://genius.com/songs/${id}`, '_blank', 'noopener,noreferrer'),
            onBackClick: () => this.handleBack(),
            onSpinnerClick: () => this.toggleSongFetching()
        });
        
        // Mount components to their containers
        this.containers.searchBar.appendChild(this.searchBar.render());
        this.containers.resultsList.appendChild(this.resultsList.container);
        this.containers.artistView.appendChild(this.artistView.element);
    }

    /**
     * Attach global keyboard event listeners
     * Handles shortcuts and navigation that work from anywhere in the app
     */
    attachGlobalListeners() {
        // Map of special keys to their handler functions
        const keyHandlers = {
            'Tab': (e) => this.handleTabKey(e),
            'Escape': (e) => this.handleEscapeKey(e),
            'Backspace': (e) => this.handleBackspaceKey(e),
            'Delete': (e) => this.handleBackspaceKey(e)
        };

        document.addEventListener('keydown', (e) => {
            // Check if there's a special handler for this key
            const handler = keyHandlers[e.key];
            if (handler) {
                handler(e);
                return;
            }

            // Handle arrow keys and Enter for navigation
            this.handleNavigationKeys(e);
            
            // Handle regular typing keys for search
            this.handleTypingKeys(e);
        });

        // Enable hover highlighting and remove keyboard navigation mode when mouse moves
        document.addEventListener('mousemove', () => {
            document.body.classList.remove('keyboard-nav-active');
            document.body.classList.remove('mouse-hover-disabled'); // Enable CSS hover
            
            // Enable hover highlighting in active views
            if (this.state.currentView === 'results') {
                this.resultsList.mouseHasMoved = true;
            } else if (this.state.currentView === 'artist') {
                this.artistView.mouseHasMoved = true;
            }
        });
    }

    /**
     * Handle Tab key - toggle between Songs and Artists mode
     * @param {KeyboardEvent} e - The keyboard event
     */
    handleTabKey(e) {
        e.preventDefault();
        this.searchBar.toggleMode();
        this.searchBar.focus();
    }

    /**
     * Handle Escape key - go back or clear search
     * @param {KeyboardEvent} e - The keyboard event
     */
    handleEscapeKey(e) {
        e.preventDefault();
        if (this.state.currentView === 'artist') {
            // If viewing artist, go back to results
            this.handleBack();
        } else {
            // If viewing results, clear the search
            this.searchBar.clear();
            this.handleSearch('', this.searchBar.getMode());
        }
    }

    /**
     * Handle Backspace/Delete keys - remove last character from search
     * Only works when not typing in an input field
     * @param {KeyboardEvent} e - The keyboard event
     */
    handleBackspaceKey(e) {
        const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
        if (!isTyping) {
            e.preventDefault();
            this.searchBar.removeLastChar();
            this.searchBar.focus();
        }
    }

    /**
     * Handle arrow keys and Enter for navigating through lists
     * @param {KeyboardEvent} e - The keyboard event
     */
    handleNavigationKeys(e) {
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(e.key)) return;

        // Handle spacebar to toggle song fetching on artist page
        if (e.key === ' ' && this.state.currentView === 'artist') {
            e.preventDefault();
            this.toggleSongFetching();
            return;
        }

        // Mark that we're in keyboard navigation mode (for CSS styling)
        document.body.classList.add('keyboard-nav-active');

        // Pause song fetching if navigating in artist view with arrow keys
        if (this.state.currentView === 'artist' && 
            ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            this.pauseSongFetching();
        }

        // Forward navigation to the appropriate view
        if (this.state.currentView === 'artist') {
            this.artistView.handleKeyDown(e);
        } else if (this.state.currentView === 'results') {
            this.resultsList.handleKeyDown(e);
        }
    }

    /**
     * Handle regular typing keys - focus search input
     * Allows typing from anywhere to search
     * @param {KeyboardEvent} e - The keyboard event
     */
    handleTypingKeys(e) {
        const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
        
        // If user types a single character and isn't in an input field,
        // focus the search input so they can start typing
        if (e.key.length === 1 && !isTyping) {
            this.searchBar.focus();
        }
    }

    /**
     * Show a specific view and hide others
     * @param {string} view - The view to show ('results' or 'artist')
     */
    showView(view) {
        this.containers.resultsList.style.display = view === 'results' ? 'block' : 'none';
        this.containers.artistView.style.display = view === 'artist' ? 'block' : 'none';
        this.state.currentView = view;
    }

    /**
     * Handle search query changes
     * @param {string} query - The search query
     * @param {string} mode - Search mode (SEARCH_MODES.SONGS or SEARCH_MODES.ARTISTS)
     */
    async handleSearch(query, mode) {
        // Cancel any in-flight requests
        if (this.fetchController) this.fetchController.abort();
        this.fetchController = new AbortController();

        // Switch to results view
        this.showView('results');
        
        // Clear results if query is too short
        if (query.length < UI_CONSTANTS.MIN_SEARCH_LENGTH) {
            this.resultsList.clear();
            return;
        }
        
        try {
            // Show loading state
            this.resultsList.showLoading();
            
            // Fetch search results
            const data = await searchGenius(query, this.fetchController.signal);
            
            // Process results based on search mode
            const results = this.processResults(data.hits, mode);
            
            // Update UI with results
            this.resultsList.update(results, mode);
        } catch (error) {
            // Only show errors for non-aborted requests
            if (error.name !== 'AbortError') {
                this.resultsList.showError(`Failed to fetch results: ${error.message}`);
            }
        }
    }

    /**
     * Process search results based on the current search mode
     * @param {Array<Object>} hits - Raw search hits from API
     * @param {string} mode - Search mode (SEARCH_MODES.SONGS or SEARCH_MODES.ARTISTS)
     * @returns {Array<Object>} Processed results to display
     */
    processResults(hits, mode) {
        if (mode === SEARCH_MODES.SONGS) {
            // For songs mode, extract song objects and limit to max results
            return hits.map(hit => hit.result).slice(0, UI_CONSTANTS.MAX_SEARCH_RESULTS);
        }
        
        // For artists mode, extract unique artists from search results
        const artistsMap = new Map();
        hits.forEach(hit => {
            const artist = hit.result.primary_artist;
            // Only add if artist exists and we haven't seen this artist yet
            if (artist && !artistsMap.has(artist.id)) {
                artistsMap.set(artist.id, artist);
            }
        });
        
        // Convert map to array and limit to max results
        return Array.from(artistsMap.values()).slice(0, UI_CONSTANTS.MAX_SEARCH_RESULTS);
    }

    /**
     * Handle clicks on search results
     * @param {string|number} id - The ID of the clicked result
     * @param {string} type - The type of result (SEARCH_MODES.SONGS or SEARCH_MODES.ARTISTS)
     */
    async handleResultClick(id, type) {
        // Only handle artist clicks (song clicks open directly)
        if (type !== SEARCH_MODES.ARTISTS) return;
        
        // Save current scroll position to restore later
        this.state.scrollPosition = window.scrollY;
        
        // Show artist details
        await this.showArtistDetails(id);
    }

    /**
     * Pause song fetching
     */
    pauseSongFetching() {
        if (!this.songFetchState.isComplete && !this.songFetchState.isPaused) {
            this.songFetchState.isPaused = true;
            this.artistView.showPausedState();
        }
    }

    /**
     * Resume song fetching
     */
    resumeSongFetching() {
        if (this.songFetchState.isPaused && this.songFetchState.resumeCallback) {
            this.songFetchState.isPaused = false;
            this.artistView.showLoadingState();
            this.songFetchState.resumeCallback();
        }
    }

    /**
     * Toggle between paused and loading states
     */
    toggleSongFetching() {
        // Don't allow clicking when complete
        if (this.songFetchState.isComplete) {
            return;
        }
        
        if (this.songFetchState.isPaused) {
            this.resumeSongFetching();
        } else {
            this.pauseSongFetching();
        }
    }

    /**
     * Show detailed view for an artist
     * Loads artist info and all their songs progressively
     * @param {string|number} artistId - The Genius artist ID
     */
    async showArtistDetails(artistId) {
        // Cancel any in-flight requests
        if (this.fetchController) this.fetchController.abort();
        this.fetchController = new AbortController();
        const { signal } = this.fetchController;

        // Reset song fetch state
        this.songFetchState = {
            isPaused: false,
            isComplete: false,
            resumeCallback: null
        };

        // Switch to artist view and show loading
        this.showView('artist');
        this.artistView.showLoading('Loading artist...');
        
        try {
            // Start fetching artist details
            const artistPromise = getArtistDetails(artistId, signal);
            
            // Fetch songs progressively, updating UI as pages load
            const allSongs = [];
            const onPageLoaded = (songsPage) => {
                if (signal.aborted) return;
                
                // Filter to only include songs by this artist
                const filtered = songsPage.filter(s => s.primary_artist?.id === parseInt(artistId));
                allSongs.push(...filtered);
                
                // Update view if artist header is already displayed
                if (this.artistView.artist) {
                    const sorted = sortSongsByDate(allSongs);
                    this.artistView.renderSongs(sorted, true);
                }
            };

            // Create a pausable fetch function
            const pausableFetch = async () => {
                await fetchAllArtistSongs(
                    artistId, 
                    onPageLoaded, 
                    signal,
                    () => this.songFetchState.isPaused // Check if paused
                );
            };

            // Store resume callback
            this.songFetchState.resumeCallback = pausableFetch;

            // Start fetching all songs (paginated)
            const songsPromise = pausableFetch();
            
            // Wait for artist details to load
            const artistData = await artistPromise;

            if (signal.aborted) return;

            // Display artist header
            this.artistView.showArtistPage(artistData.artist);
            
            // Show initial songs if any have loaded
            if (allSongs.length > 0) {
                const sorted = sortSongsByDate(allSongs);
                this.artistView.renderSongs(sorted, true);
            }

            // Wait for all song pages to finish loading
            await songsPromise;
            
            if (signal.aborted) return;
            
            // Mark as complete
            this.songFetchState.isComplete = true;
            this.songFetchState.isPaused = false;
            
            // Final update - show complete state and all songs
            this.artistView.showCompleteState();
            const sorted = sortSongsByDate(allSongs);
            this.artistView.renderSongs(sorted, true);
            this.artistView.hideLoader(allSongs.length === 0);
            
        } catch (error) {
            // Only show errors for non-aborted requests
            if (error.name !== 'AbortError') {
                this.artistView.showError(`Failed to load artist: ${error.message}`);
            }
        }
    }

    /**
     * Handle back button - return to search results
     */
    handleBack() {
        // Cancel any in-flight requests
        if (this.fetchController) this.fetchController.abort();
        
        // Switch back to results view
        this.showView('results');
        
        // Restore previous scroll position
        setTimeout(() => window.scrollTo(0, this.state.scrollPosition), 0);
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new MusicApp();
});