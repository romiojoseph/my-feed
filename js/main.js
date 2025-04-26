// js/main.js
import './logger.js'; // Import logger first to setup logging
import { DEFAULT_DID, BOOKMARK_COLLECTION } from './config.js';
import { fetchAllRecords, fetchPostsByUris } from './api.js';
import {
    showModal as showDidModal,
    hideModal as hideDidModal,
    setupModal as setupDidModal,
    setDidInputValue,
    updateUrlWithUserParam // Import for setting user param
} from './ui/modal.js'; // Import modal functions directly
import { // Import specific UI functions needed from mainUI
    setCurrentDidDisplay,
    showLoading,
    hideLoading,
    showStatus,
    clearStatus,
    clearPosts,
    displayPosts,
    appendPosts,
    initializeMasonry
} from './ui/mainUI.js'; // Import aggregated UI functions
import { logEvent } from './logger.js'; // Import custom logger

// --- Application State ---
let currentDID = null; // Stores the *resolved* DID after profile lookup
let currentIdentifier = null; // Stores the identifier from the URL (?user=...) or default
let isLoading = false;
let allRenderablePosts = [];
let currentlyDisplayedPosts = [];
let currentSearchTerm = '';
let currentSortMode = 'random';
let activeCategoryFilters = new Set();
let activeEmbedFilters = new Set();
// Removed initialUrlParamsApplied - rely on isLoading flag

// --- DOM Element References ---
const searchInput = document.getElementById('search-input');
const sortButton = document.getElementById('sort-button');
const sortButtonText = document.getElementById('sort-button-text');
const sortDropdown = document.getElementById('sort-dropdown');
const filterButton = document.getElementById('filter-button');
const filterDropdown = document.getElementById('filter-dropdown');
const filterCategoriesDiv = document.getElementById('filter-categories');
const filterEmbedsDiv = document.getElementById('filter-embeds');
const clearFiltersButton = document.getElementById('clear-filters-button');
const loadingProgress = document.getElementById('loading-progress');

/** Updates the URL query parameters (sort, cat, embed, q) without reloading. */
function updateUrlQueryParameters(params) {
    try {
        const url = new URL(window.location.href);
        let changed = false;
        const setOrDelete = (key, value) => {
            const current = url.searchParams.get(key);
            const valStr = value || null; // Treat empty string/undefined/null as null
            if (valStr !== current) {
                if (valStr) url.searchParams.set(key, valStr);
                else url.searchParams.delete(key);
                changed = true;
            }
        };
        setOrDelete('sort', (params.sort && params.sort !== 'random') ? params.sort : null);
        setOrDelete('cat', params.cat || null);
        setOrDelete('embed', params.embed || null);
        setOrDelete('q', params.q || null);
        if (changed) {
            // Use replaceState for filter/sort changes to avoid polluting history
            window.history.replaceState(null, '', url.toString());
            logEvent(`URL Query updated: ${url.search}`);
        }
    } catch (e) { console.error("Error updating URL query parameters:", e); }
}

/** Clears sort/filter query parameters from the URL. */
function clearUrlQueryParameters() {
    try {
        const url = new URL(window.location.href);
        let changed = false;
        ['sort', 'cat', 'embed', 'q'].forEach(key => {
            if (url.searchParams.has(key)) {
                url.searchParams.delete(key);
                changed = true;
            }
        });
        if (changed) {
            window.history.replaceState(null, '', url.toString());
            logEvent("URL Query parameters cleared.");
        }
    } catch (e) { console.error("Error clearing URL query parameters:", e); }
}

/** Reads state (identifier, filters, sort) from URL query parameters */
function getStateFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        identifier: urlParams.get('user') || DEFAULT_DID,
        sort: urlParams.get('sort') || 'random',
        cats: urlParams.get('cat') ? new Set(urlParams.get('cat').split(',')) : new Set(),
        embeds: urlParams.get('embed') ? new Set(urlParams.get('embed').split(',')) : new Set(),
        query: urlParams.get('q') || ''
    };
}

