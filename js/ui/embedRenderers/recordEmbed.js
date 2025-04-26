// js/ui/embedRenderers/recordEmbed.js
import { createPostElement } from '../postRenderer.js'; // Import for recursion
import { createBlockedPlaceholder } from '../domUtils.js'; // Import placeholder utility

/**
 * Renders a record embed (quote post). Handles recursion.
 * Expects `embedData` to be the record container object from the parent post's
 * embed structure (e.g., post.embed.record or the record part of recordWithMedia).
 * This function checks the $type within `embedData`.
 */
export function renderRecordEmbed(embedData) {
    // --- Handle different states of the quote target ---

    // Case 1: Target post not found
    if (!embedData || embedData.$type === 'app.bsky.embed.record#viewNotFound') {
        return createBlockedPlaceholder('[Quoted post not found or deleted]');
    }
    // Case 2: Target post from a blocked user
    if (embedData.$type === 'app.bsky.embed.record#viewBlocked') {
        return createBlockedPlaceholder('[Quoted post from blocked user]');
    }
    // Case 3: Expected valid record view, check type
    if (embedData.$type !== 'app.bsky.embed.record#viewRecord') {
        // Log unexpected type or structure if it's not explicitly handled above
        console.warn("Unexpected record embed type or structure:", embedData);
        return createBlockedPlaceholder('[Could not load quoted post - Unexpected Type]');
    }

    // --- We have a #viewRecord, proceed to render ---

    // Validate essential data fields within the viewRecord needed for rendering
    if (!embedData.value || !embedData.author || !embedData.uri) {
        console.warn("Quoted post view record is missing essential data (value, author, or uri):", embedData);
        return createBlockedPlaceholder('[Quoted post data incomplete]');
    }

    // Construct a synthetic 'post' object mirroring the structure the API usually provides,
    // which is what `createPostElement` expects.
    const quotedPostAPIFormat = {
        uri: embedData.uri,
        cid: embedData.cid, // Include CID if available
        author: embedData.author, // Author info of the quoted post
        record: embedData.value, // The actual content ($type: app.bsky.feed.post) of the quoted post
        // Map the 'embeds' array from viewRecord to the 'embed' property createPostElement expects
        embed: embedData.embeds && embedData.embeds[0] ? embedData.embeds[0] : undefined,
        // Include counts for the quoted post if available
        replyCount: embedData.replyCount,
        repostCount: embedData.repostCount,
        likeCount: embedData.likeCount,
        quoteCount: embedData.quoteCount,
        indexedAt: embedData.indexedAt, // Timestamp of the quoted post
        labels: embedData.labels || [], // Labels on the quoted post
    };

    // Wrap the synthetic post data in the { post, meta } structure.
    // Bookmark metadata (`meta`) is not applicable to quoted posts themselves.
    const postDataForRenderer = {
        post: quotedPostAPIFormat,
        meta: null // Explicitly null meta for quoted posts
    };

    // Create the outer container div for the quote embed
    const recordDiv = document.createElement('div');
    recordDiv.className = 'embed-record'; // Class for overall quote styling

    try {
        // Recursively call createPostElement to render the quoted post content.
        // *** Crucially, pass 'true' as the second argument (isQuotedView) ***
        // This tells createPostElement to apply specific styling/behavior for nested quotes.
        const nestedPostElement = createPostElement(postDataForRenderer, true);

        if (nestedPostElement) {
            // The 'quoted-post-view' class is added by createPostElement itself when isQuotedView is true.
            // Append the rendered nested post element to the quote container.
            recordDiv.appendChild(nestedPostElement);
            return recordDiv; // Return the container with the rendered quote
        } else {
            // Handle case where createPostElement returned null (e.g., due to internal error)
            console.error("createPostElement returned null when rendering nested quote:", postDataForRenderer);
            return createBlockedPlaceholder('[Error rendering quoted post content]');
        }
    } catch (error) {
        // Catch any unexpected errors during the recursive call
        console.error("Error during recursive createPostElement call for quote:", error, "Data passed:", postDataForRenderer);
        return createBlockedPlaceholder('[Error rendering quoted post]'); // Return error placeholder
    }
}