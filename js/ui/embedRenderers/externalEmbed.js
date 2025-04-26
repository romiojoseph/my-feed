// js/ui/embedRenderers/externalEmbed.js

/**
 * Renders an external link embed.
 * Expects `embedData` to be the external object from the #view structure.
 */
export function renderExternalEmbed(embedData) {
    if (!embedData?.uri) {
        return null;
    }

    const external = embedData;
    const link = document.createElement('a');
    link.className = 'embed-external';
    link.href = external.uri;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    // Only create and append thumb if external.thumb exists and is a non-empty string
    if (external.thumb && typeof external.thumb === 'string' && external.thumb.trim() !== '') {
        const thumb = document.createElement('img');
        thumb.className = 'embed-external-thumb';
        thumb.src = external.thumb;
        thumb.alt = ''; // Decorative
        thumb.loading = 'lazy';
        //onerror handled by CSS potentially, or add JS fallback
        thumb.onerror = (e) => { e.target.classList.add('hidden'); }; // Use CSS class to hide
        link.appendChild(thumb);
    } else {
        // Optionally add a class if no thumb exists, for different styling
        link.classList.add('no-thumb');
    }

    const infoDiv = document.createElement('div');
    infoDiv.className = 'embed-external-info';

    const title = document.createElement('div');
    title.className = 'embed-external-title';
    title.textContent = external.title || 'External Link';
    infoDiv.appendChild(title);

    if (external.description) {
        const desc = document.createElement('div');
        desc.className = 'embed-external-desc';
        desc.textContent = external.description;
        infoDiv.appendChild(desc);
    }

    const url = document.createElement('div');
    url.className = 'embed-external-url';
    try {
        url.textContent = new URL(external.uri).hostname.replace(/^www\./, '');
    } catch {
        url.textContent = external.uri;
    }
    infoDiv.appendChild(url);

    link.appendChild(infoDiv);
    return link;
}