/** Applies state (filters, sort, search) to the application */
function applyState(state, skipUrlUpdate = false) {
    currentSortMode = state.sort;
    activeCategoryFilters = state.cats;
    activeEmbedFilters = state.embeds;
    currentSearchTerm = state.query;

    // Update UI controls first
    if (searchInput) searchInput.value = currentSearchTerm;
    updateSortButtonUI(currentSortMode);
    // Populate filters ALSO checks the boxes based on the new active* sets
    populateFilterOptions();

    logEvent(`Applying state - Sort: ${currentSortMode}, Search: "${currentSearchTerm}", Cats: ${activeCategoryFilters.size}, Embeds: ${activeEmbedFilters.size}`);
    // Apply the filtering/sorting logic to the currently loaded posts
    // Pass skipUrlUpdate flag to prevent immediate URL rewrite if needed (e.g., during initial load)
    applyFiltersAndSort(skipUrlUpdate);
}


/** Fetches bookmark records and incrementally appends posts. */
async function loadDataIncrementally(identifierToLoad) {
    if (isLoading) {
        logEvent("Load request ignored: Already loading.");
        return;
    }
    isLoading = true;
    currentIdentifier = identifierToLoad;
    allRenderablePosts = [];
    currentlyDisplayedPosts = [];
    clearPosts();
    clearStatus();
    showLoading();
    loadingProgress.textContent = 'Fetching profile...';

    let resolvedDID = identifierToLoad;

    // Phase 1: Resolve DID & Update Display
    try {
        const profileResponse = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${identifierToLoad}`);
        if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            resolvedDID = profileData.did;
            setCurrentDidDisplay(`${profileData.displayName} (@${profileData.handle})`);
            logEvent(`Profile loaded for ${identifierToLoad}. Resolved DID: ${resolvedDID}`);
        } else {
            setCurrentDidDisplay(identifierToLoad);
            logEvent(`Profile lookup failed for ${identifierToLoad}. Using input as repo identifier.`);
        }
    } catch (error) {
        setCurrentDidDisplay(identifierToLoad);
        logEvent(`Network error loading profile for ${identifierToLoad}: ${error.message}. Using input as repo identifier.`);
    }
    currentDID = resolvedDID;

    // Phase 2: Fetch Records
    logEvent(`Loading bookmarks for repo: ${currentDID}`);
    loadingProgress.textContent = 'Fetching bookmarks...';
    let cursor = null;
    let recordsProcessed = 0;
    let postsRendered = 0;
    const bookmarkMetaMap = new Map();

    try {
        while (true) {
            const params = new URLSearchParams({ repo: currentDID, collection: BOOKMARK_COLLECTION, limit: 50 });
            if (cursor) params.append('cursor', cursor);
            const listRecordsUrl = `https://bsky.social/xrpc/com.atproto.repo.listRecords?${params.toString()}`;
            const response = await fetch(listRecordsUrl);

            if (!response.ok) {
                const errorText = await response.text();
                logEvent(`Fetch bookmarks failed (Status ${response.status}): ${errorText.substring(0, 100)}`);
                if (response.status === 400 || response.status === 404) throw new Error(`No public bookmark feed found for '${identifierToLoad}'.`);
                if (response.status === 401 || response.status === 403) throw new Error(`Access denied for '${identifierToLoad}' (Private feed?).`);
                throw new Error(`Fetch bookmarks error (Status ${response.status})`);
            }
            const data = await response.json();
            const batchRecords = data.records || [];
            cursor = data.cursor;
            recordsProcessed += batchRecords.length;

            if (recordsProcessed === 0 && batchRecords.length === 0 && !cursor) {
                throw new Error(`No bookmarked posts found for '${identifierToLoad}'.`);
            }

            if (batchRecords.length > 0) {
                logEvent(`Found ${batchRecords.length} records (Total: ${recordsProcessed}).`);
                loadingProgress.textContent = `Processing ${recordsProcessed}...`;
                const batchUrisToFetch = [];
                batchRecords.forEach(record => {
                    const postUri = record?.value?.subject?.uri || record?.value?.uri;
                    if (postUri?.startsWith('at://') && postUri.includes('/app.bsky.feed.post/')) {
                        if (!bookmarkMetaMap.has(postUri)) {
                            bookmarkMetaMap.set(postUri, { category: record?.value?.category || 'Uncategorized', createdAt: record?.value?.createdAt || null });
                            batchUrisToFetch.push(postUri);
                        }
                    }
                });

                if (batchUrisToFetch.length > 0) {
                    logEvent(`Fetching details for ${batchUrisToFetch.length} posts.`);
                    loadingProgress.textContent = `Fetching details (${postsRendered + batchUrisToFetch.length})...`;
                    const fetchedPostsBatch = await fetchPostsByUris(batchUrisToFetch);
                    const newRenderablePosts = fetchedPostsBatch
                        .filter(post => post?.uri && post.author && post.record && bookmarkMetaMap.has(post.uri))
                        .map(post => ({ post, meta: bookmarkMetaMap.get(post.uri) }));

                    if (newRenderablePosts.length > 0) {
                        allRenderablePosts = allRenderablePosts.concat(newRenderablePosts);
                        // IMPORTANT: Append raw posts first for display during load
                        appendPosts(newRenderablePosts);
                        currentlyDisplayedPosts = currentlyDisplayedPosts.concat(newRenderablePosts); // Keep track
                        postsRendered += newRenderablePosts.length;
                        loadingProgress.textContent = `Displayed ${postsRendered}...`;
                    }
                }
            }
            if (!cursor) break;
        } // End while loop

        // --- Phase 4: Finalization & Initial State ---
        logEvent(`Finished loading. Total valid posts: ${allRenderablePosts.length}`);
        if (allRenderablePosts.length === 0) {
            if (recordsProcessed > 0) showStatus(`No valid bookmarked posts could be loaded for '${identifierToLoad}'.`);
            // Error for "no posts found" is now thrown earlier
            clearPosts();
        } else {
            // Populate filter options *after* all posts are loaded
            populateFilterOptions();
            // Read the state from URL *again* (in case it changed during load?) or just use current state vars? Let's read again for safety.
            const finalState = getStateFromUrl();
            // Apply the state - this updates controls, internal vars, and re-runs filtering/sorting
            // Pass 'true' to prevent applyFiltersAndSort from rewriting the URL immediately
            applyState(finalState, true);

            loadingProgress.textContent = `Loaded ${allRenderablePosts.length} posts.`;
            setTimeout(() => { if (!isLoading) loadingProgress.textContent = ''; }, 1500);
        }

    } catch (error) {
        logEvent(`Error during load: ${error.message}`);
        console.error("Load process error:", error);
        showStatus(`${error.message}`, true);
        loadingProgress.textContent = 'Error loading.';
        clearPosts();
        allRenderablePosts = [];
        currentlyDisplayedPosts = [];
    } finally {
        hideLoading();
        isLoading = false;
    }
}


