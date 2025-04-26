// js/blueskyApi.js
import { getAuthHeaders, refreshSession, MAX_REFRESH_ATTEMPTS } from './auth.js';
import { showMessage } from './ui.js'; // Still needed for session errors

const BASE_URL = "https://bsky.social/xrpc";
const BOOKMARK_COLLECTION = "user.bookmark.feed.public";

// Core fetch function (remains the same)
async function fetchWithAuth(endpoint, method = 'GET', queryParams = null, body = null, currentAttempt = 0) {
    const headers = await getAuthHeaders();
    if (!headers && endpoint !== 'com.atproto.server.createSession' && endpoint !== 'com.atproto.server.refreshSession') {
        console.error("Cannot make authenticated request: No session found.");
        throw new Error("Not logged in.");
    }
    const url = new URL(`${BASE_URL}/${endpoint}`);
    if (queryParams) Object.keys(queryParams).forEach(key => url.searchParams.append(key, queryParams[key]));
    const options = { method: method, headers: headers || {} };
    if (body) { options.body = JSON.stringify(body); options.headers['Content-Type'] = 'application/json'; }
    try {
        console.debug(`API Request: ${method} ${url.pathname}${url.search}`);
        const response = await fetch(url.toString(), options);
        if (!response.ok) {
            if (response.status === 401 && currentAttempt < MAX_REFRESH_ATTEMPTS) {
                console.warn(`Received 401 calling ${endpoint}. Refresh attempt ${currentAttempt + 1}/${MAX_REFRESH_ATTEMPTS}...`);
                const newSession = await refreshSession(blueskyApi); // Pass self
                if (newSession) {
                    console.log("Refresh successful. Retrying original request...");
                    return await fetchWithAuth(endpoint, method, queryParams, body, currentAttempt + 1);
                } else {
                    console.error("Session refresh failed after 401. Aborting request.");
                    showMessage('Session expired. Please log in again.', 'error');
                    throw new Error("Session refresh failed.");
                }
            }
            let errorBody; try { errorBody = await response.json(); } catch (e) { errorBody = await response.text(); }
            console.error(`API Error ${response.status} (${response.statusText}) on ${endpoint}:`, errorBody);
            const errorMessage = errorBody?.message || errorBody?.error || (typeof errorBody === 'string' ? errorBody : `HTTP error ${response.status}`);
            throw new Error(errorMessage);
        }
        const contentType = response.headers.get("content-type");
        if (response.status === 200 && (!contentType || !contentType.includes("application/json"))) {
            return {}; // Handle successful 200 OK with no JSON body (e.g., delete)
        }
        // Handle cases where Bluesky might return 200 OK but with non-JSON (should be rare)
        if (!contentType || !contentType.includes("application/json")) {
            console.warn(`Received non-JSON response with status ${response.status} for ${endpoint}`);
            return await response.text(); // Or return empty object? {}
        }
        return await response.json(); // Assume JSON for other success cases
    } catch (error) {
        console.error(`Network or other error during fetch to ${endpoint}:`, error);
        throw error;
    }
}

// API wrappers (remain the same)
async function createSession(identifier, password) { /* ... */ const endpoint = 'com.atproto.server.createSession'; const body = { identifier, password }; const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; const url = `${BASE_URL}/${endpoint}`; console.debug(`API Request: POST ${endpoint}`); const response = await fetch(url, options); const data = await response.json(); if (!response.ok) { console.error(`API Error ${response.status} on ${endpoint}:`, data); throw new Error(data?.message || data?.error || `Login failed: HTTP ${response.status}`); } return data; }
async function _refreshSessionInternal(refreshToken) { /* ... */ const endpoint = 'com.atproto.server.refreshSession'; const options = { method: 'POST', headers: { 'Authorization': `Bearer ${refreshToken}` } }; const url = `${BASE_URL}/${endpoint}`; console.debug(`API Request: POST ${endpoint}`); const response = await fetch(url, options); const data = await response.json(); if (!response.ok) { console.error(`API Error ${response.status} on ${endpoint}:`, data); throw new Error(data?.message || data?.error || `Refresh failed: HTTP ${response.status}`); } return data; }
async function getProfile(userActor) { /* ... */ return await fetchWithAuth('app.bsky.actor.getProfile', 'GET', { actor: userActor }); }
async function resolveHandle(handle) { /* ... */ return await fetchWithAuth('com.atproto.identity.resolveHandle', 'GET', { handle }); }
async function listRecords(collection, userDid, limit = 100, cursor = null) { /* ... */ const params = { repo: userDid, collection, limit }; if (cursor) { params.cursor = cursor; } return await fetchWithAuth('com.atproto.repo.listRecords', 'GET', params); }
async function listAllRecords(collection, userDid) { /* ... */ let allRecords = []; let cursor = null; let pageCount = 0; const maxPages = 20; console.log(`Fetching all records for ${collection}...`); do { pageCount++; if (pageCount > maxPages) { console.warn(`Max page limit (${maxPages}) reached for ${collection}.`); break; } try { const response = await listRecords(collection, userDid, 100, cursor); if (response && response.records) { allRecords = allRecords.concat(response.records); cursor = response.cursor; } else { console.warn("Unexpected listRecords response:", response); cursor = null; } } catch (error) { console.error(`Error fetching page ${pageCount} for ${collection}:`, error); throw error; } } while (cursor); console.log(`Finished fetching. Total ${allRecords.length} records for ${collection}.`); return allRecords; }
async function createRecord(recordData, userDid) { /* ... */ const body = { repo: userDid, collection: BOOKMARK_COLLECTION, record: recordData }; return await fetchWithAuth('com.atproto.repo.createRecord', 'POST', null, body); }
async function deleteRecord(rkey, userDid) { /* ... */ const body = { repo: userDid, collection: BOOKMARK_COLLECTION, rkey: rkey }; return await fetchWithAuth('com.atproto.repo.deleteRecord', 'POST', null, body); }
async function putRecord(rkey, recordData, userDid) { /* ... */ const body = { repo: userDid, collection: BOOKMARK_COLLECTION, rkey: rkey, record: recordData }; return await fetchWithAuth('com.atproto.repo.putRecord', 'POST', null, body); }

// *** NEW FUNCTION for Post Validation ***
async function getPosts(postUris) {
    // Takes an array of AT-URIs
    if (!Array.isArray(postUris) || postUris.length === 0) {
        return { posts: [] }; // Return empty if input is invalid
    }
    const params = { uris: postUris };
    // This endpoint might return partial success even if some URIs are invalid/not found
    // The result structure is { posts: [...] } where posts array contains found posts.
    // We check if the length of the returned posts array matches the input length.
    return await fetchWithAuth('app.bsky.feed.getPosts', 'GET', params);
}


// Encapsulate the API functions into an object
const blueskyApi = {
    createSession,
    refreshSession: _refreshSessionInternal,
    getProfile,
    resolveHandle,
    listAllRecords,
    createRecord,
    deleteRecord,
    putRecord,
    getPosts, // Added
    BOOKMARK_COLLECTION
};

// Export the single object
export default blueskyApi;