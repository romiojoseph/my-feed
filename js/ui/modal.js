// js/ui/modal.js
import { showShareTooltip } from './domUtils.js'; // Import for copy feedback
import { logEvent } from '../logger.js';
import { DEFAULT_DID } from '../config.js'; // Import default DID for show default button

const modal = document.getElementById('did-modal');
const modalOverlay = modal?.querySelector('#modal-overlay'); // Scope query
const closeModalButton = modal?.querySelector('#close-modal');
const submitDidButton = modal?.querySelector('#submit-did');
const changeDidButton = document.getElementById('change-did-button'); // This is outside the modal
const didInput = modal?.querySelector('#did-input');
const copyFeedButton = document.getElementById('copy-feed-url'); // Get existing button
const headerCopyFeed = document.querySelector('.copy-feed');

// Create the Show Default button element
let showDefaultButton = null;
if (modal) {
    showDefaultButton = document.createElement('button');
    showDefaultButton.type = 'button';
    showDefaultButton.id = 'show-default-button';
    showDefaultButton.className = 'copy-feed-button';
    showDefaultButton.textContent = 'Reset';
    // Add it to the modal buttons container
    const modalButtons = modal.querySelector('.modal-buttons');
    if (modalButtons) {
        modalButtons.insertBefore(showDefaultButton, copyFeedButton);
    }
}

export function showModal() {
    if (modal) {
        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('user')) {
            if (copyFeedButton) copyFeedButton.style.display = 'inline-block';
        } else {
            if (copyFeedButton) copyFeedButton.style.display = 'none';
        }
        // Clear input field when modal is opened unless pre-filled from URL logic
        if (didInput && !new URLSearchParams(window.location.search).has('user')) {
            didInput.value = '';
        }
    }
}

export function hideModal() {
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
    }
}

/**
 * Updates the URL with the 'user' query parameter.
 * Uses pushState to create a new history entry.
 * @param {string} identifier - The DID or Handle.
 */
export function updateUrlWithUserParam(identifier) {
    if (!identifier || typeof identifier !== 'string') {
        logEvent("Skipping URL update: Invalid identifier provided.");
        return;
    };

    try {
        const currentUrl = new URL(window.location.href);
        const currentUserParam = currentUrl.searchParams.get('user');
        // Compare identifier case-insensitively for handles/DIDs
        if (identifier.toLowerCase() !== currentUserParam?.toLowerCase()) {
            currentUrl.searchParams.set('user', identifier);
            // Clear other filters when user changes
            ['sort', 'cat', 'embed', 'q'].forEach(p => currentUrl.searchParams.delete(p));
            window.history.pushState({ identifier: identifier }, '', currentUrl.toString());
            logEvent(`URL User updated to: ?user=${identifier}`);
            if (copyFeedButton) copyFeedButton.style.display = 'inline-block';
        } else {
            if (copyFeedButton) copyFeedButton.style.display = 'inline-block';
        }
    } catch (e) {
        console.error("Error updating URL user parameter:", e);
    }
}

// Handle copy feed URL
function copyFeedUrl(eventSourceElement) {
    const currentUrl = new URL(window.location.href);
    const userParam = currentUrl.searchParams.get('user');
    let urlToCopy = currentUrl.toString(); // Start with the full potentially encoded URL

    // --- FIXED DECODING Step for Copy ---
    if (userParam) {
        try {
            // Create a new URL using the current location's origin and pathname
            const cleanUrl = new URL(window.location.origin + window.location.pathname);

            // Directly use the original user parameter without any encoding
            // This prevents issues with special characters like ':'
            cleanUrl.searchParams.set('user', userParam);

            // Copy all other query parameters if they exist
            for (const [key, value] of currentUrl.searchParams.entries()) {
                if (key !== 'user') {
                    cleanUrl.searchParams.set(key, value);
                }
            }

            urlToCopy = cleanUrl.origin + cleanUrl.pathname + '?user=' + userParam;

            const extraParams = [];
            for (const [key, value] of currentUrl.searchParams.entries()) {
                if (key !== 'user') {
                    extraParams.push(`${key}=${value}`);
                }
            }
            if (extraParams.length > 0) {
                urlToCopy += '&' + extraParams.join('&');
            }

            logEvent(`Generated clean URL for copy: ${urlToCopy}`);
        } catch (e) {
            console.error("Error creating clean URL for copy:", e);
            logEvent("Error generating clean URL for copy, using original URL.");
            // Fallback to using the potentially encoded URL if clean URL creation fails
        }
    }
    // --- End FIXED DECODING Step ---

    const showFeedback = (element, message) => {
        if (element === copyFeedButton && copyFeedButton) {
            const originalText = copyFeedButton.textContent; // Use textContent
            copyFeedButton.textContent = message;
            copyFeedButton.disabled = (message !== 'Copy Feed URL');
            setTimeout(() => {
                copyFeedButton.textContent = originalText;
                copyFeedButton.disabled = false;
            }, 1500);
        } else if (element === headerCopyFeed) {
            showShareTooltip(headerCopyFeed, message);
        }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(urlToCopy) // Copy the clean URL
            .then(() => {
                logEvent("Feed URL copied: " + urlToCopy);
                showFeedback(eventSourceElement, 'Feed URL copied!');
            })
            .catch(err => {
                console.error('Clipboard API copy failed:', err);
                showFeedback(eventSourceElement, 'Failed');
            });
    } else {
        // Fallback
        logEvent("Using fallback textarea method to copy URL.");
        const textArea = document.createElement('textarea');
        textArea.value = urlToCopy; // Copy clean URL
        textArea.style.position = 'fixed'; textArea.style.top = '-9999px'; textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus(); textArea.select();
        let success = false;
        try { success = document.execCommand('copy'); } catch (err) { console.error('Fallback copy failed:', err); }
        document.body.removeChild(textArea);
        showFeedback(eventSourceElement, success ? 'Feed URL copied!' : 'Failed');
    }
}

export function setupModal(onSubmit, onCancel) {
    if (!modal || !modalOverlay || !closeModalButton || !submitDidButton || !changeDidButton || !didInput || !copyFeedButton || !headerCopyFeed) {
        console.error("Modal setup failed: Elements missing."); return;
    }

    modalOverlay.addEventListener('click', onCancel);
    closeModalButton.addEventListener('click', onCancel);
    submitDidButton.addEventListener('click', () => {
        const identifier = didInput.value.trim();
        if (identifier) onSubmit(identifier);
        else didInput.focus();
    });
    changeDidButton.addEventListener('click', showModal);
    didInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') { event.preventDefault(); submitDidButton.click(); } });
    copyFeedButton.addEventListener('click', (e) => { e.stopPropagation(); copyFeedUrl(copyFeedButton); });
    headerCopyFeed.addEventListener('click', () => copyFeedUrl(headerCopyFeed));

    // Add event listener for the new Show Default button
    if (showDefaultButton) {
        showDefaultButton.addEventListener('click', (e) => {
            e.stopPropagation();
            logEvent("Show Default button clicked.");
            onSubmit(DEFAULT_DID);
        });
    }
}

export function setDidInputValue(identifier) {
    if (didInput) {
        didInput.value = identifier || '';
    }
}

export function closeJsonModal() {
    const jsonModal = document.getElementById('json-modal');
    if (jsonModal) {
        jsonModal.classList.add('hidden');
        document.body.classList.remove('modal-open');
    }
}