// --- Filtering, Sorting, Searching ---

/** Determines the primary embed type of a post for filtering. */
function getEmbedType(post) {
    const embed = post?.embed || post?.record?.embed;
    if (!embed?.$type) return 'Text Only';
    const typeString = embed.$type.split('.').pop().replace('#view', '');
    switch (typeString) {
        case 'images': return 'Image';
        case 'external': return 'External Link';
        case 'record': return 'Quote Post';
        case 'recordWithMedia': return 'Record + Media';
        case 'video': return 'Video';
        default: return typeString.includes('Blocked') || typeString.includes('NotFound') ? 'Blocked/Not Found' : 'Other Embed';
    }
}

/** Applies filters and current sort order, then updates the display and URL. */
function applyFiltersAndSort(skipUrlUpdate = false) {
    // Removed isLoading check here - applyState handles calling this appropriately

    if (!allRenderablePosts || allRenderablePosts.length === 0) {
        currentlyDisplayedPosts = [];
        displayPosts(currentlyDisplayedPosts); // Clear display
        // No need to update URL here if posts are empty, handleDidChange handles it
        return;
    }

    let filtered = [...allRenderablePosts];

    // Apply Filters
    const searchTerm = currentSearchTerm.toLowerCase().trim();
    if (searchTerm) {
        filtered = filtered.filter(({ post, meta }) =>
            (post?.record?.text?.toLowerCase() || '').includes(searchTerm) ||
            (post?.author?.handle?.toLowerCase() || '').includes(searchTerm) ||
            (post?.author?.displayName?.toLowerCase() || '').includes(searchTerm) ||
            (meta?.category?.toLowerCase() || '').includes(searchTerm) ||
            (post?.embed ? JSON.stringify(post.embed).toLowerCase() : '').includes(searchTerm)
        );
    }
    if (activeCategoryFilters.size > 0) {
        filtered = filtered.filter(({ meta }) => meta?.category && activeCategoryFilters.has(meta.category));
    }
    if (activeEmbedFilters.size > 0) {
        filtered = filtered.filter(({ post }) => activeEmbedFilters.has(getEmbedType(post)));
    }

    // Apply Sort
    if (currentSortMode !== 'random') {
        filtered.sort((a, b) => {
            try {
                const getTime = (dateString) => dateString ? (new Date(dateString).getTime() || 0) : 0;
                let timeA = 0, timeB = 0;
                if (currentSortMode.endsWith('_save')) {
                    timeA = getTime(a.meta?.createdAt); timeB = getTime(b.meta?.createdAt);
                } else { // endsWith _post
                    timeA = getTime(a.post?.indexedAt || a.post?.record?.createdAt);
                    timeB = getTime(b.post?.indexedAt || b.post?.record?.createdAt);
                }
                return currentSortMode.startsWith('newest') ? (timeB - timeA) : (timeA - timeB);
            } catch (e) { console.error("Sort error:", e); return 0; }
        });
    } else {
        shuffleArray(filtered);
    }

    // Update Display & Status
    logEvent(`Displaying ${filtered.length} of ${allRenderablePosts.length} posts.`);
    currentlyDisplayedPosts = filtered;
    // IMPORTANT: This call redisplays posts based on the filtered/sorted list
    displayPosts(currentlyDisplayedPosts); // Re-render UI

    if (currentlyDisplayedPosts.length === 0 && allRenderablePosts.length > 0) {
        showStatus("No posts match the current search/filter criteria.");
    } else if (allRenderablePosts.length > 0) {
        clearStatus();
    }
    // If allRenderablePosts is 0, loadDataIncrementally handles the status.

    // Update URL Query Parameters for filters/sort
    if (!skipUrlUpdate) {
        updateUrlQueryParameters({
            sort: currentSortMode !== 'random' ? currentSortMode : null,
            cat: activeCategoryFilters.size > 0 ? [...activeCategoryFilters].join(',') : null,
            embed: activeEmbedFilters.size > 0 ? [...activeEmbedFilters].join(',') : null,
            q: currentSearchTerm || null
        });
    }
}

