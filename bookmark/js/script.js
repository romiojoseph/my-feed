// js/script.js
import { login, logout as authLogout, getSession, refreshSession, setupAutoRefresh } from './auth.js'; // Rename logout to authLogout
import blueskyApi from './blueskyApi.js';
import {
    showLogin, showBookmarksUI, setLoading, showMessage, clearMessage,
    displayBookmarks, clearBookmarks, populateCategoryFilter,
    openAddModal, closeModal, openEditModal, closeEditModal,
    openLogoutModal, closeLogoutModal,
    displayFolders, updateBreadcrumbs, updateViewToggleButtons,
    updateCounts, escapeHtml, formatLocalDate,
    openExportModal, closeExportModal, exportBookmarks,
    showBookmarkDetailsModal,
    openDeleteConfirmModal,
    getElements,
    populateCategorySelect,
    setupModalListeners
} from './ui.js';

// --- DOM Elements ---
let elements;

// --- App State ---
let currentUserSession = null;
let allBookmarks = [];
let groupedBookmarks = {};
let currentView = 'folder';
let currentCategoryView = null;
let currentSortOrder = 'newest';
let selectedCategoryFilter = 'all';
// State for Add Modal validation
let validatedPostUri = null;
let isDuplicate = false;
let duplicateDetails = null;
// Global variable to store the callback for delete confirmation
let handleActualDelete = null;

// --- Initialize DOM Elements ---
function initializeElements() {
    elements = getElements();
}

// --- Utility ---
async function convertToAtUri(url) {
    // ... (keep existing convertToAtUri content - it handles errors) ...
    const atUriRegex = /^(at:\/\/(?:did:[a-z0-9:]+|[a-zA-Z0-9.-]+)\/app\.bsky\.feed\.post\/[a-zA-Z0-9]+)/;
    const atUriMatch = url.match(atUriRegex);
    if (atUriMatch) {
        return atUriMatch[1];
    }

    const bskyUrlRegex = /bsky\.app\/profile\/([^/ >?]+)\/post\/([a-zA-Z0-9]+)/;
    const bskyUrlMatch = url.match(bskyUrlRegex);
    if (bskyUrlMatch) {
        const identifier = bskyUrlMatch[1];
        const rkey = bskyUrlMatch[2];
        let did;

        if (identifier.startsWith('did:')) {
            did = identifier;
        } else {
            try {
                // Use resolveHandle which attempts refresh on 401
                const resolveData = await blueskyApi.resolveHandle(identifier);
                did = resolveData?.did;
                if (!did) throw new Error(`Failed resolve handle '${identifier}'`);
            } catch (error) {
                console.error(`Failed handle resolve '${identifier}':`, error);
                // Check for session expiry during handle resolution
                if (error.message.includes("Session refresh failed")) {
                    // Use a more specific message if possible
                    handleLogout('Your session expired. Please log in again.');
                    // Re-throw a different error or handle differently if needed,
                    // but for now, logging out is the main goal.
                }
                // Rethrow the original error or a user-friendly one
                throw new Error(`Could not resolve handle: ${identifier}. Reason: ${error.message}`);
            }
        }

        return `at://${did}/app.bsky.feed.post/${rkey}`;
    }

    throw new Error("Invalid Bluesky link format. Use https://bsky.app/... or at://...");
}

function groupBookmarksByCategory(bookmarks) {
    // ... (keep existing groupBookmarksByCategory content) ...
    const groups = {};
    bookmarks.forEach(record => {
        if (record?.value?.uri && record.value.createdAt) {
            const category = record.value.category || 'Uncategorized';
            const createdAt = record.value.createdAt;

            if (!groups[category]) {
                groups[category] = { bookmarks: [], count: 0, latestTimestamp: null };
            }

            groups[category].bookmarks.push(record);
            groups[category].count++;

            const currentLatest = groups[category].latestTimestamp;
            if (!currentLatest || new Date(createdAt) > new Date(currentLatest)) {
                groups[category].latestTimestamp = createdAt;
            }
        } else {
            // console.warn("Skipping invalid record structure during grouping:", record);
        }
    });
    return groups;
}

