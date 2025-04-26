// js/ui/domUtils.js
import { logEvent } from '../logger.js'; // Import logger if needed for warnings

// --- DOM Element References ---
const loadingIndicator = document.getElementById('loading-indicator');
const statusMessage = document.getElementById('status-message');
const postsContainer = document.getElementById('posts-container'); // Keep reference if potentially used
const jsonModal = document.getElementById('json-modal');
const jsonContent = document.getElementById('json-content');
const closeJsonModalButton = document.getElementById('close-json-modal');
const jsonOverlay = jsonModal?.querySelector('.json-overlay');
const currentDidSpan = document.getElementById('current-did');

// --- Loading Indicator ---
export function showLoading() {
    clearStatus(); // Clear status when showing loading
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
}

export function hideLoading() {
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
}

// --- Status Messages ---
export function showStatus(message, isError = false, isSuccess = false) {
    if (!statusMessage) return;
    statusMessage.textContent = message;
    // Use class assignment for clarity
    if (isError) {
        statusMessage.className = 'error';
    } else if (isSuccess) {
        statusMessage.className = 'success';
    } else {
        statusMessage.className = ''; // Default appearance
    }
    statusMessage.style.display = 'block'; // Ensure it's visible

    // Auto-fade for success messages
    if (isSuccess) {
        setTimeout(() => {
            statusMessage.classList.add('fade-out');
            // Remove after fade animation (assuming 0.5s transition + 1.5s delay = 2s)
            setTimeout(() => {
                // Check if the message is still the success one before clearing
                if (statusMessage.classList.contains('success') && statusMessage.textContent === message) {
                    clearStatus();
                }
            }, 2000); // Adjust time based on CSS transition + desired visible time
        }, 500); // Delay before starting fade-out
    }
}

export function clearStatus() {
    if (statusMessage) {
        statusMessage.textContent = '';
        statusMessage.className = '';
        statusMessage.style.display = 'none';
    }
}

// --- Posts Container (Low-level access - Prefer mainUI) ---
// These functions are kept for completeness but mainUI.js should be preferred
// for adding/clearing posts within the masonry layout.
export function clearPosts() {
    logEvent("Warning: clearPosts called directly in domUtils. mainUI.clearPosts preferred.");
    if (postsContainer) postsContainer.innerHTML = '';
    // Note: This bypasses masonry column structure if called directly.
}

export function appendPostElement(element) {
    logEvent("Warning: appendPostElement called directly in domUtils. mainUI.appendPosts preferred.");
    if (element && postsContainer) {
        postsContainer.appendChild(element);
        // Note: This bypasses masonry column structure if called directly.
    }
}

// --- Placeholder Element ---
export function createBlockedPlaceholder(text) {
    const placeholderDiv = document.createElement('div');
    placeholderDiv.className = 'embed-blocked-placeholder';
    placeholderDiv.textContent = text;
    return placeholderDiv;
}

// --- Share Tooltip ---
/**
 * Shows a tooltip message relative to a given element.
 * @param {HTMLElement} targetElement - The element to position the tooltip near.
 * @param {string} message - The text to display in the tooltip.
 */
export function showShareTooltip(targetElement, message) {
    if (!targetElement) return;

    // Remove any existing tooltip for this target first to prevent duplicates
    const existingTooltip = targetElement.querySelector('.share-tooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }

    const tooltip = document.createElement('span');
    tooltip.className = 'share-tooltip';
    tooltip.textContent = message;

    // Ensure the target element can anchor the absolutely positioned tooltip
    const currentPosition = window.getComputedStyle(targetElement).position;
    let addedRelativeClass = false;
    if (currentPosition === 'static') {
        targetElement.style.position = 'relative';
        targetElement.classList.add('tooltip-anchor-relative'); // Mark for cleanup
        addedRelativeClass = true;
    }

    targetElement.appendChild(tooltip);

    // Use requestAnimationFrame to ensure the element is rendered before adding 'show'
    requestAnimationFrame(() => {
        tooltip.classList.add('show');
    });

    // Auto-remove the tooltip after a delay
    const removeTooltip = () => {
        if (tooltip.parentNode) {
            tooltip.remove();
        }
        // Clean up temporary relative positioning if added
        if (addedRelativeClass && targetElement.classList.contains('tooltip-anchor-relative')) {
            targetElement.style.position = '';
            targetElement.classList.remove('tooltip-anchor-relative');
        }
    };

    // Set timeout for visibility duration
    const visibilityTimeout = setTimeout(() => {
        tooltip.classList.remove('show');
        // Listen for transition end for smooth removal
        tooltip.addEventListener('transitionend', removeTooltip, { once: true });
        // Fallback removal in case transitionend doesn't fire
        setTimeout(removeTooltip, 500); // 500ms should be enough for fade out
    }, 1500); // Tooltip visible for 1.5 seconds

    // Optional: Clear timeouts if a new tooltip is shown for the same element quickly
    // This requires storing the timeout IDs, adding complexity. For now, simple removal is fine.
}


// --- Helper to create metric item ---
export function createMetricItem(iconName, count) {
    const item = document.createElement('span');
    item.className = 'metric-item';
    const numericCount = typeof count === 'number' ? count : 0;
    // Use Intl.NumberFormat for better locale support if needed, otherwise toLocaleString is fine
    const displayCount = numericCount.toLocaleString();
    item.innerHTML = `<i class="ph-bold ph-${iconName}"></i> ${displayCount}`;
    return item;
}

// --- JSON Modal ---
export function showJsonModal(jsonData) {
    if (!jsonModal || !jsonContent) return;
    try {
        // Use `undefined` as replacer, `2` for indentation
        jsonContent.textContent = JSON.stringify(jsonData, undefined, 2);
        jsonModal.classList.remove('hidden');
        document.body.classList.add('modal-open'); // Prevent background scroll
    } catch (e) {
        console.error("Error stringifying JSON for modal:", e);
        jsonContent.textContent = "Error displaying JSON data.";
        jsonModal.classList.remove('hidden');
        document.body.classList.add('modal-open'); // Still prevent scroll on error
    }
}

export function hideJsonModal() {
    if (jsonModal) {
        jsonModal.classList.add('hidden');
        document.body.classList.remove('modal-open'); // Re-enable scroll
    }
}

// --- Current DID Display ---
/**
 * Updates the text content of the current DID display span in the header.
 * @param {string} didOrStatus - The DID/Handle string or a status like 'Loading...'.
 */
export function setCurrentDidDisplay(didOrStatus) {
    if (currentDidSpan) {
        currentDidSpan.textContent = didOrStatus || 'Not Set'; // Provide fallback text
    } else {
        console.warn("#current-did span not found in header.");
    }
}


// --- Setup Controls ---
// This specifically sets up listeners for elements *defined* in this util's scope (like JSON modal)
export function setupLogControls() {
    // Close JSON Modal listeners
    if (closeJsonModalButton) {
        closeJsonModalButton.addEventListener('click', hideJsonModal);
    } else {
        console.warn("close-json-modal button not found.");
    }
    if (jsonOverlay) {
        jsonOverlay.addEventListener('click', hideJsonModal);
    } else {
        console.warn("json-overlay element not found in JSON modal.");
    }
}

// Initialize controls specific to this module when the DOM is ready
document.addEventListener('DOMContentLoaded', setupLogControls);