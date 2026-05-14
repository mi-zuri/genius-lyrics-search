// utils.js
// Utility functions and constants used throughout the application

// ===== CONSTANTS =====

/**
 * Search mode constants
 * Used to distinguish between searching for songs vs artists
 */
export const SEARCH_MODES = {
  SONGS: "songs",
  ALBUMS: "albums",
  ARTISTS: "artists",
};

/**
 * API pagination constants
 */
export const API_CONSTANTS = {
  SONGS_PER_PAGE: 50, // Maximum items per API page
  SORT_BY: "popularity", // Default sort order for artist songs
};

/**
 * UI configuration constants
 */
export const UI_CONSTANTS = {
  SEARCH_DEBOUNCE_MS: 200, // Debounce delay for search input
  RESIZE_DEBOUNCE_MS: 250, // Debounce delay for window resize
  MIN_SEARCH_LENGTH: 2, // Minimum characters to trigger search
  MAX_SEARCH_RESULTS: 5, // Maximum number of results to show
  COLUMN_CALC_DELAY_MS: 50, // Delay before recalculating grid columns
};

// ===== UTILITY FUNCTIONS =====

/**
 * Debounce function - delays execution until after a period of inactivity
 * Useful for optimizing performance on frequently triggered events like input typing
 *
 * @param {Function} func - The function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced version of the function
 *
 * @example
 * const debouncedSearch = debounce((query) => search(query), 300);
 * input.addEventListener('input', (e) => debouncedSearch(e.target.value));
 */
export function debounce(func, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
}

/**
 * Extract the release year from a song object
 * Tries multiple fields to find the year
 *
 * @param {Object} song - Song object from Genius API
 * @param {string} [song.release_date] - Full release date string (YYYY-MM-DD)
 * @param {Object} [song.release_date_components] - Object containing year/month/day
 * @param {number} [song.release_date_components.year] - Release year
 * @returns {number|string} The release year, or 'Unknown' if not available
 *
 * @example
 * extractYear({ release_date: '2023-05-15' }) // Returns: 2023
 * extractYear({ release_date_components: { year: 2022 } }) // Returns: 2022
 * extractYear({}) // Returns: 'Unknown'
 */
export function extractYear(song) {
  // Try to extract year from full date string
  if (song.release_date) {
    return new Date(song.release_date).getFullYear();
  }

  // Fall back to year component, or 'Unknown' if not available
  return song.release_date_components?.year || "Unknown";
}

/**
 * Sort songs by release date (newest first)
 * Filters out songs without release dates
 *
 * @param {Array<Object>} songs - Array of song objects
 * @returns {Array<Object>} Sorted array of songs with release dates
 *
 * @example
 * const sorted = sortSongsByDate([
 *   { title: 'Old Song', release_date: '2020-01-01' },
 *   { title: 'New Song', release_date: '2023-01-01' },
 *   { title: 'No Date' } // This will be filtered out
 * ]);
 * // Returns: [{ title: 'New Song', ... }, { title: 'Old Song', ... }]
 */
export function sortSongsByDate(songs) {
  /**
   * Helper function to get a Date object from a song
   * @param {Object} song - Song object
   * @returns {Date} Date object representing the release date
   */
  const getDate = (song) => {
    // Use release_date if available, otherwise construct from components
    return new Date(
      song.release_date || `${song.release_date_components.year}-01-01`,
    );
  };

  return [...songs]
    .filter((s) => s.release_date || s.release_date_components) // Only include songs with dates
    .sort((a, b) => getDate(b) - getDate(a)); // Sort descending (newest first)
}