// --- Core Rendering Logic ---
function renderCurrentView() {
    // ... (keep existing renderCurrentView content) ...
    setLoading(true, 'Rendering...');
    updateViewToggleButtons(currentView, !!currentCategoryView);
    updateBreadcrumbs(currentCategoryView);

    if (elements.sortButton) {
        elements.sortButton.classList.toggle('hidden', !(currentView === 'list' || currentCategoryView));
    }

    if (currentView === 'list') {
        const filteredBookmarks = selectedCategoryFilter === 'all'
            ? allBookmarks
            : allBookmarks.filter(record => record.value?.category === selectedCategoryFilter);

        const sortedBookmarks = [...filteredBookmarks].sort((a, b) => {
            const dateA = a.value?.createdAt ? new Date(a.value.createdAt).getTime() : 0;
            const dateB = b.value?.createdAt ? new Date(b.value.createdAt).getTime() : 0;
            return currentSortOrder === 'newest' ? dateB - dateA : dateA - dateB;
        });

        displayBookmarks(sortedBookmarks, null);
    }
    else { // folder view
        if (currentCategoryView === null) {
            displayFolders(groupedBookmarks);
        }
        else {
            const groupData = groupedBookmarks[currentCategoryView];
            const bookmarksInFolder = groupData ? groupData.bookmarks : [];
            const sortedBookmarksInFolder = [...bookmarksInFolder].sort((a, b) => {
                const dateA = a.value?.createdAt ? new Date(a.value.createdAt).getTime() : 0;
                const dateB = b.value?.createdAt ? new Date(b.value.createdAt).getTime() : 0;
                return currentSortOrder === 'newest' ? dateB - dateA : dateA - dateB;
            });

            displayBookmarks(sortedBookmarksInFolder, currentCategoryView);
        }
    }
    setLoading(false);
}

// --- Core Data Fetching & Processing ---
async function loadAndProcessBookmarks(forceRefresh = false) {
    // If session is already null, don't proceed (handleLogout should set it)
    if (!currentUserSession?.did) {
        console.log("loadAndProcessBookmarks skipped: No valid currentUserSession.");
        // Ensure UI reflects logged-out state if somehow called in this state
        if (!document.getElementById('login-section') || document.getElementById('login-section').classList.contains('hidden')) {
            handleLogout("Please log in to view bookmarks."); // Force logout UI state
        }
        return;
    }

    if (forceRefresh || allBookmarks.length === 0) {
        setLoading(true, 'Fetching bookmarks...');
    }

    clearMessage();

    try {
        // This call will trigger refreshSession via fetchWithAuth if needed
        allBookmarks = await blueskyApi.listAllRecords(blueskyApi.BOOKMARK_COLLECTION, currentUserSession.did);

        // If the call succeeded, process the data
        groupedBookmarks = groupBookmarksByCategory(allBookmarks);
        const totalPostCount = allBookmarks.length;
        const categoryCount = Object.keys(groupedBookmarks).length;
        updateCounts(totalPostCount, categoryCount);
        const categories = Object.keys(groupedBookmarks).sort((a, b) =>
            a.toLowerCase().localeCompare(b.toLowerCase()));
        populateCategoryFilter(categories);
        if (elements.categoryFilterSelect) {
            elements.categoryFilterSelect.value = selectedCategoryFilter;
        }
        renderCurrentView();

    } catch (error) {
        console.error("Failed load/process bookmarks:", error);
        // ** CRITICAL FIX **: Check the error message robustly
        // If fetchWithAuth failed due to an unrecoverable auth issue (401 + failed refresh),
        // the error message will contain "Session refresh failed".
        if (error.message.includes("Session refresh failed")) {
            // Immediately trigger logout UI and state reset
            handleLogout('Your session expired while loading bookmarks. Please log in again.');
        } else {
            // Handle other errors (network, API rate limit, invalid DID in listRecords, etc.)
            showMessage(`Error loading bookmarks: ${error.message}`, 'error');
            clearBookmarks(); // Clear display on other errors
            updateCounts(0, 0);
            // Keep the user logged in UI-wise for non-auth errors, allowing retry
        }
    } finally {
        setLoading(false);
    }
}

// --- Event Handlers ---
async function handleLogin(event) {
    // ... (keep existing handleLogin content - it passes handleLogout correctly) ...
    event.preventDefault();
    setLoading(true, 'Logging in...');
    clearMessage();

    const loginForm = document.getElementById('login-form');
    if (!loginForm) {
        setLoading(false);
        showMessage("Login form not found.", "error");
        return;
    }

    const identifier = loginForm.elements.identifier.value.trim();
    const password = loginForm.elements['app-password'].value;

    if (!identifier || !password) {
        showMessage("Handle/email and App Password required.", "error");
        setLoading(false);
        return;
    }

    try {
        currentUserSession = await login(identifier, password, blueskyApi);

        loginForm.elements['app-password'].value = ''; // Clear password field

        if (currentUserSession) {
            showBookmarksUI(currentUserSession.displayName);
            currentView = 'folder';
            currentCategoryView = null;
            selectedCategoryFilter = 'all';
            currentSortOrder = 'newest';

            // --- Pass handleLogout to setupAutoRefresh ---
            setupAutoRefresh(blueskyApi, handleLogout); // Pass the script.js handleLogout

            await loadAndProcessBookmarks(true);
        } else {
            // Should not happen if login throws error on fail, but handle defensively
            showLogin();
            showMessage("Login failed. Please check credentials.", "error");
        }
    } catch (error) {
        loginForm.elements['app-password'].value = ''; // Clear password field on error too
        showMessage(`Login failed: ${error.message}`, 'error');
        showLogin(); // Ensure login UI is shown
        currentUserSession = null; // Clear session state
    } finally {
        setLoading(false);
    }
}