/** Helper to shuffle an array in place (Fisher-Yates). */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/** Populates filter dropdowns based on loaded data and checks active filters. */
function populateFilterOptions() {
    if (!filterCategoriesDiv || !filterEmbedsDiv) return;
    filterCategoriesDiv.innerHTML = ''; // Always clear first
    filterEmbedsDiv.innerHTML = '';

    if (!allRenderablePosts || allRenderablePosts.length === 0) return;

    const categories = new Set();
    const embedTypes = new Set();
    allRenderablePosts.forEach(({ post, meta }) => {
        categories.add(meta?.category || 'Uncategorized');
        embedTypes.add(getEmbedType(post));
    });

    // Populate Categories, checking against current activeCategoryFilters state variable
    [...categories]
        .sort((a, b) => (a === 'Uncategorized' ? -1 : b === 'Uncategorized' ? 1 : a.localeCompare(b)))
        .forEach(cat => addFilterCheckbox(filterCategoriesDiv, cat, 'category', activeCategoryFilters.has(cat)));

    // Populate Embed Types, checking against current activeEmbedFilters state variable
    [...embedTypes]
        .sort()
        .forEach(type => addFilterCheckbox(filterEmbedsDiv, type, 'embed', activeEmbedFilters.has(type)));
}


/** Adds a checkbox item to a filter container. */
function addFilterCheckbox(container, value, type, isChecked) {
    const idSuffix = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const id = `filter-${type}-${idSuffix || 'val'}`;
    const div = document.createElement('div'); div.className = 'filter-option';
    const input = document.createElement('input'); input.type = 'checkbox'; input.id = id; input.name = type; input.value = value;
    input.checked = isChecked; // Set checked state based on passed argument
    input.addEventListener('change', handleFilterChange); // Add listener
    const label = document.createElement('label'); label.htmlFor = id; label.textContent = value;
    div.appendChild(input); div.appendChild(label); container.appendChild(div);
}

