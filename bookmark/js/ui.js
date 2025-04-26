// js/ui.js

// --- DOM Element Selectors ---
// Use a function to get elements to ensure they exist when needed
function getElements() {
    return {
        loginSection: document.getElementById('login-section'),
        loggedOutTitle: document.getElementById('logged-out-title'),
        bookmarksSection: document.getElementById('bookmarks-section'),
        userProfileTrigger: document.getElementById('user-profile-trigger'),
        userInfo: document.getElementById('user-info'),
        userDisplayName: document.getElementById('user-display-name'),
        addBookmarkButton: document.getElementById('add-bookmark-button'),
        // Removed refresh button reference as it's now in breadcrumbs
        // refreshBookmarksButton: document.getElementById('refresh-bookmarks-button'),
        bookmarkList: document.getElementById('bookmark-list'),
        loadingOverlay: document.getElementById('loading-overlay'),
        loadingText: document.getElementById('loading-text'),
        messageArea: document.getElementById('message-area'),
        totalPostCountSpan: document.getElementById('total-post-count'),
        categoryCountSpan: document.getElementById('category-count'),
        categoryFilterSelect: document.getElementById('category-filter'),
        breadcrumbsContainer: document.getElementById('breadcrumbs'),
        listViewButton: document.getElementById('list-view-button'),
        folderViewButton: document.getElementById('folder-view-button'),
        listControls: document.getElementById('list-controls'),
        sortButton: document.getElementById('sort-button'),
        exportButton: document.getElementById('export-button')
    };
}

// Modals & Forms (Keep references close to where they are used)
const addModal = document.getElementById('add-modal');
const addBookmarkForm = document.getElementById('add-bookmark-form');
const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-bookmark-form');
const editPostUri = document.getElementById('edit-post-uri');
const editRkeyInput = document.getElementById('edit-rkey');
const editCategoryInput = document.getElementById('edit-category');
const editCreatedAtInput = document.getElementById('edit-created-at');
const editOriginalUriInput = document.getElementById('edit-original-uri');
const logoutConfirmModal = document.getElementById('logout-confirm-modal');
const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const exportModal = document.getElementById('export-modal');
const detailsModal = document.getElementById('details-modal');


// --- Constants ---
const HIDDEN_CLASS = 'hidden';
const ACTIVE_CLASS = 'active';

// --- UI State Functions ---

function showLogin() {
    const elements = getElements();
    if (elements.loginSection) elements.loginSection.classList.remove(HIDDEN_CLASS);
    if (elements.loggedOutTitle) elements.loggedOutTitle.classList.remove(HIDDEN_CLASS);
    if (elements.bookmarksSection) elements.bookmarksSection.classList.add(HIDDEN_CLASS);
    if (elements.userProfileTrigger) elements.userProfileTrigger.classList.add(HIDDEN_CLASS);
    if (elements.addBookmarkButton) elements.addBookmarkButton.classList.add(HIDDEN_CLASS);
    if (elements.breadcrumbsContainer) elements.breadcrumbsContainer.classList.add(HIDDEN_CLASS);

    // Hide header-actions explicitly
    const headerActions = document.querySelector('.header-actions');
    if (headerActions) headerActions.classList.add(HIDDEN_CLASS);

    // Also hide export button
    if (elements.exportButton) elements.exportButton.classList.add(HIDDEN_CLASS);

    clearBookmarks();
    clearMessage();
    updateCounts(0, 0);
}

