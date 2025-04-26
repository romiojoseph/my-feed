// js/ui/embedRenderers/videoEmbed.js

/**
 * Renders a video embed using HLS.js.
 * Expects `embedData` to be the video object from the #view structure.
 */
export function renderVideoEmbed(embedData) {
    if (!embedData?.playlist) {
        console.warn("Video embed skipped: Missing playlist URL", embedData);
        return null;
    }

    const videoDiv = document.createElement('div');
    videoDiv.className = 'embed-video';

    const videoElement = document.createElement('video');
    videoElement.controls = true;
    videoElement.preload = 'metadata';
    videoElement.style.display = 'none'; // Hide until loaded
    if (embedData.aspectRatio) {
        videoElement.style.aspectRatio = `${embedData.aspectRatio.width} / ${embedData.aspectRatio.height}`;
    }

    const thumbElement = document.createElement('img');
    thumbElement.className = 'video-thumb';
    thumbElement.src = embedData.thumbnail || 'assets/social-image.png'; // Use thumb or placeholder
    thumbElement.alt = 'Video thumbnail';
    thumbElement.loading = 'lazy';
    thumbElement.onerror = () => { thumbElement.src = 'assets/social-image.png'; };
    if (embedData.aspectRatio) {
        thumbElement.style.aspectRatio = `${embedData.aspectRatio.width} / ${embedData.aspectRatio.height}`;
    }

    const playButtonOverlay = document.createElement('div');
    playButtonOverlay.className = 'play-button-overlay';

    videoDiv.appendChild(thumbElement);
    videoDiv.appendChild(playButtonOverlay);
    videoDiv.appendChild(videoElement);

    const initHlsPlayer = () => {
        thumbElement.style.display = 'none';
        playButtonOverlay.style.display = 'none';
        videoElement.style.display = 'block';

        const videoSrc = embedData.playlist;

        // Check if HLS is globally available (loaded via CDN)
        if (typeof Hls === 'undefined') {
            console.error("Hls.js library not loaded.");
            displayVideoError(videoDiv, "Video player library not loaded.");
            return;
        }

        if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(videoSrc);
            hls.attachMedia(videoElement);
            hls.on(Hls.Events.MANIFEST_PARSED, function () {
                videoElement.play().catch(e => console.warn("Video play prevented by browser:", e));
            });
            hls.on(Hls.Events.ERROR, function (event, data) {
                // Only log fatal errors or errors that aren't mediaSourcEnded (expected at playback end)
                if (data.fatal || data.details !== 'bufferSeekOverHole') {
                    console.error('HLS Error:', data);

                    // Only show error UI for fatal errors
                    if (data.fatal) {
                        displayVideoError(videoDiv, `Video playback failed (${data.type}: ${data.details})`);
                        thumbElement.style.display = 'block';
                        playButtonOverlay.style.display = 'flex';
                        videoElement.style.display = 'none';
                    }
                }
            });
        } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari)
            videoElement.src = videoSrc;
            videoElement.addEventListener('loadedmetadata', function () {
                videoElement.play().catch(e => console.warn("Video play prevented by browser:", e));
            });
            videoElement.addEventListener('error', function (e) {
                console.error('Native HLS Error:', e);
                displayVideoError(videoDiv, "Video playback failed.");
                thumbElement.style.display = 'block';
                playButtonOverlay.style.display = 'flex';
                videoElement.style.display = 'none';
            });
        } else {
            console.warn('HLS video playback not supported in this browser.');
            displayVideoError(videoDiv, "HLS video not supported by browser.");
            thumbElement.style.display = 'block'; // Keep showing thumbnail
            playButtonOverlay.style.display = 'flex';
            videoElement.style.display = 'none';
        }
    };

    // Add click listener to initialize player
    videoDiv.addEventListener('click', initHlsPlayer, { once: true });

    return videoDiv;
}

function displayVideoError(container, message) {
    // Remove previous error messages
    container.querySelectorAll('.video-error-message').forEach(el => el.remove());

    const msg = document.createElement('p');
    msg.textContent = message;
    msg.className = 'video-error-message'; // Add class for styling if needed
    msg.style.color = 'red';
    msg.style.position = 'absolute';
    msg.style.bottom = '5px';
    msg.style.left = '5px';
    msg.style.backgroundColor = 'rgba(0,0,0,0.7)';
    msg.style.padding = '2px 5px';
    msg.style.fontSize = '0.8em';
    msg.style.zIndex = '1'; // Ensure it's above the thumbnail if shown
    container.appendChild(msg);
}