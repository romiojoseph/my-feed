// js/api.js
import { LIST_RECORDS_URL, GET_POSTS_URL, POSTS_PER_FETCH, API_RETRY_DELAY } from './config.js';
import { logEvent } from './logger.js'; // Import the custom logger

/**
 * Fetches all records from a specific collection for a given DID, handling pagination.
 * @param {string} did - The user's DID.
 * @param {string} collection - The collection identifier.
 * @returns {Promise<Array>} - A promise resolving to an array of records.
 */
export async function fetchAllRecords(did, collection) {
    let allRecords = [];
    let cursor = null;
    let recordsFetched = 0;
    let page = 0;

    logEvent(`Starting record fetch for DID: ${did}, Collection: ${collection}`);

    try {
        do {
            page++;
            const params = new URLSearchParams({
                repo: did,
                collection: collection,
                limit: 100 // Use max limit for listRecords
            });
            if (cursor) {
                params.append('cursor', cursor);
            }

            const url = `${LIST_RECORDS_URL}?${params.toString()}`;

            const response = await fetch(url);

            if (!response.ok) {
                const errorText = await response.text();
                const errorMsg = `Error fetching records (Page ${page}): ${response.status} ${response.statusText}. Response: ${errorText.substring(0, 200)}...`;
                logEvent(errorMsg);
                console.error(`Full Error fetching records page ${page}:`, errorText); // Keep full error in console
                // Specific error messages for user feedback
                if (response.status === 400) throw new Error(`Failed to fetch records (Status ${response.status}). Invalid DID/Collection or private repo?`);
                if (response.status === 401 || response.status === 403) throw new Error(`Failed to fetch records (Status ${response.status}). Access Denied (Private?).`);
                // Generic error for other statuses
                throw new Error(`Failed to fetch records (Status ${response.status})`);
            }

            const data = await response.json();
            const batchRecords = data.records || [];
            allRecords = allRecords.concat(batchRecords);
            cursor = data.cursor;
            recordsFetched += batchRecords.length;
            // Log progress without being overly verbose
            if (batchRecords.length > 0 || !cursor) { // Log last fetch even if 0 results if it's the end
                logEvent(`Fetched ${batchRecords.length} records (Page ${page}). Total: ${recordsFetched}. More pages: ${cursor ? 'Yes' : 'No'}`);
            }


        } while (cursor);

        logEvent(`Finished fetching records. Total found: ${allRecords.length}`);
        return allRecords;

    } catch (error) {
        // Log the specific error message thrown above or from fetch itself
        logEvent(`Error in fetchAllRecords: ${error.message}`);
        console.error('Full error object in fetchAllRecords:', error); // Log full error object for debugging
        throw error; // Re-throw to be handled by the caller (e.g., loadDataForDID)
    }
}

/**
 * Chunks an array into smaller arrays of a specified size.
 * @param {Array} array - The array to chunk.
 * @param {number} size - The size of each chunk.
 * @returns {Array<Array>} - An array of chunked arrays.
 */
function chunkArray(array, size) {
    const chunkedArr = [];
    for (let i = 0; i < array.length; i += size) {
        chunkedArr.push(array.slice(i, i + size));
    }
    return chunkedArr;
}


/**
 * Fetches detailed post information for a list of AT-URIs.
 * Handles chunking and delays to avoid rate limiting.
 * @param {Array<string>} uris - An array of post AT-URIs.
 * @returns {Promise<Array>} - A promise that resolves to an array of post objects.
 */
export async function fetchPostsByUris(uris) {
    if (!uris || uris.length === 0) {
        logEvent("fetchPostsByUris called with no URIs.");
        return [];
    }

    const uriChunks = chunkArray(uris, POSTS_PER_FETCH);
    let allPosts = [];
    let apiCalls = 0;

    logEvent(`Fetching details for ${uris.length} posts in ${uriChunks.length} chunks.`);

    for (let i = 0; i < uriChunks.length; i++) {
        const chunk = uriChunks[i];
        const chunkNumber = i + 1;
        const params = new URLSearchParams();
        chunk.forEach(uri => params.append('uris', uri));
        const url = `${GET_POSTS_URL}?${params.toString()}`;

        try {
            // Delay only *between* chunks (not before the first one)
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, API_RETRY_DELAY));
            }

            const response = await fetch(url);
            apiCalls++;

            if (!response.ok) {
                const errorText = await response.text();
                logEvent(`Failed to fetch post chunk ${chunkNumber} (Status ${response.status}). URIs: ${chunk.length}. Error: ${errorText.substring(0, 100)}...`);
                console.warn(`Failed to fetch post chunk ${chunkNumber}: ${response.status} ${response.statusText}. URIs: ${chunk.join(', ')}`, errorText);
                continue; // Skip to the next chunk on error
            }

            const data = await response.json();
            const fetchedPosts = data.posts || [];
            if (fetchedPosts.length > 0) {
                allPosts = allPosts.concat(fetchedPosts);
                logEvent(`Fetched ${fetchedPosts.length} posts in chunk ${chunkNumber}.`);
            } else {
                logEvent(`No posts found in chunk ${chunkNumber} (may be deleted/private).`);
                console.log(`No posts found in chunk ${chunkNumber}. URIs: ${chunk.join(', ')}`);
            }

        } catch (error) {
            logEvent(`Network error fetching post chunk ${chunkNumber}: ${error.message}`);
            console.error(`Error fetching post chunk ${chunkNumber}: ${error}. URIs: ${chunk.join(', ')}`);
            continue; // Skip to the next chunk on network error
        }
    }

    logEvent(`Finished fetching post details. Total retrieved: ${allPosts.length}. API calls: ${apiCalls}.`);
    // Filter out any null/undefined entries just in case API returns partial success or errors
    return allPosts.filter(post => post && post.uri);
}