function showBookmarksUI(displayName) {
    const elements = getElements();
    if (elements.loginSection) elements.loginSection.classList.add(HIDDEN_CLASS);
    if (elements.loggedOutTitle) elements.loggedOutTitle.classList.add(HIDDEN_CLASS);
    if (elements.bookmarksSection) elements.bookmarksSection.classList.remove(HIDDEN_CLASS);
    if (elements.userProfileTrigger) elements.userProfileTrigger.classList.remove(HIDDEN_CLASS);
    if (elements.userDisplayName) elements.userDisplayName.textContent = displayName || 'Unknown';
    if (elements.addBookmarkButton) elements.addBookmarkButton.classList.remove(HIDDEN_CLASS);
    if (elements.breadcrumbsContainer) elements.breadcrumbsContainer.classList.remove(HIDDEN_CLASS);

    // Make sure header-actions is visible
    const headerActions = document.querySelector('.header-actions');
    if (headerActions) {
        headerActions.classList.remove(HIDDEN_CLASS);
    }

    // Make sure export button is visible
    if (elements.exportButton) {
        elements.exportButton.classList.remove(HIDDEN_CLASS);
    }

    clearMessage();
}

function showLoadingOverlay(text = 'Loading...') {
    const elements = getElements();
    if (elements.loadingText) elements.loadingText.textContent = text;
    if (elements.loadingOverlay) elements.loadingOverlay.classList.remove(HIDDEN_CLASS);
}

function hideLoadingOverlay() {
    const elements = getElements();
    if (elements.loadingOverlay) elements.loadingOverlay.classList.add(HIDDEN_CLASS);
}

function setLoading(isLoading, message = 'Loading...') {
    if (isLoading) {
        showLoadingOverlay(message);
    } else {
        hideLoadingOverlay();
    }
    // Simplified query selector - ensure it targets only necessary controls
    const controls = document.querySelectorAll(
        'header button, #login-form input, #login-form button, #sub-header-controls button, #sub-header-controls select, #bookmark-list button, .modal button, .modal input'
    );
    controls.forEach(el => {
        if (el) {
            // Don't disable close buttons inside modals
            if (!(el.closest('.modal') && el.classList.contains('close-button'))) {
                el.disabled = isLoading;
            }
        }
    });
}

function showMessage(message, type = 'info') {
    const elements = getElements();
    if (elements.messageArea) {
        elements.messageArea.innerHTML = escapeHtml(message); // Escape HTML by default
        elements.messageArea.className = type; // Add class for styling (e.g., error, info)
        elements.messageArea.classList.remove(HIDDEN_CLASS);

        // Auto-clear after a delay (e.g., 5 seconds)
        // Clear existing timer if any
        if (elements.messageArea.timerId) {
            clearTimeout(elements.messageArea.timerId);
        }
        elements.messageArea.timerId = setTimeout(() => {
            // Check if the message is still the same before clearing
            if (elements.messageArea.innerHTML === escapeHtml(message)) {
                clearMessage();
            }
        }, 5000); // 5 seconds
    }
}

function clearMessage() {
    const elements = getElements();
    if (elements.messageArea) {
        if (elements.messageArea.timerId) {
            clearTimeout(elements.messageArea.timerId);
            elements.messageArea.timerId = null;
        }
        elements.messageArea.innerHTML = '';
        elements.messageArea.classList.add(HIDDEN_CLASS);
        elements.messageArea.className = ''; // Remove type class
    }
}

function clearBookmarks() {
    const elements = getElements();
    if (elements.bookmarkList) elements.bookmarkList.innerHTML = '';
}

function updateCounts(postCount, categoryCount) {
    const elements = getElements();
    if (elements.totalPostCountSpan) {
        elements.totalPostCountSpan.textContent = postCount;
    }
    if (elements.categoryCountSpan) {
        elements.categoryCountSpan.textContent = categoryCount;
    }

    // Update labels for singular/plural
    const postLabel = document.querySelector('#counts-area .count-label:first-of-type');
    const categoryLabel = document.querySelector('#counts-area .count-label:last-of-type');

    if (postLabel) {
        postLabel.textContent = postCount === 1 ? 'Post' : 'Posts';
    }
    if (categoryLabel) {
        categoryLabel.textContent = categoryCount === 1 ? 'Category' : 'Categories';
    }
}

// --- Bookmark & Folder Rendering ---