/** Handles changes to filter checkboxes - Reads DOM and applies state */
function handleFilterChange() {
    const newState = {
        sort: currentSortMode, // Keep current sort
        query: currentSearchTerm, // Keep current search
        cats: new Set(),
        embeds: new Set()
    };
    document.querySelectorAll('#filter-categories input:checked').forEach(cb => newState.cats.add(cb.value));
    document.querySelectorAll('#filter-embeds input:checked').forEach(cb => newState.embeds.add(cb.value));

    applyState(newState); // Apply the changes (updates URL)
    logEvent(`Filters changed. Cats: ${newState.cats.size}, Embeds: ${newState.embeds.size}`);
}

/** Toggles filter dropdown visibility. */
function toggleFilterDropdown() { filterDropdown?.classList.toggle('hidden'); }

/** Resets all filters, search, sort state and UI elements to default. */
function resetFiltersAndSortUI(clearDropdowns = true) {
    // Apply default state (updates internal vars, UI controls, calls applyFiltersAndSort)
    applyState({
        sort: 'random',
        cats: new Set(),
        embeds: new Set(),
        query: ''
    }); // applyState handles UI updates & applyFiltersAndSort which updates URL

    if (clearDropdowns) {
        filterDropdown?.classList.add('hidden');
        sortDropdown?.classList.add('hidden');
    }
    logEvent("Filters and sort state reset.");
}

/** Updates the sort button text and icon based on the mode */
function updateSortButtonUI(sortMode) {
    if (!sortDropdown || !sortButton || !sortButtonText) return;
    const selectedLink = sortDropdown.querySelector(`a[data-sort="${sortMode}"]`);
    const defaultLink = sortDropdown.querySelector('a[data-sort="random"]');
    const linkToUse = selectedLink || defaultLink;

    if (linkToUse) {
        sortButtonText.textContent = linkToUse.textContent.trim();
        sortButton.querySelector('i').className = linkToUse.querySelector('i')?.className || 'ph ph-shuffle';
        sortDropdown.querySelectorAll('a').forEach(a => a.classList.toggle('active', a === linkToUse));
    }
}


// --- Initialization & Event Listeners ---

/** Debounced resize handler - triggers re-render via event */
function handleMasonryResize() {
    logEvent("Masonry resize detected, re-rendering displayed posts.");
    displayPosts(currentlyDisplayedPosts);
}

/** Handles new DID/Handle submission: Clears state, updates URL, loads data */
function handleDidChange(newIdentifier) {
    if (isLoading) { logEvent("Ignoring DID change while loading."); return; }
    const cleanIdentifier = newIdentifier.trim().replace(/^@/, '');
    if (!cleanIdentifier) { logEvent("Empty identifier submitted."); return; }
    if (cleanIdentifier.toLowerCase() === currentIdentifier?.toLowerCase()) {
        logEvent(`Identifier '${cleanIdentifier}' matches current. No reload.`);
        hideDidModal(); return;
    }

    logEvent(`New identifier submitted: ${cleanIdentifier}`);
    hideDidModal();
    // Reset internal filter/sort state first
    currentSearchTerm = '';
    currentSortMode = 'random';
    activeCategoryFilters = new Set();
    activeEmbedFilters = new Set();
    // Clear filter UI but don't apply filtering yet
    resetFiltersAndSortUI(false);
    clearUrlQueryParameters(); // Clear filter/sort params from URL
    updateUrlWithUserParam(cleanIdentifier); // Set ?user=... param and push history
    loadDataIncrementally(cleanIdentifier); // Load data
}

