// js/ui/mainUI.js
import { createPostElement } from './postRenderer.js';
import * as DomUtils from './domUtils.js';
import { setCurrentDidDisplay } from './domUtils.js';
import * as ModalUtils from './modal.js';
import { logEvent } from '../logger.js';
import { setupCarousel } from './embedRenderers/imageEmbed.js'; // Import setupCarousel

// Re-export DID modal functions
export const { showModal, hideModal, setupModal, setDidInputValue } = ModalUtils;
// Re-export common DOM utils
export const { showLoading, hideLoading, showStatus, clearStatus } = DomUtils;
// Re-export the specific function to update header DID display
export { setCurrentDidDisplay };

// --- Masonry Layout State ---
const postsContainer = document.getElementById('posts-container');
let columnElements = [];
let currentColumnCount = 0;
let resizeTimeout;

// --- Configuration ---
const COLUMN_WIDTH_THRESHOLD = 480;
const RESIZE_DEBOUNCE_MS = 300;

/** Calculates the optimal number of columns based on container width. */
function calculateColumnCount() {
    const width = window.innerWidth;

    if (width > 1920) return 5;
    if (width > 1440) return 4;
    if (width > 1024) return 3;
    if (width > 600) return 2;
    return 1;
}


/** Creates or updates the column elements in the posts container. */
function setupColumns(count) {
    if (!postsContainer || count <= 0 || count === currentColumnCount) return; // Ensure count is positive

    logEvent(`Setting up ${count} columns.`);
    postsContainer.innerHTML = ''; // Clear existing content/columns
    columnElements = [];
    postsContainer.style.setProperty('--masonry-columns', count); // Set CSS variable for grid (if using CSS grid)

    for (let i = 0; i < count; i++) {
        const columnDiv = document.createElement('div');
        columnDiv.className = 'masonry-column';
        postsContainer.appendChild(columnDiv);
        columnElements.push(columnDiv);
    }
    currentColumnCount = count;
}

/** Finds the shortest column element to append the next post to. */
function findShortestColumn() {
    if (columnElements.length === 0) {
        return null;
    }
    // Optimize finding the shortest column slightly
    let shortest = columnElements[0];
    for (let i = 1; i < columnElements.length; i++) {
        if (columnElements[i].offsetHeight < shortest.offsetHeight) {
            shortest = columnElements[i];
        }
    }
    return shortest;
}

/** Initializes any uninitialized carousels within a given element. */
function initializeCarousels(parentElement) {
    if (!parentElement) return;
    // Find carousels needing initialization within the newly added element
    const carouselsToInit = parentElement.querySelectorAll('.needs-carousel-init');
    carouselsToInit.forEach(carousel => {
        if (carousel.id) {
            setupCarousel(carousel.id); // Call the setup function from imageEmbed.js
        } else {
            console.warn("Found carousel needing init but without an ID", carousel);
        }
    });
}

/**
 * Appends a batch of posts to the container using the masonry layout.
 * Creates post elements, adds them to the shortest column, and initializes carousels.
 * @param {Array<object>} postsToAppend - Array of combined post objects { post, meta }.
 */
export function appendPosts(postsToAppend) {
    if (!postsToAppend || postsToAppend.length === 0) {
        return;
    }
    // Ensure columns are set up if they aren't already
    if (columnElements.length === 0) {
        setupColumns(calculateColumnCount());
        if (columnElements.length === 0) {
            logEvent("Cannot append posts: Columns not initialized and setup failed.");
            return; // Exit if columns still couldn't be created
        }
    }

    // Use a DocumentFragment for potentially better performance if many posts are added at once
    // Although adding one-by-one to columns might negate this benefit.
    // Let's stick to appending one by one for simplicity with shortest column logic.

    postsToAppend.forEach(postData => {
        try {
            const postElement = createPostElement(postData);
            if (postElement) {
                const shortestColumn = findShortestColumn();
                if (shortestColumn) {
                    shortestColumn.appendChild(postElement);
                    // *** Initialize carousels AFTER element is appended to the column ***
                    initializeCarousels(postElement);
                } else {
                    console.warn("Could not find shortest column, appending to first.");
                    if (columnElements.length > 0) {
                        columnElements[0].appendChild(postElement);
                        initializeCarousels(postElement); // Also init here
                    }
                }
            }
        } catch (error) {
            const postUri = postData?.post?.uri || 'Unknown URI';
            console.error(`Error creating or appending element for post: ${postUri}`, error);
        }
    });
}

/**
 * Clears the post container and displays a new list of posts using masonry layout.
 * Initializes carousels after displaying.
 * @param {Array<object>} postsToDisplay - Array of combined post objects { post, meta }.
 */
export function displayPosts(postsToDisplay) {
    clearPosts(); // Clear content within existing columns

    if (!postsToDisplay || postsToDisplay.length === 0) {
        // If columns exist but no posts, ensure they are empty
        setupColumns(currentColumnCount > 0 ? currentColumnCount : calculateColumnCount()); // Re-setup to ensure clean state
        return;
    }

    // Ensure columns are set up correctly for the current width
    const requiredColumns = calculateColumnCount();
    if (requiredColumns !== currentColumnCount || columnElements.length === 0) {
        setupColumns(requiredColumns);
    }

    // Append the new posts using the masonry distribution logic
    // The appendPosts function now handles initializing carousels internally after append.
    appendPosts(postsToDisplay);
}

/** Clears all posts from the masonry columns. */
export function clearPosts() {
    columnElements.forEach(column => {
        column.innerHTML = '';
    });
    // logEvent("Cleared posts from columns."); // Keep log minimal unless debugging
}

/** Handles window resize events to potentially adjust the number of columns. */
function handleResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const newColumnCount = calculateColumnCount();
        if (newColumnCount !== currentColumnCount) {
            logEvent(`Window resize detected. Recalculating columns to ${newColumnCount}.`);
            // Trigger a re-render in main.js by calling its function that uses displayPosts
            // This needs access to the *currently displayed* posts from main.js
            window.dispatchEvent(new CustomEvent('masonryResize', { detail: newColumnCount }));
        }
    }, RESIZE_DEBOUNCE_MS);
}

/** Initializes the masonry layout and sets up event listeners. */
export function initializeMasonry() {
    logEvent("Initializing Masonry Layout");
    setupColumns(calculateColumnCount());
    window.addEventListener('resize', handleResize);
}