function formatLocalDate(isoString) {
    if (!isoString) return 'Unknown Date';
    try {
        const dt = new Date(isoString);
        if (isNaN(dt.getTime())) return 'Invalid Date';
        const optionsDate = { year: 'numeric', month: 'short', day: 'numeric' };
        const optionsTime = { hour: 'numeric', minute: '2-digit', hour12: true };
        const datePart = dt.toLocaleDateString(undefined, optionsDate);
        const timePart = dt.toLocaleTimeString(undefined, optionsTime);
        return `${datePart}, ${timePart}`;
    } catch (e) {
        console.error(`Error formatting date "${isoString}":`, e);
        return 'Formatting Error';
    }
}

function atUriToBskyLink(atUri) {
    if (!atUri || !atUri.startsWith('at://')) return '#';
    const parts = atUri.substring(5).split('/');
    if (parts.length >= 3 && parts[1] === 'app.bsky.feed.post') {
        const identifier = parts[0];
        // No need to encode URI components for the link itself
        const rkey = parts[2];
        // Correctly construct URL - use identifier directly
        return `https://bsky.app/profile/${identifier}/post/${rkey}`;
    }
    return '#'; // Return '#' for invalid AT URIs
}

function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function displayBookmarks(bookmarks, currentCategoryView = null) {
    const elements = getElements();
    if (!elements.bookmarkList) return;
    elements.bookmarkList.innerHTML = ''; // Clear previous content

    if (bookmarks.length === 0) {
        elements.bookmarkList.innerHTML = '<p>No bookmarks found matching the criteria.</p>';
        return;
    }

    // Use DocumentFragment for better performance when adding many elements
    const fragment = document.createDocumentFragment();

    bookmarks.forEach(record => {
        if (!record?.uri || !record?.value?.uri) { console.warn("Skipping invalid record:", record); return; }
        const { value, uri: recordAtUri } = record;
        const postAtUri = value.uri;
        const category = value.category || 'Uncategorized';
        const createdAt = value.createdAt;
        const formattedDate = formatLocalDate(createdAt);
        const postLink = atUriToBskyLink(postAtUri);
        const rkey = recordAtUri.split('/').pop();

        const card = document.createElement('div');
        card.className = 'bookmark-card';
        card.dataset.rkey = rkey;
        card.dataset.postUri = postAtUri;
        card.dataset.category = category;
        card.dataset.createdAt = createdAt || '';
        try {
            card.dataset.record = JSON.stringify(record); // Store full record data
        } catch (e) {
            console.error("Failed to stringify record data for card dataset:", e, record);
            card.dataset.record = "{}"; // Add empty object as fallback
        }


        const categoryHtml = currentCategoryView === null
            ? `<span class="card-category">${escapeHtml(category)}</span>`
            : ''; // Don't show category badge when inside a category folder

        card.innerHTML = `
            <h4 class="record-key" title="Click to view bookmark details">${escapeHtml(rkey)}</h4>
            ${categoryHtml}
            <p><i class="ph-duotone ph-link"></i> <a href="${postLink}" target="_blank" rel="noopener noreferrer" class="post-link" title="View original post on Bluesky">${escapeHtml(postAtUri)}</a></p>
            <p class="timestamp">Saved on <time datetime="${createdAt || ''}">${escapeHtml(formattedDate)}</time></p>
            <div class="card-actions">
                <button class="edit-button">Edit</button>
                <button class="delete-button">Delete</button>
            </div>
        `;
        fragment.appendChild(card);
    });

    elements.bookmarkList.appendChild(fragment); // Append all cards at once
}