// --- Modified handleLogout ---
function handleLogout(message = "You have been logged out.") {
    console.log("handleLogout called in script.js with message:", message);
    // Prevent multiple rapid calls if errors trigger quickly
    if (!currentUserSession && !localStorage.getItem('blueskySession')) {
        console.log("handleLogout skipped: Already logged out.");
        return;
    }

    // Call the logout function from auth.js first to clear storage & timer
    authLogout(); // Use the renamed import

    // Reset application state IMMEDIATELY
    currentUserSession = null;
    allBookmarks = [];
    groupedBookmarks = {};
    currentView = 'folder';
    currentCategoryView = null;
    selectedCategoryFilter = 'all';
    currentSortOrder = 'newest';
    validatedPostUri = null;
    isDuplicate = false;
    duplicateDetails = null;
    handleActualDelete = null;

    // Update UI
    showLogin(); // Show the login form and HIDE bookmark elements
    clearBookmarks(); // Clear bookmark list display
    updateCounts(0, 0); // Reset counts

    // Make sure modals are closed
    closeModal('add-modal');
    closeModal('edit-modal');
    closeModal('delete-confirm-modal');
    closeModal('export-modal');
    closeModal('details-modal');
    closeModal('logout-confirm-modal');

    // Show the message AFTER UI is updated
    showMessage(message, message.toLowerCase().includes("expired") || message.toLowerCase().includes("error") ? "error" : "info");
}


