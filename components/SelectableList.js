// components/SelectableList.js
// Base class for handling keyboard/mouse navigation in list components
// Provides shared functionality for navigating through lists of items using arrow keys and mouse

export class SelectableList {
    /**
     * Creates a new SelectableList instance
     * @param {HTMLElement} containerElement - The DOM element that contains the list items
     * @param {string} itemSelector - CSS selector to identify individual list items
     */
    constructor(containerElement, itemSelector) {
        this.container = containerElement;
        this.itemSelector = itemSelector;
        this.activeIndex = -1; // Track currently highlighted item (-1 means none selected)
        this.mouseHasMoved = false; // Track if mouse has moved since last reset
        this.setupListeners();
    }

    /**
     * Set up event listeners for mouse interactions
     * Handles both clicks and hover events on list items
     */
    setupListeners() {
        // Handle clicks on list items
        this.container.addEventListener('click', (e) => {
            const item = e.target.closest(this.itemSelector);
            if (item) this.onItemClick(item);
        });

        // Handle mouse hover - only update active item if not in keyboard navigation mode
        this.container.addEventListener('mouseover', (e) => {
            // Don't highlight on hover if user is navigating with keyboard or mouse hasn't moved yet
            if (this.isKeyboardMode() || !this.mouseHasMoved) return;
            
            const item = e.target.closest(this.itemSelector);
            if (item) {
                const items = this.getItems();
                this.setActiveIndex(items.indexOf(item));
            }
        });
    }

    /**
     * Handle keyboard navigation events
     * @param {KeyboardEvent} event - The keyboard event to process
     */
    handleKeyDown(event) {
        const items = this.getItems();
        if (items.length === 0) return;

        let newIndex = this.activeIndex;

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                // Move down, wrapping to start if at end
                newIndex = (this.activeIndex + 1) % items.length;
                break;
            case 'ArrowUp':
                event.preventDefault();
                // Move up, wrapping to end if at start
                newIndex = this.activeIndex <= 0 ? items.length - 1 : this.activeIndex - 1;
                break;
            case 'Enter':
                event.preventDefault();
                // Select current item or first item if none selected
                const target = this.activeIndex === -1 ? 0 : this.activeIndex;
                if (items[target]) this.onItemClick(items[target]);
                return;
        }

        // Update the active index with keyboard flag set to true
        this.setActiveIndex(newIndex, true);
    }

    /**
     * Update the currently active/highlighted item
     * @param {number} index - Index of the item to make active
     * @param {boolean} isKeyboard - Whether this was triggered by keyboard navigation
     */
    setActiveIndex(index, isKeyboard = false) {
        if (index === this.activeIndex) return;

        const items = this.getItems();
        
        // Remove active class from previously selected item
        if (this.activeIndex !== -1 && items[this.activeIndex]) {
            items[this.activeIndex].classList.remove(this.activeClass);
        }

        // Update index
        this.activeIndex = index;

        // Add active class to newly selected item
        if (this.activeIndex !== -1 && items[this.activeIndex]) {
            const activeItem = items[this.activeIndex];
            activeItem.classList.add(this.activeClass);
            
            // Scroll item into view if navigating with keyboard
            if (isKeyboard) {
                activeItem.scrollIntoView({ block: 'nearest' });
            }
        }
    }

    /**
     * Get all selectable items in the container
     * @returns {Array<HTMLElement>} Array of DOM elements matching the item selector
     */
    getItems() {
        return Array.from(this.container.querySelectorAll(this.itemSelector));
    }

    /**
     * Check if the user is currently in keyboard navigation mode
     * @returns {boolean} True if keyboard navigation is active
     */
    isKeyboardMode() {
        return document.body.classList.contains('keyboard-nav-active') ||
               document.body.classList.contains('mouse-interaction-disabled');
    }

    /**
     * Reset the list to initial state (no item selected)
     */
    reset() {
        this.activeIndex = -1;
        this.mouseHasMoved = false; // Disable hover highlighting until mouse moves
        document.body.classList.add('mouse-hover-disabled'); // Add class to disable CSS hover
        // Remove active class from all items
        this.getItems().forEach(item => item.classList.remove(this.activeClass));
    }

    // Methods to be overridden by subclasses
    
    /**
     * Get the CSS class name to apply to active items
     * @returns {string} The CSS class name
     */
    get activeClass() { return 'active'; }
    
    /**
     * Handle when an item is clicked
     * @param {HTMLElement} item - The clicked item
     */
    onItemClick(item) { }
}