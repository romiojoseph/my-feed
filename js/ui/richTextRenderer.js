// js/ui/richTextRenderer.js

/**
 * Renders text content with embedded facets (links, mentions, tags).
 * Handles UTF-8 byte indices correctly.
 */
export function renderRichText(text, facets) {
    const fragment = document.createDocumentFragment();
    if (!text) return fragment;

    // Check for paragraph breaks (double newlines)
    if (text.includes('\n\n')) {
        // Split by double newlines to get paragraphs
        const paragraphs = text.split('\n\n');

        paragraphs.forEach((paragraph, index) => {
            const paragraphElement = document.createElement('p');
            paragraphElement.style.marginBottom = '1em'; // Add spacing between paragraphs

            // Process this paragraph with facets
            // We need to adjust the facet indices for each paragraph
            const adjustedFacets = [];
            if (facets && facets.length > 0) {
                // Calculate byte offsets for this paragraph
                let byteOffset = 0;
                for (let i = 0; i < index; i++) {
                    // Add bytes for each previous paragraph plus the double newline separator
                    byteOffset += (new TextEncoder()).encode(paragraphs[i]).length +
                        (new TextEncoder()).encode('\n\n').length;
                }

                // Filter and adjust facets for this paragraph
                const paragraphBytes = (new TextEncoder()).encode(paragraph).length;
                facets.forEach(facet => {
                    const start = facet.index.byteStart;
                    const end = facet.index.byteEnd;

                    // Check if facet is within this paragraph's byte range
                    if (start >= byteOffset && start < byteOffset + paragraphBytes) {
                        // Adjust facet indices to be relative to this paragraph
                        const adjustedFacet = JSON.parse(JSON.stringify(facet)); // Clone facet
                        adjustedFacet.index.byteStart = start - byteOffset;
                        adjustedFacet.index.byteEnd = Math.min(end - byteOffset, paragraphBytes);
                        adjustedFacets.push(adjustedFacet);
                    }
                });
            }

            // Render this paragraph with its adjusted facets
            const paragraphContent = renderParagraphContent(paragraph, adjustedFacets);
            paragraphElement.appendChild(paragraphContent);
            fragment.appendChild(paragraphElement);
        });

        return fragment;
    }

    // If no double newlines, process normally with existing code
    // Rest of existing code for single paragraph case...
    if (!facets || facets.length === 0) {
        fragment.appendChild(document.createTextNode(text));
        return fragment;
    }

    // Sort facets by start index to process them in order
    const sortedFacets = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const textBytes = encoder.encode(text);

    let currentByteIndex = 0;

    sortedFacets.forEach(facet => {
        // Basic validation for facet indices
        if (!facet.index || typeof facet.index.byteStart !== 'number' || typeof facet.index.byteEnd !== 'number') {
            console.warn('Skipping facet with invalid index:', facet);
            return;
        }

        const start = facet.index.byteStart;
        const end = facet.index.byteEnd;

        // More robust validation: prevent overlapping or invalid ranges
        if (start < currentByteIndex || end > textBytes.length || start >= end) {
            console.warn(`Skipping invalid or overlapping facet at [${start}-${end}]. Current index: ${currentByteIndex}. Text length: ${textBytes.length}`);
            return;
        }

        // Add text segment before the current facet
        if (start > currentByteIndex) {
            try {
                const textSegment = decoder.decode(textBytes.slice(currentByteIndex, start));
                fragment.appendChild(document.createTextNode(textSegment));
            } catch (e) {
                console.error(`Error decoding text segment [${currentByteIndex}-${start}]`, e);
            }
        }

        // Process the facet itself
        try {
            const facetBytes = textBytes.slice(start, end);
            const facetText = decoder.decode(facetBytes);
            const feature = facet.features && facet.features[0]; // Assume one feature per facet

            if (feature) {
                const link = document.createElement('a');
                link.textContent = facetText;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';

                let href = '#'; // Default href

                if (feature.$type === 'app.bsky.richtext.facet#link' && feature.uri) {
                    href = feature.uri;
                } else if (feature.$type === 'app.bsky.richtext.facet#mention' && feature.did) {
                    href = `https://bsky.app/profile/${feature.did}`;
                    link.title = `View profile: ${facetText}`;
                } else if (feature.$type === 'app.bsky.richtext.facet#tag' && feature.tag) {
                    href = `https://bsky.app/hashtag/${encodeURIComponent(feature.tag)}`;
                    link.title = `Search hashtag: ${facetText}`;
                } else {
                    console.warn("Unsupported or incomplete facet feature:", feature);
                    fragment.appendChild(document.createTextNode(facetText));
                    currentByteIndex = end;
                    return;
                }

                link.href = href;
                fragment.appendChild(link);
            } else {
                fragment.appendChild(document.createTextNode(facetText));
            }
        } catch (e) {
            console.error(`Error processing facet at [${start}-${end}]:`, e);
            try {
                const fallbackText = decoder.decode(textBytes.slice(start, end));
                fragment.appendChild(document.createTextNode(fallbackText));
            } catch { }
        }

        currentByteIndex = end;
    });

    // Add any remaining text after the last facet
    if (currentByteIndex < textBytes.length) {
        try {
            const remainingText = decoder.decode(textBytes.slice(currentByteIndex));
            fragment.appendChild(document.createTextNode(remainingText));
        } catch (e) {
            console.error(`Error decoding remaining text segment [${currentByteIndex}-end]`, e);
        }
    }

    return fragment;
}