async function handlePostLinkBlur() {
    // ... (keep existing handlePostLinkBlur - convertToAtUri handles its logout) ...
    const postLinkInput = document.getElementById('post-link');
    const linkValidationStatus = document.getElementById('link-validation-status');
    const addBookmarkSubmitButton = document.getElementById('add-bookmark-submit-button');

    if (!postLinkInput || !linkValidationStatus || !addBookmarkSubmitButton) { return; }

    const postLink = postLinkInput.value.trim();
    linkValidationStatus.innerHTML = '';
    linkValidationStatus.className = 'validation-status';
    addBookmarkSubmitButton.disabled = true;
    validatedPostUri = null;
    isDuplicate = false;
    duplicateDetails = null;

    if (!postLink) return;

    linkValidationStatus.innerHTML = `<i class="ph-duotone ph-spinner"></i> Validating...`;
    linkValidationStatus.classList.add('checking');

    try {
        // Check local duplicate first (doesn't require auth)
        const existingBookmark = allBookmarks.find(record => record.value?.uri === postLink); // Simple check first
        let canonicalUri = postLink; // Assume input is canonical initially

        // Attempt conversion (this might require auth if it's a handle)
        // Wrap conversion in its own try-catch to handle its specific errors
        try {
            canonicalUri = await convertToAtUri(postLink);
            console.log("Converted to AT-URI:", canonicalUri);
        } catch (conversionError) {
            // If conversion fails (e.g., bad format, handle resolution failure), re-throw
            // If session expired during conversion, handleLogout was already called.
            throw conversionError;
        }


        // If conversion succeeded, check for duplicates again using the canonical URI
        const existingBookmarkCanonical = allBookmarks.find(record => record.value?.uri === canonicalUri);
        if (existingBookmarkCanonical) {
            isDuplicate = true;
            duplicateDetails = {
                category: existingBookmarkCanonical.value.category || 'Uncategorized',
                date: formatLocalDate(existingBookmarkCanonical.value.createdAt)
            };
            console.log("Duplicate found locally (canonical):", duplicateDetails);
        } else if (existingBookmark) { // If duplicate found via initial non-canonical check
            isDuplicate = true; // Keep duplicate flag
            duplicateDetails = {
                category: existingBookmark.value.category || 'Uncategorized',
                date: formatLocalDate(existingBookmark.value.createdAt)
            };
            console.log("Duplicate found locally (non-canonical input match):", duplicateDetails);
        }


        // Validate the post exists via API using the canonical URI
        console.log("Validating post existence via API...");
        const validationResult = await blueskyApi.getPosts([canonicalUri]); // Use canonicalUri

        // Check if the session expired *during* the getPosts call
        // Note: getPosts itself might not throw "Session refresh failed" as clearly
        // as other calls if it uses a different internal fetch mechanism in blueskyApi.js.
        // We rely on the fact that if the session *was* invalid, currentUserSession would be null now.
        if (!currentUserSession) {
            console.warn("Session appears to have expired during getPosts validation.");
            // handleLogout should have already been called by the underlying fetch mechanism
            // We might just need to ensure the modal closes cleanly.
            closeModal('add-modal');
            return; // Stop further processing in this handler
        }

        if (!validationResult?.posts?.length || validationResult.posts[0]?.uri !== canonicalUri) {
            throw new Error("Post not found or invalid URI.");
        }
        console.log("Post validated successfully via API.");

        // Update UI based on validation and duplicate check
        validatedPostUri = canonicalUri; // Store the canonical URI
        addBookmarkSubmitButton.disabled = false; // Enable submit

        let statusHTML = `<div><i class="ph-fill ph-seal-check"></i> Post Found!</div>`;
        if (isDuplicate) {
            statusHTML += `<span class="duplicate-details">Already saved in '${escapeHtml(duplicateDetails.category)}' on ${escapeHtml(duplicateDetails.date)}</span>`;
            linkValidationStatus.classList.add('warning');
        } else {
            linkValidationStatus.classList.add('valid');
        }
        linkValidationStatus.innerHTML = statusHTML;

    } catch (error) {
        console.error("Link validation failed:", error);
        // Check if handleLogout was called (e.g., during convertToAtUri)
        const sessionExpired = error.message.includes("Session refresh failed") || !currentUserSession;

        if (!sessionExpired) {
            linkValidationStatus.innerHTML = `<i class="ph-fill ph-x-circle"></i> Error: ${escapeHtml(error.message)}`;
            linkValidationStatus.classList.add('invalid');
        } else {
            linkValidationStatus.innerHTML = ''; // Clear validation status if session expired
            if (!document.getElementById('add-modal').classList.contains('hidden')) {
                closeModal('add-modal'); // Close add modal if it's open
            }
        }
        addBookmarkSubmitButton.disabled = true;
        validatedPostUri = null;
        isDuplicate = false;
        duplicateDetails = null;
    } finally {
        linkValidationStatus.classList.remove('checking');
    }
}


async function handleAddBookmarkSubmit(event) {
    // ... (keep existing handleAddBookmarkSubmit - it calls handleLogout correctly) ...
    event.preventDefault();
    if (!currentUserSession?.did) { handleLogout("Action failed: Not logged in."); return; } // Defensive check

    const addBookmarkForm = document.getElementById('add-bookmark-form');
    if (!addBookmarkForm) { showMessage("Form not found.", "error"); return; }

    const postAtUri = validatedPostUri;
    const category = addBookmarkForm.elements['new-category'].value.trim();

    if (!postAtUri) { showMessage("Please enter and validate a Bluesky post link first.", "error"); addBookmarkForm.elements['post-link']?.focus(); return; }
    if (!category) { showMessage("Please enter a category.", "error"); addBookmarkForm.elements['new-category']?.focus(); return; }

    clearMessage();

    if (isDuplicate && duplicateDetails) {
        const warningMsg = `⚠️ This post was already saved!\n\nCategory: ${escapeHtml(duplicateDetails.category)}\nSaved: ${escapeHtml(duplicateDetails.date)}\n\nSave it again with the new category '${escapeHtml(category)}'?`;
        if (!confirm(warningMsg)) { showMessage("Save cancelled.", 'info'); return; }
    }

    setLoading(true, 'Saving bookmark...');

    try {
        const recordData = {
            $type: blueskyApi.BOOKMARK_COLLECTION,
            uri: postAtUri, category: category, createdAt: new Date().toISOString()
        };
        await blueskyApi.createRecord(recordData, currentUserSession.did);
        showMessage(`Bookmark added (Category: ${escapeHtml(category)})`, 'info');
        closeModal('add-modal');
        await loadAndProcessBookmarks(true);
    } catch (error) {
        console.error("Failed to add bookmark:", error);
        if (error.message.includes("Session refresh failed")) {
            // Use handleLogout for consistent UI update and state reset
            handleLogout('Your session expired while adding bookmark. Please log in again.');
            // No need to close modal here, handleLogout does it
        } else if (error.message?.includes('Record already exists') || error.message?.includes('ConstraintViolation')) {
            const conflictingBookmark = allBookmarks.find(b => b.value?.uri === postAtUri);
            let conflictMsg = "Failed: Post already bookmarked (server conflict).";
            if (conflictingBookmark) {
                conflictMsg = `Failed: Post already saved in '${escapeHtml(conflictingBookmark.value.category || 'Uncategorized')}' on ${escapeHtml(formatLocalDate(conflictingBookmark.value.createdAt))}. (Server conflict)`;
            }
            showMessage(conflictMsg, 'error');
            await loadAndProcessBookmarks(true); // Refresh local state
        } else {
            showMessage(`Error adding: ${escapeHtml(error.message)}`, 'error');
        }
    } finally {
        setLoading(false);
    }
}

