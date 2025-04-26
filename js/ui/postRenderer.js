// js/ui/postRenderer.js
import { renderRichText } from './richTextRenderer.js';
import { renderImageEmbed } from './embedRenderers/imageEmbed.js';
import { renderExternalEmbed } from './embedRenderers/externalEmbed.js';
import { renderRecordEmbed } from './embedRenderers/recordEmbed.js';
import { renderVideoEmbed } from './embedRenderers/videoEmbed.js';
import { renderRecordWithMediaEmbed } from './embedRenderers/recordWithMediaEmbed.js';
import { createMetricItem, showShareTooltip, showJsonModal } from './domUtils.js';
import { formatTimestamp, formatRelativeTime } from '../timeUtils.js';

/**
 * Creates the main HTML element for a single post.
 * @param {object} postData - Combined object { post: {...}, meta: {...} }
 * @param {boolean} isQuotedView - Flag indicating if this is rendered inside a quote.
 */
export function createPostElement(postData, isQuotedView = false) {
    // Robustness Check for input data structure
    if (!postData || typeof postData !== 'object') {
        console.error("Cannot create post element: Invalid postData object provided.", postData);
        return null;
    }
    const { post, meta } = postData;
    if (!post || typeof post !== 'object' || !post.author || !post.record || !post.uri) {
        console.error("Cannot create post element: Invalid post structure within postData.", post);
        return null;
    }

    // Create main post container div
    const postDiv = document.createElement('div');
    postDiv.className = 'post';
    if (isQuotedView) {
        postDiv.classList.add('quoted-post-view'); // Add class if it's nested
    }
    postDiv.dataset.uri = post.uri; // Store URI for reference

    // --- Post Tag (Category / Saved Time) ---
    // Show tag only if it's a top-level post AND bookmark metadata exists
    if (!isQuotedView && meta) {
        postDiv.appendChild(createPostTagElement(meta));
    }

    // --- Post Header (Author Info, Timestamp, Share Button) ---
    // Pass the isQuotedView flag to conditionally hide the share button
    postDiv.appendChild(createPostHeaderElement(post, isQuotedView));

    // --- Post Content (Text + Embed) ---
    const contentDiv = document.createElement('div');
    contentDiv.className = 'post-content';

    // Render post text with rich text facets if text exists
    if (post.record.text || (post.record.facets && post.record.facets.length > 0)) {
        const textDiv = document.createElement('div');
        textDiv.className = 'post-content-text';
        const textContent = post.record.text || ''; // Default to empty string if null/undefined
        const facets = post.record.facets || []; // Default to empty array
        textDiv.appendChild(renderRichText(textContent, facets));
        contentDiv.appendChild(textDiv);
    }

    // Render embed only if it's a top-level post (adjust if embeds in quotes are desired)
    if (!isQuotedView) {
        // Use post.embed (view structure) preferentially, fallback to record.embed
        const embedData = post.embed || post.record?.embed;
        if (embedData) {
            const embedElement = createEmbedElement(embedData); // Delegate to embed renderer chooser
            if (embedElement) {
                // Wrap the specific embed element in the standard .post-embed container
                const embedWrapper = document.createElement('div');
                embedWrapper.className = 'post-embed';
                embedWrapper.appendChild(embedElement);
                contentDiv.appendChild(embedWrapper);
            }
        }
    }
    postDiv.appendChild(contentDiv); // Add content section to post

    // --- Post Footer (Metrics, JSON view) ---
    // Only show footer if NOT a quoted view
    if (!isQuotedView) {
        postDiv.appendChild(createPostFooterElement(post, postData)); // Pass full data for JSON modal
    }

    return postDiv; // Return the fully constructed post element
}

/**
 * Creates the post tag element (category, saved time).
 * @param {object} meta - The bookmark metadata object { category, createdAt }.
 * @returns {HTMLElement | null} The tag div element or null if no data.
 */
function createPostTagElement(meta) {
    if (!meta || (!meta.category && !meta.createdAt)) {
        return null; // Return null if no relevant metadata
    }
    const tagDiv = document.createElement('div');
    tagDiv.className = 'post-tag';

    let hasContent = false;
    if (meta.category) {
        const categorySpan = document.createElement('span');
        categorySpan.innerHTML = `${meta.category}`;
        tagDiv.appendChild(categorySpan);
        hasContent = true;
    }

    if (meta.createdAt) {
        // Add separator if category was also added
        if (hasContent) {
            tagDiv.appendChild(document.createTextNode(' • '));
        }
        const timeSpan = document.createElement('span');
        timeSpan.textContent = `Saved ${formatRelativeTime(meta.createdAt)}`;
        tagDiv.appendChild(timeSpan);
        hasContent = true;
    }
    // Return the div only if it actually has content
    return hasContent ? tagDiv : null;
}