function displayFolders(groupedBookmarksData) {
    const elements = getElements();
    if (!elements.bookmarkList) return;
    elements.bookmarkList.innerHTML = ''; // Clear previous content

    const categories = Object.keys(groupedBookmarksData);

    if (categories.length === 0) {
        elements.bookmarkList.innerHTML = '<p>Add a post to start bookmarking.</p>';
        return;
    }

    // Sort categories alphabetically, case-insensitive
    categories.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    const fragment = document.createDocumentFragment();

    categories.forEach(category => {
        const groupData = groupedBookmarksData[category];
        const count = groupData.count;
        // Ensure latestTimestamp exists before formatting
        const latestTimestamp = groupData.latestTimestamp;
        const formattedLatestDate = latestTimestamp ? formatLocalDate(latestTimestamp) : 'N/A';

        const folderDiv = document.createElement('div');
        folderDiv.className = 'folder-item';
        folderDiv.dataset.category = category; // Store category name in dataset
        folderDiv.title = `View '${escapeHtml(category)}' (${count} posts)`; // Add tooltip

        folderDiv.innerHTML = `
            <i class="ph-duotone ph-folder-simple"></i>
            <div class="folder-info">
                 <span class="folder-name">${escapeHtml(category)}</span>
                 <span class="folder-timestamp">Last saved: ${escapeHtml(formattedLatestDate)}</span>
            </div>
            <span class="folder-count">${count}</span>
        `;
        fragment.appendChild(folderDiv);
    });

    elements.bookmarkList.appendChild(fragment); // Append all folders at once
}


function populateCategoryFilter(categories) {
    const elements = getElements();
    if (elements.categoryFilterSelect) {
        const currentValue = elements.categoryFilterSelect.value; // Preserve current selection if possible
        // Clear existing options except the first one ("All Categories")
        while (elements.categoryFilterSelect.options.length > 1) {
            elements.categoryFilterSelect.remove(1);
        }
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = escapeHtml(category);
            elements.categoryFilterSelect.appendChild(option);
        });
        // Try to restore previous selection or default to 'all'
        elements.categoryFilterSelect.value = categories.includes(currentValue) ? currentValue : 'all';
    }
}

function updateBreadcrumbs(currentCategory = null) {
    const elements = getElements();
    if (!elements.breadcrumbsContainer) return;

    elements.breadcrumbsContainer.innerHTML = ''; // Clear previous breadcrumbs

    // Add refresh button *linked* to the "Home" functionality
    const homeLink = document.createElement('a');
    homeLink.href = '#';
    homeLink.dataset.target = 'home';
    homeLink.className = 'breadcrumb-home-link';
    homeLink.title = 'Go Home / Refresh';
    homeLink.innerHTML = '<i class="ph-fill ph-house"></i> Home'; // Icon and text
    elements.breadcrumbsContainer.appendChild(homeLink);

    if (currentCategory) {
        // Separator
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-separator';
        separator.textContent = '>';
        elements.breadcrumbsContainer.appendChild(separator);

        // Current Category (not a link)
        const categorySpan = document.createElement('span');
        categorySpan.className = 'breadcrumb-current';
        categorySpan.textContent = escapeHtml(currentCategory);
        elements.breadcrumbsContainer.appendChild(categorySpan);
    }

    // No separate refresh button needed - integrated into Home link
    // The event listener in script.js attached to the breadcrumbsContainer
    // will handle clicks on the homeLink.
}

function updateViewToggleButtons(activeView, viewingFolderContent = false) {
    const elements = getElements();
    if (activeView === 'list') {
        if (elements.listViewButton) elements.listViewButton.classList.add(ACTIVE_CLASS);
        if (elements.folderViewButton) elements.folderViewButton.classList.remove(ACTIVE_CLASS);
        if (elements.listControls) elements.listControls.classList.remove(HIDDEN_CLASS);
        if (elements.sortButton) elements.sortButton.classList.remove(HIDDEN_CLASS);
    } else { // Folder view
        if (elements.listViewButton) elements.listViewButton.classList.remove(ACTIVE_CLASS);
        if (elements.folderViewButton) elements.folderViewButton.classList.add(ACTIVE_CLASS);
        if (elements.listControls) elements.listControls.classList.add(HIDDEN_CLASS);
        if (elements.sortButton) {
            // Show sort button only when viewing the *contents* of a folder
            elements.sortButton.classList.toggle(HIDDEN_CLASS, !viewingFolderContent);
        }
    }
}