async function handleDeleteBookmark(rkey) {
    // ... (keep existing handleDeleteBookmark - it calls handleLogout correctly) ...
    if (!currentUserSession?.did) { handleLogout("Action failed: Not logged in."); return; }
    if (!rkey) { showMessage("Error: Missing bookmark ID for delete.", "error"); return; }

    const performDelete = async (confirmedRkey) => {
        setLoading(true, 'Deleting bookmark...');
        clearMessage();
        try {
            await blueskyApi.deleteRecord(confirmedRkey, currentUserSession.did);
            showMessage("Bookmark deleted.", "info");
            allBookmarks = allBookmarks.filter(record => record.uri.split('/').pop() !== confirmedRkey);
            groupedBookmarks = groupBookmarksByCategory(allBookmarks);
            updateCounts(allBookmarks.length, Object.keys(groupedBookmarks).length);
            renderCurrentView();
        } catch (error) {
            console.error("Failed to delete bookmark:", error);
            if (error.message.includes("Session refresh failed")) {
                handleLogout('Your session expired while deleting bookmark. Please log in again.');
            } else {
                showMessage(`Error deleting: ${escapeHtml(error.message)}`, 'error');
                await loadAndProcessBookmarks(true); // Force reload on unexpected errors
            }
        } finally {
            setLoading(false);
            handleActualDelete = null;
        }
    };
    handleActualDelete = performDelete;
    openDeleteConfirmModal(rkey);
}

async function handleEditBookmarkSubmit(event) {
    // ... (keep existing handleEditBookmarkSubmit - it calls handleLogout correctly) ...
    event.preventDefault();
    if (!currentUserSession?.did) { handleLogout("Action failed: Not logged in."); return; }

    const editBookmarkForm = document.getElementById('edit-bookmark-form');
    if (!editBookmarkForm) { showMessage("Form not found.", "error"); return; }

    const rkey = editBookmarkForm.elements['edit-rkey'].value;
    const newCategory = editBookmarkForm.elements['edit-category'].value.trim();
    const createdAt = editBookmarkForm.elements['edit-created-at'].value;
    const originalUri = editBookmarkForm.elements['edit-original-uri'].value;

    if (!rkey || !newCategory || !createdAt || !originalUri) {
        showMessage("Error: Missing edit data.", "error");
        closeEditModal(); return;
    }

    setLoading(true, 'Updating bookmark...');
    clearMessage();
    closeEditModal();

    try {
        const updatedRecordData = {
            $type: blueskyApi.BOOKMARK_COLLECTION,
            uri: originalUri, category: newCategory, createdAt: createdAt
        };
        await blueskyApi.putRecord(rkey, updatedRecordData, currentUserSession.did);
        showMessage("Bookmark updated.", "info");
        await loadAndProcessBookmarks(true);
    } catch (error) {
        console.error("Failed to update bookmark:", error);
        if (error.message.includes("Session refresh failed")) {
            handleLogout('Your session expired while updating bookmark. Please log in again.');
        } else {
            showMessage(`Error updating: ${escapeHtml(error.message)}`, 'error');
            await loadAndProcessBookmarks(true);
        }
    } finally {
        setLoading(false);
    }
}