/**
 * Creates the author header element (avatar, name/handle, timestamp, share).
 * @param {object} post - The post API data.
 * @param {boolean} isQuotedView - Flag to hide share button.
 * @returns {HTMLElement} The header div element.
 */
function createPostHeaderElement(post, isQuotedView) {
    const headerDiv = document.createElement('div');
    headerDiv.className = 'post-header';

    // Left side: Avatar and Author Info block
    const authorMainDiv = document.createElement('div');
    authorMainDiv.className = 'post-author-main';

    // Create profile URL
    const profileUrl = `https://bsky.app/profile/${post.author.did}`;

    // Make the author main div a link
    const authorLink = document.createElement('a');
    authorLink.href = profileUrl;
    authorLink.target = "_blank";
    authorLink.rel = "noopener noreferrer";
    authorLink.style.textDecoration = "none";
    authorLink.style.display = "flex";
    authorLink.style.alignItems = "center";
    authorLink.style.gap = "8px";
    authorLink.style.flexGrow = "1";
    authorLink.style.minWidth = "0";

    // Avatar part (wrapped in a div for styling)
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'post-author-avatar';
    const avatar = document.createElement('img');
    avatar.src = post.author?.avatar || 'assets/avatar.svg';
    avatar.alt = `${post.author?.displayName || post.author?.handle || 'Unknown'}'s avatar`;
    avatar.onerror = () => { avatar.src = 'assets/avatar.svg'; }; // Fallback on error
    avatarDiv.appendChild(avatar);
    authorLink.appendChild(avatarDiv);

    // Info part (name/handle line + timestamp line)
    const authorInfoDiv = document.createElement('div');
    authorInfoDiv.className = 'post-author-info';

    // Line 1: Display Name and Handle
    const authorLine = document.createElement('div');
    authorLine.className = 'post-author-line';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'post-author-name';
    nameSpan.textContent = post.author?.displayName || post.author?.handle || 'Unknown'; // Use handle if display name missing
    const handleSpan = document.createElement('span');
    handleSpan.className = 'post-author-handle';
    handleSpan.textContent = post.author?.handle ? `@${post.author.handle}` : ''; // Show handle only if available
    authorLine.appendChild(nameSpan);
    authorLine.appendChild(handleSpan);
    authorInfoDiv.appendChild(authorLine);

    // Line 2: Timestamp
    const timestampDiv = document.createElement('div');
    timestampDiv.className = 'post-header-timestamp';
    // Use post index time preferentially, fallback to record creation time
    timestampDiv.textContent = formatTimestamp(post.indexedAt || post.record?.createdAt);
    authorInfoDiv.appendChild(timestampDiv);

    authorLink.appendChild(authorInfoDiv); // Add info block to main author link
    headerDiv.appendChild(authorLink); // Add author link to header

    // Right side: Share Button (conditional)
    if (!isQuotedView) {
        // Construct the post URL for sharing
        const postUrl = `https://bsky.app/profile/${post.author.did}/post/${post.uri.split('/').pop()}`;

        const shareButton = document.createElement('button');
        shareButton.className = 'post-header-share-button';
        shareButton.title = 'Copy post link';
        shareButton.innerHTML = '<i class="ph-bold ph-export"></i>'; // Phosphor export icon
        shareButton.onclick = (event) => {
            event.stopPropagation(); // Prevent clicks propagating if needed

            // Fix copy functionality on mobile
            const copyFallback = () => {
                // Create a temporary textarea element for mobile
                const textArea = document.createElement('textarea');
                textArea.value = postUrl;
                textArea.style.position = 'fixed';  // Make it avoid layout impact
                textArea.style.left = '0';
                textArea.style.top = '0';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();

                let successful = false;
                try {
                    successful = document.execCommand('copy');
                } catch (err) {
                    console.error('Fallback copy failed:', err);
                }

                document.body.removeChild(textArea);
                return successful;
            };

            // Try modern clipboard API first, then fallback
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(postUrl)
                    .then(() => {
                        console.log('Post URL copied successfully:', postUrl);
                        const icon = shareButton.querySelector('i');
                        if (!icon) return;
                        const originalIconClass = icon.className;
                        icon.className = 'ph-fill ph-check-circle'; // Change to checkmark
                        icon.style.color = '#28a745'; // Green color for success
                        showShareTooltip(shareButton, 'Copied!'); // Show feedback tooltip
                        // Restore icon after a delay
                        setTimeout(() => {
                            icon.className = originalIconClass;
                            icon.style.color = '';
                        }, 1500);
                    })
                    .catch(err => {
                        console.error('Failed to copy with clipboard API:', err);
                        // Try fallback
                        if (copyFallback()) {
                            const icon = shareButton.querySelector('i');
                            if (icon) {
                                const originalIconClass = icon.className;
                                icon.className = 'ph-fill ph-check-circle';
                                icon.style.color = '#28a745';
                                setTimeout(() => {
                                    icon.className = originalIconClass;
                                    icon.style.color = '';
                                }, 1500);
                            }
                            showShareTooltip(shareButton, 'Copied!');
                        } else {
                            showShareTooltip(shareButton, 'Failed to copy');
                        }
                    });
            } else {
                // For browsers without clipboard API
                if (copyFallback()) {
                    const icon = shareButton.querySelector('i');
                    if (icon) {
                        const originalIconClass = icon.className;
                        icon.className = 'ph-fill ph-check-circle';
                        icon.style.color = '#28a745';
                        setTimeout(() => {
                            icon.className = originalIconClass;
                            icon.style.color = '';
                        }, 1500);
                    }
                    showShareTooltip(shareButton, 'Copied!');
                } else {
                    showShareTooltip(shareButton, 'Failed to copy');
                }
            }
        };
        headerDiv.appendChild(shareButton); // Add share button to header
    }

    return headerDiv; // Return the constructed header element
}