// --- Modal Handling ---
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove(HIDDEN_CLASS);
        // Focus the first focusable element within the modal
        const firstFocusable = modal.querySelector(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (firstFocusable) {
            setTimeout(() => firstFocusable.focus(), 50); // Timeout helps ensure element is visible
        }
        // Prevent background scrolling
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add(HIDDEN_CLASS);
        const form = modal.querySelector('form');
        // Reset form only if it exists and is not the delete/logout confirmation
        if (form && modalId !== 'delete-confirm-modal' && modalId !== 'logout-confirm-modal') {
            form.reset();
        }

        // Reset specific fields/states if needed (e.g., validation status)
        if (modalId === 'add-modal') {
            const validationStatus = document.getElementById('link-validation-status');
            if (validationStatus) validationStatus.innerHTML = '';
            const submitButton = document.getElementById('add-bookmark-submit-button');
            if (submitButton) submitButton.disabled = true;
        }

        // Check if any other modals are open before restoring scrolling
        const openModals = document.querySelectorAll('.modal:not(.hidden)');
        if (openModals.length === 0) {
            document.body.style.overflow = ''; // Restore scrolling
        }
    }
}

// Add event listeners to close buttons defined within modals in HTML
document.querySelectorAll('.close-button[data-modal-id]').forEach(button => {
    button.addEventListener('click', () => {
        const modalId = button.dataset.modalId;
        if (modalId) closeModal(modalId);
    });
});

// Add listener for clicking outside the modal content (on the overlay)
window.addEventListener('click', (event) => {
    // Check if the click target is a modal overlay itself
    if (event.target.classList.contains('modal')) {
        // Close the modal by its ID
        closeModal(event.target.id);
    }
});


// Specific Modal Open/Close Functions
function openAddModal() {
    // Reset category select visibility based on if we have categories
    const categorySelectGroup = document.getElementById('category-select-group');
    const categorySelect = document.getElementById('category-select');
    const newCategoryInput = document.getElementById('new-category');

    if (categorySelectGroup && categorySelect && newCategoryInput) {
        // If the dropdown has more than 2 options (default + other)
        if (categorySelect.options.length > 2) {
            categorySelectGroup.classList.remove(HIDDEN_CLASS);

            // Reset selection and category input state
            categorySelect.value = '';
            newCategoryInput.disabled = false;
            newCategoryInput.setAttribute('required', 'required');
            newCategoryInput.value = '';
        } else {
            categorySelectGroup.classList.add(HIDDEN_CLASS);
        }
    }

    openModal('add-modal');
}