// --- Other handlers (handleSortToggle, handleCategoryFilterChange, etc.) ---
// ... (keep existing handlers) ...
function handleSortToggle() {
    currentSortOrder = currentSortOrder === 'newest' ? 'oldest' : 'newest';
    if (elements.sortButton) {
        elements.sortButton.innerHTML = currentSortOrder === 'newest' ? '<i class="ph ph-sort-descending"></i> Sort' : '<i class="ph ph-sort-ascending"></i> Sort';
        elements.sortButton.title = currentSortOrder === 'newest' ? 'Sort Oldest First' : 'Sort Newest First';
    }
    renderCurrentView();
}
function handleCategoryFilterChange() {
    if (elements.categoryFilterSelect) {
        selectedCategoryFilter = elements.categoryFilterSelect.value;
        if (currentView === 'list') { renderCurrentView(); }
    }
}
function handleViewToggle(view) {
    if (view !== currentView) {
        currentView = view;
        if (view === 'folder') { currentCategoryView = null; }
        renderCurrentView();
    }
}
function handleBreadcrumbClick(event) {
    const target = event.target.closest('a');
    if (target && target.dataset.target === 'home') {
        event.preventDefault();
        console.log("Breadcrumb 'Home' clicked");
        currentCategoryView = null;
        selectedCategoryFilter = 'all';
        if (elements.categoryFilterSelect) { elements.categoryFilterSelect.value = 'all'; }
        if (currentView === 'list') {
            renderCurrentView();
        } else {
            currentView = 'folder';
            loadAndProcessBookmarks(true); // Reload triggers render
        }
        // Update history state when going home via breadcrumb
        history.replaceState('home', '', window.location.pathname + window.location.search);
    }
}
function handleExportBookmarks() {
    closeModal('export-modal');
    if (allBookmarks.length === 0) { showMessage("No bookmarks to export.", "info"); return; }
    try { exportBookmarks(allBookmarks); } catch (error) { showMessage(`Export failed: ${error.message}`, "error"); console.error("Export error:", error); }
}
function setupBackButtonSupport() {
    // ... (keep existing setupBackButtonSupport) ...
    const initialState = currentCategoryView ? 'category' : 'home';
    const initialHash = currentCategoryView ? '#category' : '';
    history.replaceState(initialState, '', window.location.pathname + window.location.search + initialHash);
    console.log("Initial history state set:", initialState);

    window.addEventListener('popstate', (event) => {
        const state = event.state || 'home'; // Default to 'home' if state is null
        console.log("Popstate event, state:", state);

        if (currentView === 'folder') { // Only manage back/forward within folder view
            if (state === 'home' && currentCategoryView) {
                console.log("Navigating back to folder home view");
                currentCategoryView = null;
                renderCurrentView();
            } else if (state === 'category' && !currentCategoryView) {
                // This scenario is less likely unless user manually manipulates history
                console.warn("Popstate to 'category' but no category view active. Going home.");
                currentCategoryView = null; // Ensure consistency
                renderCurrentView();
                history.replaceState('home', '', window.location.pathname + window.location.search); // Correct state
            } else {
                console.log("Popstate: No folder view change needed or state unknown:", state);
            }
        } else {
            console.log("Popstate ignored in list view.");
        }
    });
}