/**
 * Chooses the correct embed renderer based on the embed type.
 * @param {object} embed - The embed object (preferentially the #view structure).
 * @returns {HTMLElement | null} The rendered embed element or null.
 */
function createEmbedElement(embed) {
    // Basic check for embed object and type property
    if (!embed || !embed.$type) {
        return null;
    }

    // Determine the embed type and delegate to specific renderer functions
    const embedType = embed.$type;
    try {
        if (embedType === 'app.bsky.embed.images#view' || embedType === 'app.bsky.embed.images') {
            // Pass the actual array of images
            return renderImageEmbed(embed.images || embed);
        }
        if (embedType === 'app.bsky.embed.external#view' || embedType === 'app.bsky.embed.external') {
            // Pass the external link object data
            return renderExternalEmbed(embed.external || embed);
        }
        if (embedType === 'app.bsky.embed.record#view' || embedType === 'app.bsky.embed.record') {
            // Pass the record container object (e.g., post.embed.record)
            // The renderer will look inside for #viewRecord, #viewBlocked etc.
            return renderRecordEmbed(embed.record || embed);
        }
        if (embedType === 'app.bsky.embed.recordWithMedia#view' || embedType === 'app.bsky.embed.recordWithMedia') {
            // Pass the whole #view object containing .media and .record properties
            return renderRecordWithMediaEmbed(embed);
        }
        if (embedType === 'app.bsky.embed.video#view' || embedType === 'app.bsky.embed.video') {
            // Pass the #view object containing .playlist, .thumbnail etc.
            return renderVideoEmbed(embed);
        }

        // Log if an embed type is encountered that we don't handle
        console.warn("Unhandled embed type encountered:", embedType, embed);
        return null; // Return null for unhandled types

    } catch (error) {
        // Catch errors thrown by individual embed renderers
        console.error(`Error rendering embed type ${embedType}:`, error, "Data:", embed);
        // Create a simple error placeholder element to show in the UI
        const errorDiv = document.createElement('div');
        errorDiv.textContent = '[Error loading embed content]';
        errorDiv.style.color = 'red';
        errorDiv.style.padding = '10px';
        errorDiv.style.border = '1px dashed red';
        return errorDiv;
    }
}


/**
 * Creates the footer element (Metrics, JSON View button).
 * @param {object} post - The post object from the API.
 * @param {object} postData - The full combined object { post, meta } for the JSON modal.
 * @returns {HTMLElement} The footer div element.
 */
function createPostFooterElement(post, postData) {
    const footerDiv = document.createElement('div');
    footerDiv.className = 'post-footer';

    // Metrics Section (Likes, Reposts, Replies, Quotes)
    const metricsDiv = document.createElement('div');
    metricsDiv.className = 'post-metrics';
    metricsDiv.appendChild(createMetricItem('heart', post.likeCount)); // Likes first
    metricsDiv.appendChild(createMetricItem('repeat', post.repostCount));
    metricsDiv.appendChild(createMetricItem('chat-centered', post.replyCount));
    metricsDiv.appendChild(createMetricItem('quotes', post.quoteCount));
    footerDiv.appendChild(metricsDiv); // Add metrics block to footer

    // JSON View Button Section
    const jsonButton = document.createElement('button');
    jsonButton.className = 'post-json-button';
    jsonButton.title = 'View raw JSON data';
    jsonButton.innerHTML = '<i class="ph-bold ph-code"></i>'; // Phosphor code icon
    jsonButton.onclick = (event) => {
        event.stopPropagation(); // Prevent potential parent clicks
        // Show the JSON modal, passing the *full* combined postData object
        showJsonModal(postData);
    };
    footerDiv.appendChild(jsonButton); // Add JSON button to footer

    return footerDiv; // Return the constructed footer
}