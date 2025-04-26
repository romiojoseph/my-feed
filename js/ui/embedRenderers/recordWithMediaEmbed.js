import { renderImageEmbed } from './imageEmbed.js';
import { renderExternalEmbed } from './externalEmbed.js';
import { renderRecordEmbed } from './recordEmbed.js';
import { createBlockedPlaceholder } from '../domUtils.js';

/**
 * Renders a record-with-media embed without extra wrapper div.
 */
export function renderRecordWithMediaEmbed(embedData) {
    if (!embedData?.media || !embedData?.record) {
        console.warn("RecordWithMedia embed skipped: Missing media or record component", embedData);
        return null;
    }

    const fragment = document.createDocumentFragment();

    // Render Media
    const mediaType = embedData.media.$type;
    let mediaElement = null;
    if (mediaType === 'app.bsky.embed.images#view' || mediaType === 'app.bsky.embed.images') {
        mediaElement = renderImageEmbed(embedData.media.images || embedData.media);
    } else if (mediaType === 'app.bsky.embed.external#view' || mediaType === 'app.bsky.embed.external') {
        mediaElement = renderExternalEmbed(embedData.media.external || embedData.media);
    } else {
        console.warn("Unsupported media type within RecordWithMedia:", mediaType);
    }

    if (mediaElement) {
        mediaElement.classList.add('record-with-media-media');
        fragment.appendChild(mediaElement);
    }

    // Render Record
    let recordElement = renderRecordEmbed(embedData.record.record || embedData.record);

    if (recordElement) {
        recordElement.classList.add('record-with-media-record');
        if (recordElement.classList.contains('embed-record')) {
            const innerContent = recordElement.firstChild;
            fragment.appendChild(innerContent || recordElement);
        } else {
            fragment.appendChild(recordElement);
        }
    } else {
        fragment.appendChild(createBlockedPlaceholder('[Could not load quoted post part]'));
    }

    return fragment;
}