// --- Setup Event Listeners ---
function setupEventListeners() {
    // ... (keep existing setupEventListeners - it relies on handleLogout now) ...
    initializeElements();

    const loginForm = document.getElementById('login-form');
    if (loginForm) { loginForm.addEventListener('submit', handleLogin); }

    if (elements.userProfileTrigger) { elements.userProfileTrigger.addEventListener('click', openLogoutModal); }

    const confirmLogoutYesButton = document.getElementById('confirm-logout-yes');
    if (confirmLogoutYesButton) { confirmLogoutYesButton.addEventListener('click', () => { closeLogoutModal(); handleLogout(); }); } // Use standard handleLogout

    const confirmLogoutNoButton = document.getElementById('confirm-logout-no');
    if (confirmLogoutNoButton) { confirmLogoutNoButton.addEventListener('click', closeLogoutModal); }

    if (elements.addBookmarkButton) {
        elements.addBookmarkButton.addEventListener('click', () => {
            // Reset state before opening
            validatedPostUri = null;
            isDuplicate = false;
            duplicateDetails = null;

            const linkValidationStatus = document.getElementById('link-validation-status');
            if (linkValidationStatus) {
                linkValidationStatus.innerHTML = '';
                linkValidationStatus.className = 'validation-status';
            }

            const addBookmarkSubmitButton = document.getElementById('add-bookmark-submit-button');
            if (addBookmarkSubmitButton) {
                addBookmarkSubmitButton.disabled = true;
            }

            const addBookmarkForm = document.getElementById('add-bookmark-form');
            if (addBookmarkForm) {
                addBookmarkForm.reset();
            }

            // Populate categories dropdown if there are existing categories
            const categories = Object.keys(groupedBookmarks);
            if (categories.length > 0) {
                const categorySelectElement = document.getElementById('category-select');
                if (categorySelectElement) {
                    categorySelectElement.value = ''; // Reset to default
                }
                populateCategorySelect(categories);
            }

            openAddModal();
        });
    }
    if (elements.sortButton) { elements.sortButton.addEventListener('click', handleSortToggle); }
    if (elements.categoryFilterSelect) { elements.categoryFilterSelect.addEventListener('change', handleCategoryFilterChange); }
    if (elements.listViewButton) { elements.listViewButton.addEventListener('click', () => handleViewToggle('list')); }
    if (elements.folderViewButton) { elements.folderViewButton.addEventListener('click', () => handleViewToggle('folder')); }
    if (elements.breadcrumbsContainer) { elements.breadcrumbsContainer.addEventListener('click', handleBreadcrumbClick); }
    document.addEventListener('refresh-bookmarks', () => loadAndProcessBookmarks(true));
    const addBookmarkForm = document.getElementById('add-bookmark-form');
    if (addBookmarkForm) { addBookmarkForm.addEventListener('submit', handleAddBookmarkSubmit); }
    const editBookmarkForm = document.getElementById('edit-bookmark-form');
    if (editBookmarkForm) { editBookmarkForm.addEventListener('submit', handleEditBookmarkSubmit); }
    const postLinkInput = document.getElementById('post-link');
    if (postLinkInput) { postLinkInput.addEventListener('blur', handlePostLinkBlur); }
    if (elements.bookmarkList) { elements.bookmarkList.addEventListener('click', (event) => { const target = event.target; const folderItem = target.closest('.folder-item'); const cardItem = target.closest('.bookmark-card'); if (folderItem) { const category = folderItem.dataset.category; if (category) { if (currentCategoryView !== category) { history.pushState('category', '', '#category'); } else { history.replaceState('category', '', '#category'); } currentCategoryView = category; renderCurrentView(); } } else if (cardItem) { const rkey = cardItem.dataset.rkey; if (target.classList.contains('record-key')) { try { const recordData = JSON.parse(cardItem.dataset.record); showBookmarkDetailsModal(recordData); } catch (error) { console.error("Failed to parse record data:", error); showMessage("Error showing bookmark details.", "error"); } } else if (target.closest('.edit-button')) { const postUri = cardItem.dataset.postUri; const category = cardItem.dataset.category; const createdAt = cardItem.dataset.createdAt; if (rkey && postUri && category !== undefined && createdAt) { openEditModal(rkey, postUri, category, createdAt); } else { console.error("Missing data for edit:", cardItem.dataset); showMessage("Error: Missing data for edit.", "error"); } } else if (target.closest('.delete-button')) { if (rkey) { handleDeleteBookmark(rkey); } else { console.error("Missing rkey for delete:", cardItem.dataset); showMessage("Error: Missing data for delete.", "error"); } } } }); }
    const exportButton = document.getElementById('export-button');
    if (exportButton) { exportButton.addEventListener('click', openExportModal); }
    const exportConfirmButton = document.getElementById('export-confirm-button');
    if (exportConfirmButton) { exportConfirmButton.addEventListener('click', handleExportBookmarks); }
    const confirmDeleteYesButton = document.getElementById('confirm-delete-yes');
    if (confirmDeleteYesButton) { confirmDeleteYesButton.addEventListener('click', () => { const modal = document.getElementById('delete-confirm-modal'); const rkeySpan = document.getElementById('delete-rkey'); if (modal && rkeySpan) { const rkey = rkeySpan.textContent; closeModal('delete-confirm-modal'); if (rkey && typeof handleActualDelete === 'function') { handleActualDelete(rkey); } else { console.error("Delete confirmation failed: No rkey or delete handler found."); showMessage("Error confirming delete.", "error"); } } }); }
    document.querySelectorAll('.close-button[data-modal-id]').forEach(button => { button.addEventListener('click', () => { const modalId = button.dataset.modalId; if (modalId) { closeModal(modalId); if (modalId === 'delete-confirm-modal') { handleActualDelete = null; } } }); });

    // Add event listener for category select dropdown
    const categorySelect = document.getElementById('category-select');
    if (categorySelect) {
        categorySelect.addEventListener('change', function () {
            const newCategoryInput = document.getElementById('new-category');
            if (!newCategoryInput) return;

            if (this.value === 'other' || this.value === '') {
                // Show input field and clear it if "Other" is selected
                newCategoryInput.value = '';
                newCategoryInput.disabled = false;
                newCategoryInput.setAttribute('required', 'required');
            } else {
                // Use selected category
                newCategoryInput.value = this.value;
                newCategoryInput.disabled = true;
                newCategoryInput.removeAttribute('required');
            }
        });
    }

    // Add this to the setupEventListeners function in script.js
    const editCategorySelect = document.getElementById('edit-category-select');
    if (editCategorySelect) {
        editCategorySelect.addEventListener('change', function () {
            const editCategoryInput = document.getElementById('edit-category');
            if (!editCategoryInput) return;

            if (this.value === 'other' || this.value === '') {
                // Show input field and clear it if "Other" is selected
                editCategoryInput.value = '';
                editCategoryInput.disabled = false;
                editCategoryInput.setAttribute('required', 'required');
            } else {
                // Use selected category
                editCategoryInput.value = this.value;
                editCategoryInput.disabled = true;
                editCategoryInput.removeAttribute('required');
            }
        });
    }
}

