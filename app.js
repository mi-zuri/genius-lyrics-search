// app.js
// Main application entry point
// Coordinates all components and handles global keyboard shortcuts and navigation

import { SearchBar } from './components/SearchBar.js';
import { ResultsList } from './components/ResultsList.js';
import { ArtistView } from './components/ArtistView.js';
import { AlbumView } from './components/AlbumView.js';
import {
    searchGenius,
    getArtistDetails,
    fetchAllArtistSongs,
    searchAlbumsFromQuery,
    getAlbumDetails,
    fetchAllAlbumTracks,
} from './services/api.js';
import { SEARCH_MODES, debounce, sortSongsByDate, UI_CONSTANTS } from './utils.js';

/**
 * Main application class
 * Manages application state and coordinates between components
 */
class MusicApp {
    constructor() {
        // Application state
        this.state = {
            currentView: 'results',    // 'results', 'artist', or 'album'
            scrollPosition: 0,         // Save scroll position when navigating to detail views
        };

        // Controller for aborting in-flight API requests
        this.fetchController = null;

        // Mode of the last issued search; used to detect tab switches so we
        // can blow away stale results instead of letting them linger.
        this.lastSearchMode = null;

        // State for progressive song/track fetching (shared between artist & album views)
        this.songFetchState = {
            isPaused: false,
            isComplete: false,
            resumeCallback: null
        };

        // Get references to container elements in the DOM
        this.containers = {
            searchBar: document.getElementById('search-bar-container'),
            results: document.getElementById('results-list-container'),
            artist: document.getElementById('artist-view-container'),
            album: document.getElementById('album-view-container')
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

        // Create AlbumView with handlers analogous to ArtistView
        this.albumView = new AlbumView({
            onTrackClick: (id) => window.open(`https://genius.com/songs/${id}`, '_blank', 'noopener,noreferrer'),
            onBackClick: () => this.handleBack(),
            onSpinnerClick: () => this.toggleSongFetching()
        });

        // Mount components to their containers
        this.containers.searchBar.appendChild(this.searchBar.render());
        this.containers.results.appendChild(this.resultsList.container);
        this.containers.artist.appendChild(this.artistView.element);
        this.containers.album.appendChild(this.albumView.element);
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
            } else if (this.state.currentView === 'album') {
                this.albumView.mouseHasMoved = true;
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
        if (this.state.currentView === 'artist' || this.state.currentView === 'album') {
            // If viewing a detail page, go back to results
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

        // Handle spacebar to toggle song/track fetching on detail pages
        if (e.key === ' ' && (this.state.currentView === 'artist' || this.state.currentView === 'album')) {
            e.preventDefault();
            this.toggleSongFetching();
            return;
        }

        // Mark that we're in keyboard navigation mode (for CSS styling)
        document.body.classList.add('keyboard-nav-active');

        // Pause progressive fetching if navigating in a detail view with arrow keys
        if ((this.state.currentView === 'artist' || this.state.currentView === 'album') &&
            ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            this.pauseSongFetching();
        }

        // Forward navigation to the appropriate view
        if (this.state.currentView === 'artist') {
            this.artistView.handleKeyDown(e);
        } else if (this.state.currentView === 'album') {
            this.albumView.handleKeyDown(e);
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
     * @param {string} view - The view to show ('results', 'artist', or 'album')
     */
    showView(view) {
        ['results', 'artist', 'album'].forEach(name => {
            this.containers[name].style.display = view === name ? 'block' : 'none';
        });
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
        const { signal } = this.fetchController;

        // Switch to results view
        this.showView('results');

        // Detect tab switches — stale results from a different mode shouldn't
        // linger across the boundary.
        const modeChanged = this.lastSearchMode !== null && this.lastSearchMode !== mode;
        this.lastSearchMode = mode;

        // Clear results if query is too short
        if (query.length < UI_CONSTANTS.MIN_SEARCH_LENGTH) {
            this.resultsList.clear();
            return;
        }

        try {
            // Keep old results visible while new ones load; only show the
            // "Searching…" placeholder when there's nothing useful to keep on
            // screen, or when the user just switched tabs (old results belong
            // to a different mode and would be misleading).
            //
            // Albums mode is the exception: its multi-stage pipeline is slow
            // enough that keeping stale results visible makes the UI feel
            // unresponsive — users can't tell whether anything is happening.
            // For that mode we always swap in the searching indicator so the
            // feedback loop is obvious.
            if (modeChanged || !this.resultsList.hasResults() || mode === SEARCH_MODES.ALBUMS) {
                this.resultsList.showLoading();
            }

            let results;
            if (mode === SEARCH_MODES.ALBUMS) {
                // Albums require fan-out: search songs → fetch each song's details
                // → dedupe by album.id. See searchAlbumsFromQuery in services/api.js.
                const albums = await searchAlbumsFromQuery(query, signal);
                results = albums.slice(0, UI_CONSTANTS.MAX_SEARCH_RESULTS);
            } else {
                const data = await searchGenius(query, signal);
                results = this.processResults(data.hits, mode);
            }

            // If the user has already typed more since this search started,
            // a fresh debounced search is about to fire — don't paint stale
            // state. This is what prevents the "No results found" flash for
            // intermediate queries that legitimately have no matches.
            if (this.searchBar.getValue() !== query) return;

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
        // Song clicks open directly (handled in ResultsList); artists and albums
        // open a detail view.
        if (type !== SEARCH_MODES.ARTISTS && type !== SEARCH_MODES.ALBUMS) return;

        // Save current scroll position to restore later
        this.state.scrollPosition = window.scrollY;

        if (type === SEARCH_MODES.ARTISTS) {
            await this.showArtistDetails(id);
        } else {
            await this.showAlbumDetails(id);
        }
    }

    /**
     * Get whichever detail view is currently visible (for spinner state).
     * Returns null on the results view.
     */
    activeDetailView() {
        if (this.state.currentView === 'artist') return this.artistView;
        if (this.state.currentView === 'album') return this.albumView;
        return null;
    }

    /**
     * Pause progressive fetching on the active detail view
     */
    pauseSongFetching() {
        if (!this.songFetchState.isComplete && !this.songFetchState.isPaused) {
            this.songFetchState.isPaused = true;
            this.activeDetailView()?.showPausedState();
        }
    }

    /**
     * Resume progressive fetching on the active detail view
     */
    resumeSongFetching() {
        if (this.songFetchState.isPaused && this.songFetchState.resumeCallback) {
            this.songFetchState.isPaused = false;
            this.activeDetailView()?.showLoadingState();
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
     * Show detailed view for an album.
     * Loads album info and all tracks progressively, mirroring showArtistDetails.
     * @param {string|number} albumId - The Genius album ID
     */
    async showAlbumDetails(albumId) {
        if (this.fetchController) this.fetchController.abort();
        this.fetchController = new AbortController();
        const { signal } = this.fetchController;

        // Reset fetch state (shared with artist view)
        this.songFetchState = {
            isPaused: false,
            isComplete: false,
            resumeCallback: null
        };

        this.showView('album');
        this.albumView.showLoading('Loading album...');

        try {
            const albumPromise = getAlbumDetails(albumId, signal);

            // Tracks accumulate across pages and re-render progressively
            const allTracks = [];
            const onPageLoaded = (tracksPage) => {
                if (signal.aborted) return;
                allTracks.push(...tracksPage);
                if (this.albumView.album) {
                    this.albumView.renderTracks(allTracks, true);
                }
            };

            const pausableFetch = async () => {
                await fetchAllAlbumTracks(
                    albumId,
                    onPageLoaded,
                    signal,
                    () => this.songFetchState.isPaused
                );
            };

            this.songFetchState.resumeCallback = pausableFetch;
            const tracksPromise = pausableFetch();

            const albumData = await albumPromise;
            if (signal.aborted) return;

            this.albumView.showAlbumPage(albumData.album);

            if (allTracks.length > 0) {
                this.albumView.renderTracks(allTracks, true);
            }

            await tracksPromise;
            if (signal.aborted) return;

            this.songFetchState.isComplete = true;
            this.songFetchState.isPaused = false;

            this.albumView.showCompleteState();
            this.albumView.renderTracks(allTracks, true);
            this.albumView.hideLoader(allTracks.length === 0);
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.albumView.showError(`Failed to load album: ${error.message}`);
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