function init() {
    logEvent("Initializing application.");

    // --- Read Initial State from URL ---
    const initialState = getStateFromUrl();
    const initialIdentifier = initialState.identifier;

    // --- Setup UI ---
    // Set input only if it came from URL, otherwise leave blank for default
    if (new URLSearchParams(window.location.search).has('user')) {
        setDidInputValue(initialIdentifier);
    } else {
        setDidInputValue(''); // Keep blank if loading default
    }
    setCurrentDidDisplay('Loading...');
    initializeMasonry();

    setupDidModal(
        (submittedIdentifier) => handleDidChange(submittedIdentifier),
        () => { // onCancel
            hideDidModal();
            if (!new URLSearchParams(window.location.search).has('user') && !isLoading && allRenderablePosts.length === 0 && !document.getElementById('status-message')?.textContent) {
                logEvent("Modal cancelled, loading default DID.");
                handleDidChange(DEFAULT_DID);
            }
        }
    );

    // --- Setup Control Listeners ---
    let searchTimeout;
    searchInput?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const newSearchTerm = searchInput.value.trim();
            if (newSearchTerm !== currentSearchTerm) {
                // Update only the query part of the state
                currentSearchTerm = newSearchTerm; // Update internal state directly
                applyFiltersAndSort(); // Re-apply filters/sort and update URL
            }
        }, 300);
    });

    sortButton?.addEventListener('click', (e) => { e.stopPropagation(); sortDropdown?.classList.toggle('hidden'); filterDropdown?.classList.add('hidden'); });
    sortDropdown?.addEventListener('click', (e) => {
        e.preventDefault();
        const target = e.target.closest('a[data-sort]');
        if (target && target.dataset.sort !== currentSortMode) {
            // Update only the sort part of the state
            currentSortMode = target.dataset.sort; // Update internal state directly
            updateSortButtonUI(currentSortMode); // Update button UI
            applyFiltersAndSort(); // Re-apply filters/sort and update URL
            sortDropdown.classList.add('hidden');
        } else if (target) {
            sortDropdown.classList.add('hidden'); // Close even if no change
        }
    });

    filterButton?.addEventListener('click', (e) => { e.stopPropagation(); filterDropdown?.classList.toggle('hidden'); sortDropdown?.classList.add('hidden'); });
    clearFiltersButton?.addEventListener('click', () => {
        resetFiltersAndSortUI(false); // Resets state vars and applies defaults
        filterDropdown?.classList.add('hidden');
    });

    document.addEventListener('click', (e) => { // Close dropdowns on outside click
        if (filterDropdown && !filterDropdown.classList.contains('hidden') && !filterButton?.contains(e.target) && !filterDropdown?.contains(e.target)) filterDropdown.classList.add('hidden');
        if (sortDropdown && !sortDropdown.classList.contains('hidden') && !sortButton?.contains(e.target) && !sortDropdown?.contains(e.target)) sortDropdown.classList.add('hidden');
    });

    window.addEventListener('masonryResize', handleMasonryResize);

    // --- Add Popstate Listener for Back/Forward ---
    window.addEventListener('popstate', (event) => {
        logEvent("Popstate event detected.");
        const newState = getStateFromUrl(); // Read the complete target state from URL

        // Check if identifier changed (case-insensitive comparison)
        if (newState.identifier.toLowerCase() !== currentIdentifier?.toLowerCase()) {
            logEvent(`Popstate changed identifier to: ${newState.identifier}. Reloading.`);
            setDidInputValue(newState.identifier); // Update input field in modal
            handleDidChange(newState.identifier); // This handles the full reload process
        } else {
            // Identifier same, check if filters/sort/search changed
            if (newState.sort !== currentSortMode ||
                newState.query !== currentSearchTerm ||
                !setsAreEqual(newState.cats, activeCategoryFilters) ||
                !setsAreEqual(newState.embeds, activeEmbedFilters)) {
                logEvent(`Popstate changed filters/sort. Applying.`);
                // Apply the state read from URL, but don't rewrite the URL again
                applyState(newState, true);
            } else {
                logEvent("Popstate detected no relevant change in state.");
            }
        }
    });

    // --- Initial Data Load ---
    logEvent(`Performing initial load for identifier: ${initialIdentifier}`);
    // Load data - loadDataIncrementally now applies initial filter/sort state AFTER loading
    loadDataIncrementally(initialIdentifier);
}

/** Helper function to compare two Sets */
function setsAreEqual(setA, setB) {
    return setA.size === setB.size && [...setA].every(item => setB.has(item));
}

// Run init once the DOM is ready
document.addEventListener('DOMContentLoaded', init);