// --- Proactive Session Check with Refresh ---
async function checkSessionValidity(session) {
    if (!session?.did) return false; // No session or DID
    console.log("Proactively checking session validity...");

    // Age-based proactive refresh
    if (session.loginTimestamp) {
        const age = Date.now() - session.loginTimestamp;
        // If the session is more than 8 hours old, proactively refresh it
        if (age > 8 * 60 * 60 * 1000) { // 8 hours in milliseconds
            console.log(`Session is ${Math.round(age / (60 * 60 * 1000))} hours old. Proactively refreshing...`);
            const refreshed = await refreshSession(blueskyApi);
            if (refreshed) {
                console.log("Proactive refresh succeeded.");
                // Update the currentUserSession with the refreshed session
                currentUserSession = refreshed;
                return true;
            } else {
                console.warn("Proactive refresh failed.");
                return false;
            }
        }
    }

    try {
        // Use getProfile as a lightweight authenticated check
        await blueskyApi.getProfile(session.did);
        console.log("Session check: getProfile succeeded.");
        return true;
    } catch (error) {
        // If we get an error, try refreshing regardless of the error type
        console.warn(`Session check encountered error: ${error.message}. Attempting refresh...`);

        // Always try to refresh the session when there's an error
        const refreshed = await refreshSession(blueskyApi);
        if (refreshed) {
            console.log("Session refreshed successfully after validation error.");
            // Update the currentUserSession with the refreshed session
            currentUserSession = refreshed;
            return true;
        } else {
            console.warn("Session refresh failed after validation error.");
            return false;
        }
    }
}


// --- Initialization ---
async function initialize() {
    console.log("Initializing Bluesky Bookmark Manager...");
    initializeElements();
    setupEventListeners();
    setupModalListeners();

    currentUserSession = getSession();

    if (currentUserSession?.did) { // Check for DID specifically
        console.log(`Found session for ${currentUserSession.displayName || currentUserSession.handle}. Verifying...`);
        // --- Proactive check ---
        const isValid = await checkSessionValidity(currentUserSession);

        if (isValid) {
            console.log("Session verified.");
            // CRITICAL: Ensure showBookmarksUI is called HERE
            showBookmarksUI(currentUserSession.displayName);
            currentView = 'folder';
            // Pass handleLogout to setupAutoRefresh
            setupAutoRefresh(blueskyApi, handleLogout);
            // Load bookmarks *after* setting up UI and session
            await loadAndProcessBookmarks(true);
        } else {
            console.log("Session invalid after check.");
            // Use handleLogout to ensure consistent state reset and message
            handleLogout("Your previous session expired. Please log in.");
            // handleLogout now calls showLogin() itself.
        }
    } else {
        console.log("No active session found.");
        showLogin(); // Show login if no session in storage
    }

    // Configure sort button based on initial state
    if (elements.sortButton) {
        elements.sortButton.innerHTML = currentSortOrder === 'newest' ? '<i class="ph ph-sort-descending"></i> Sort' : '<i class="ph ph-sort-ascending"></i> Sort';
        elements.sortButton.title = currentSortOrder === 'newest' ? 'Sort Oldest First' : 'Sort Newest First';
    }

    // Update UI based on initial view state only AFTER potential login/logout
    updateViewToggleButtons(currentView, !!currentCategoryView);
    updateBreadcrumbs(currentCategoryView);

    // Setup back button support AFTER initial state is determined and potentially loaded
    setupBackButtonSupport();

    // Make groupedBookmarks accessible to other scripts
    window.groupedBookmarks = groupedBookmarks;
}

// Start the app when DOM is fully loaded
document.addEventListener('DOMContentLoaded', initialize);