function openEditModal(rkey, postUri, currentCategory, createdAt) {
    // Get references to elements
    const editPostUriElement = document.getElementById('edit-post-uri');
    const editRkeyInputElement = document.getElementById('edit-rkey');
    const editCategoryInputElement = document.getElementById('edit-category');
    const editCreatedAtInputElement = document.getElementById('edit-created-at');
    const editOriginalUriInputElement = document.getElementById('edit-original-uri');
    const editCategorySelectElement = document.getElementById('edit-category-select');
    const editCategorySelectGroupElement = document.getElementById('edit-category-select-group');

    // Set the post URI with clickable link
    if (editPostUriElement) {
        const postLink = atUriToBskyLink(postUri);
        editPostUriElement.href = postLink;
        editPostUriElement.textContent = postUri;
    }

    // Set values for hidden inputs
    if (editRkeyInputElement) editRkeyInputElement.value = rkey;
    if (editCreatedAtInputElement) editCreatedAtInputElement.value = createdAt || '';
    if (editOriginalUriInputElement) editOriginalUriInputElement.value = postUri || '';

    // Get all categories (assuming we can access groupedBookmarks from window)
    const categories = window.groupedBookmarks ? Object.keys(window.groupedBookmarks) : [];

    // Set up category dropdown
    if (editCategorySelectElement && editCategorySelectGroupElement) {
        // Clear existing options except first two (default and 'Other')
        while (editCategorySelectElement.options.length > 2) {
            editCategorySelectElement.remove(2);
        }

        if (categories && categories.length > 0) {
            // Add categories to dropdown
            categories.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
                .forEach(category => {
                    const option = document.createElement('option');
                    option.value = category;
                    option.textContent = category;
                    editCategorySelectElement.appendChild(option);
                });

            // Show the dropdown
            editCategorySelectGroupElement.classList.remove('hidden');

            // Set the current category as selected
            if (currentCategory) {
                const existingOption = Array.from(editCategorySelectElement.options)
                    .find(option => option.value === currentCategory);

                if (existingOption) {
                    // Category exists in the dropdown, select it
                    editCategorySelectElement.value = currentCategory;
                    editCategoryInputElement.value = currentCategory;
                    editCategoryInputElement.disabled = true;
                } else {
                    // Category doesn't exist in dropdown
                    editCategorySelectElement.value = 'other';
                    editCategoryInputElement.value = currentCategory;
                    editCategoryInputElement.disabled = false;
                }
            }
        } else {
            // No categories available, hide dropdown
            editCategorySelectGroupElement.classList.add('hidden');
            if (editCategoryInputElement) editCategoryInputElement.value = currentCategory;
        }
    } else if (editCategoryInputElement) {
        // If dropdown doesn't exist, just set the value directly
        editCategoryInputElement.value = currentCategory;
    }

    // Add event listener for category select dropdown
    const editCategorySelect = document.getElementById('edit-category-select');
    if (editCategorySelect) {
        // Remove any existing listeners to avoid duplicates
        const newEditCategorySelect = editCategorySelect.cloneNode(true);
        if (editCategorySelect.parentNode) {
            editCategorySelect.parentNode.replaceChild(newEditCategorySelect, editCategorySelect);
        }

        // Add the event listener
        newEditCategorySelect.addEventListener('change', function () {
            const categoryInput = document.getElementById('edit-category');
            if (!categoryInput) return;

            if (this.value === 'other' || this.value === '') {
                // Show input field and clear it if "Other" is selected
                categoryInput.value = this.value === '' ? '' : categoryInput.value;
                categoryInput.disabled = false;
                categoryInput.setAttribute('required', 'required');
            } else {
                // Use selected category
                categoryInput.value = this.value;
                categoryInput.disabled = true;
            }
        });
    }

    openModal('edit-modal');
}
function openLogoutModal() { openModal('logout-confirm-modal'); }

// These specific close functions just call the generic one
function closeAddModal() { closeModal('add-modal'); }
function closeEditModal() { closeModal('edit-modal'); }
function closeLogoutModal() { closeModal('logout-confirm-modal'); }


// Add a new function to show bookmark details in a modal
function showBookmarkDetailsModal(record) {
    if (!record) return;
    const detailsContentElement = document.getElementById('details-content');
    if (detailsContentElement) {
        try {
            // Format JSON with 2 spaces indentation
            const jsonFormatted = JSON.stringify(record, null, 2);
            detailsContentElement.textContent = jsonFormatted; // Use textContent for safety
            openModal('details-modal');
        } catch (e) {
            console.error("Failed to stringify record for details view:", e);
            detailsContentElement.textContent = "Error displaying bookmark data.";
            openModal('details-modal');
        }
    }
}

