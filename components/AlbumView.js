// components/AlbumView.js
// Handles the album detail page view — header with album info and an ordered
// list of tracks. Mirrors ArtistView's pause/resume/complete spinner pattern
// but renders tracks as a flat ordered list rather than a grid.

import { SelectableList } from './SelectableList.js';

export class AlbumView extends SelectableList {
    /**
     * @param {Object} handlers
     * @param {Function} handlers.onTrackClick - Called with a track's song ID
     * @param {Function} handlers.onBackClick - Called when back button is clicked
     * @param {Function} handlers.onSpinnerClick - Called when status icon is clicked
     */
    constructor(handlers) {
        const element = document.createElement('div');
        element.className = 'album-view';

        super(element, '.album-track-item');

        this.handlers = handlers;
        this.album = null;
    }

    get activeClass() { return 'active-result'; }

    onItemClick(item) {
        if (item.dataset.songId) {
            this.handlers.onTrackClick(item.dataset.songId);
        }
    }

    /**
     * Override Enter behavior: with nothing selected, open the album's Genius page.
     */
    handleKeyDown(event) {
        if (event.key === 'Enter' && this.activeIndex === -1) {
            event.preventDefault();
            if (this.album?.url) {
                window.open(this.album.url, '_blank', 'noopener,noreferrer');
            }
            return;
        }
        super.handleKeyDown(event);
    }

    setupAlbumListeners() {
        this.container.addEventListener('click', (e) => {
            if (e.target.closest('.back-btn')) {
                this.handlers.onBackClick();
            } else if (e.target.closest('.discography-spinner')) {
                this.handlers.onSpinnerClick();
            }
        });
    }

    /**
     * Render the album header and an empty tracks container.
     * @param {Object} album - Album data from /albums/:id
     */
    showAlbumPage(album) {
        this.album = album;
        this.reset();

        const artistName = album.artist?.name || album.primary_artist_names || '';
        const releaseDate = album.release_date_for_display || '';
        const subtitle = [artistName, releaseDate].filter(Boolean).join(' • ');

        this.container.innerHTML = `
            <div class="artist-header-section">
                <div class="artist-header-top">
                    <button class="back-btn">← Back to Results</button>
                    <a href="${album.url}" target="_blank" rel="noopener noreferrer" class="artist-header-link">
                        <img src="${album.cover_art_url}" alt="${album.name}" class="album-image-header">
                        <div class="album-header-text">
                            <h2 class="artist-name-header">${album.name}</h2>
                            ${subtitle ? `<p class="album-header-subtitle">${subtitle}</p>` : ''}
                        </div>
                    </a>
                </div>
            </div>
            <div class="artist-songs-section">
                <h3 class="section-title">
                    Tracklist
                    <span class="discography-spinner" data-state="loading" title="Click to pause/resume loading"></span>
                </h3>
                <ol class="album-tracks-list" id="album-tracks-container"></ol>
                <p id="album-page-loader" class="loading" style="display: none;"></p>
            </div>
        `;

        // Listeners are attached on the persistent outer container, so do this once
        if (!this._listenersAttached) {
            this.setupAlbumListeners();
            this._listenersAttached = true;
        }
    }

    showLoadingState() {
        const spinner = this.container.querySelector('.discography-spinner');
        if (spinner) {
            spinner.dataset.state = 'loading';
            spinner.title = 'Click to pause loading';
        }
    }

    showPausedState() {
        const spinner = this.container.querySelector('.discography-spinner');
        if (spinner) {
            spinner.dataset.state = 'paused';
            spinner.title = 'Click to resume loading';
        }
    }

    showCompleteState() {
        const spinner = this.container.querySelector('.discography-spinner');
        if (spinner) {
            spinner.dataset.state = 'complete';
            spinner.title = 'All tracks loaded';
        }
    }

    /**
     * Render the tracklist.
     * @param {Array<{number: number, song: Object}>} tracks
     * @param {boolean} replace - If true, replace existing tracks
     */
    renderTracks(tracks, replace = false) {
        const container = this.container.querySelector('#album-tracks-container');
        if (!container) return;

        if (replace) {
            this.reset();
            container.innerHTML = '';
        }

        const html = tracks.map(({ number, song }) => `
            <li class="album-track-item" data-song-id="${song.id}">
                <span class="track-number">${number ?? ''}</span>
                <img src="${song.song_art_image_thumbnail_url || song.header_image_thumbnail_url}" alt="${song.title}" loading="lazy">
                <div class="item-info">
                    <strong class="item-title">${song.title}</strong>
                    <p class="item-meta">${song.primary_artist_names || song.artist_names || ''}</p>
                </div>
            </li>
        `).join('');

        container.insertAdjacentHTML('beforeend', html);
    }

    hideLoader(noTracks = false) {
        const loader = this.container.querySelector('#album-page-loader');
        if (loader) {
            if (noTracks) {
                loader.textContent = '😕 No tracks found for this album';
                loader.className = 'empty-state';
                loader.style.display = 'block';
            } else {
                loader.style.display = 'none';
            }
        }
    }

    showLoading(msg = 'Loading...') {
        this.container.innerHTML = `<p class="loading">⏳ ${msg}</p>`;
    }

    showError(msg) {
        this.container.innerHTML = `<p class="error">❌ ${msg}</p>`;
    }

    get element() {
        return this.container;
    }
}