// Helper function to process a single paragraph
function renderParagraphContent(text, facets) {
    const fragment = document.createDocumentFragment();
    if (!text) return fragment;

    if (!facets || facets.length === 0) {
        fragment.appendChild(document.createTextNode(text));
        return fragment;
    }

    // Sort facets by start index to process them in order
    const sortedFacets = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const textBytes = encoder.encode(text);

    let currentByteIndex = 0;

    sortedFacets.forEach(facet => {
        if (!facet.index || typeof facet.index.byteStart !== 'number' || typeof facet.index.byteEnd !== 'number') {
            return;
        }

        const start = facet.index.byteStart;
        const end = facet.index.byteEnd;

        if (start < currentByteIndex || end > textBytes.length || start >= end) {
            return;
        }

        // Add text segment before the current facet
        if (start > currentByteIndex) {
            try {
                const textSegment = decoder.decode(textBytes.slice(currentByteIndex, start));
                fragment.appendChild(document.createTextNode(textSegment));
            } catch (e) { }
        }

        // Process the facet itself
        try {
            const facetBytes = textBytes.slice(start, end);
            const facetText = decoder.decode(facetBytes);
            const feature = facet.features && facet.features[0];

            if (feature) {
                const link = document.createElement('a');
                link.textContent = facetText;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';

                let href = '#';

                if (feature.$type === 'app.bsky.richtext.facet#link' && feature.uri) {
                    href = feature.uri;
                } else if (feature.$type === 'app.bsky.richtext.facet#mention' && feature.did) {
                    href = `https://bsky.app/profile/${feature.did}`;
                    link.title = `View profile: ${facetText}`;
                } else if (feature.$type === 'app.bsky.richtext.facet#tag' && feature.tag) {
                    href = `https://bsky.app/hashtag/${encodeURIComponent(feature.tag)}`;
                    link.title = `Search hashtag: ${facetText}`;
                } else {
                    fragment.appendChild(document.createTextNode(facetText));
                    currentByteIndex = end;
                    return;
                }

                link.href = href;
                fragment.appendChild(link);
            } else {
                fragment.appendChild(document.createTextNode(facetText));
            }
        } catch (e) {
            try {
                const fallbackText = decoder.decode(textBytes.slice(start, end));
                fragment.appendChild(document.createTextNode(fallbackText));
            } catch { }
        }

        currentByteIndex = end;
    });

    // Add any remaining text after the last facet
    if (currentByteIndex < textBytes.length) {
        try {
            const remainingText = decoder.decode(textBytes.slice(currentByteIndex));
            fragment.appendChild(document.createTextNode(remainingText));
        } catch { }
    }

    return fragment;
}