// Export bookmarks function (logic moved here from script.js for better organization)
function exportBookmarks(bookmarks) {
    if (!bookmarks || bookmarks.length === 0) {
        showMessage("No bookmarks to export.", "info"); // Use info level
        return;
    }

    try {
        // Create a JSON string with indentation
        const bookmarksJson = JSON.stringify(bookmarks, null, 2);
        // Create a blob with the JSON data
        const blob = new Blob([bookmarksJson], { type: 'application/json;charset=utf-8' });
        // Create a download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        // Get current date for filename
        const dateStr = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `bluesky-bookmarks-${dateStr}.json`;
        a.style.display = 'none'; // Hide the link
        // Add to DOM, trigger click, and remove
        document.body.appendChild(a);
        a.click();
        // Cleanup
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log("Export download initiated.");
            showMessage("Bookmarks exported successfully.", "info"); // Use info level
        }, 100);

    } catch (error) {
        console.error("Error during bookmark export:", error);
        showMessage(`Export failed: ${error.message}`, "error");
    }
}

// Add a function to open export modal
function openExportModal() {
    openModal('export-modal');
}

// Add a function to close export modal (just calls generic)
function closeExportModal() {
    closeModal('export-modal');
}

// Updated delete confirmation modal function
function openDeleteConfirmModal(rkey) {
    const deleteModal = document.getElementById('delete-confirm-modal');
    const deleteRkeySpan = document.getElementById('delete-rkey');

    if (deleteRkeySpan) {
        deleteRkeySpan.textContent = rkey; // Set the RKEY in the modal
    }

    // The actual delete logic is now stored in script.js's `handleActualDelete`
    // and triggered by the 'Yes' button's event listener in script.js.
    // We just need to open the modal here.
    openModal('delete-confirm-modal');
}

// Add this new function somewhere appropriate (with the other UI functions)
function populateCategorySelect(categories) {
    const categorySelect = document.getElementById('category-select');
    const categorySelectGroup = document.getElementById('category-select-group');

    if (!categorySelect) return;

    // Clear existing options except first two (default and 'Other')
    while (categorySelect.options.length > 2) {
        categorySelect.remove(2);
    }

    // If no categories, keep the dropdown hidden
    if (!categories || categories.length === 0) {
        if (categorySelectGroup) categorySelectGroup.classList.add(HIDDEN_CLASS);
        return;
    }

    // Add categories to dropdown
    categories.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
        .forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        });

    // Show the dropdown
    if (categorySelectGroup) categorySelectGroup.classList.remove(HIDDEN_CLASS);
}

// Add this function to handle Escape key
function handleEscapeKey(event) {
    if (event.key === 'Escape') {
        const openModals = document.querySelectorAll('.modal:not(.hidden)');
        if (openModals.length > 0) {
            closeModal(openModals[0].id);
        }
    }
}

// Add this function to handle back navigation
function handleBackNavigation() {
    const openModals = document.querySelectorAll('.modal:not(.hidden)');
    if (openModals.length > 0) {
        closeModal(openModals[0].id);
    }
}

// Add these event listeners in the initialization
export function setupModalListeners() {
    // Escape key listener
    document.addEventListener('keydown', handleEscapeKey);

    // Back navigation listener
    window.addEventListener('popstate', handleBackNavigation);
}

// Call setupModalListeners in the initialize function
async function initialize() {
    // ... existing code ...
    setupModalListeners();
    // ... existing code ...
}

// ***** START FIX *****
// Ensure the generic closeModal function is exported
export {
    // State Management
    showLogin, showBookmarksUI, setLoading,
    // Messaging
    showMessage, clearMessage,
    // Rendering
    displayBookmarks, clearBookmarks, displayFolders,
    // Controls/Filters
    populateCategoryFilter,
    updateCounts,
    updateBreadcrumbs, updateViewToggleButtons,
    // Generic Modal Control (EXPORT THIS)
    openModal, closeModal,
    // Specific Modal Openers/Closers
    openAddModal, closeAddModal, openEditModal, closeEditModal,
    openLogoutModal, closeLogoutModal,
    // New export functions
    openExportModal, closeExportModal, exportBookmarks,
    // New details modal
    showBookmarkDetailsModal,
    // New delete confirmation
    openDeleteConfirmModal,
    // Utilities
    escapeHtml,
    formatLocalDate,
    // Helper
    getElements,
    populateCategorySelect
};
// ***** END FIX *****