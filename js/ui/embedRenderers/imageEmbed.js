// js/ui/embedRenderers/imageEmbed.js
import { logEvent } from '../../logger.js';

/**
 * Renders an image embed, using a carousel for multiple images.
 * Expects `images` to be the array of image objects from the #view structure.
 */
export function renderImageEmbed(images) {
    if (!Array.isArray(images) || images.length === 0) {
        return null;
    }

    const imageCount = images.length;

    // --- Single Image ---
    if (imageCount === 1) {
        const image = images[0];
        if (!image.fullsize) return null;

        const singleImageDiv = document.createElement('div');
        singleImageDiv.className = 'embed-images single-image';

        const imgLink = document.createElement('a');
        imgLink.href = image.fullsize;
        imgLink.target = '_blank';
        imgLink.rel = 'noopener noreferrer';
        imgLink.title = image.alt || 'View full image';

        const img = document.createElement('img');
        img.src = image.thumb || image.fullsize;
        img.alt = image.alt || 'Embedded image';
        img.loading = 'lazy';
        img.onerror = (e) => {
            console.warn(`Failed to load image: ${e.target.src}`);
            e.target.style.display = 'none';
            e.target.parentElement.style.display = 'none';
        };
        imgLink.appendChild(img);
        singleImageDiv.appendChild(imgLink);
        return singleImageDiv;
    }

    // --- Multiple Images (Carousel) ---
    const carouselId = `carousel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const carouselDiv = document.createElement('div');
    // Add the ID and the marker class for initialization
    carouselDiv.className = 'embed-images image-carousel needs-carousel-init';
    carouselDiv.id = carouselId;

    const slidesContainer = document.createElement('div');
    slidesContainer.className = 'carousel-slides';

    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'carousel-dots';

    let validImageCount = 0; // Keep track of images successfully added

    images.forEach((image, index) => {
        if (!image.fullsize || !image.thumb) { // Require both thumb and fullsize for carousel
            console.warn(`Skipping carousel image ${index + 1}: Missing fullsize or thumb URL.`);
            return;
        };

        // Create Slide
        const slide = document.createElement('div');
        slide.className = 'carousel-slide';
        if (validImageCount === 0) slide.classList.add('active'); // First valid slide is active

        const imgLink = document.createElement('a');
        imgLink.href = image.fullsize;
        imgLink.target = '_blank';
        imgLink.rel = 'noopener noreferrer';
        imgLink.title = image.alt || `View full image ${index + 1}`;
        imgLink.addEventListener('dragstart', (e) => e.preventDefault());

        const img = document.createElement('img');
        img.src = image.thumb; // Use thumb for carousel display
        img.alt = image.alt || `Image ${index + 1} of ${imageCount}`; // Use original count for alt text
        img.loading = 'lazy';
        img.onerror = (e) => {
            console.warn(`Failed to load carousel image: ${e.target.src}`);
            slide.innerHTML = '<p class="carousel-load-error">Image failed to load</p>';
        };

        imgLink.appendChild(img);
        slide.appendChild(imgLink);
        slidesContainer.appendChild(slide);

        // Create Dot
        const dot = document.createElement('button');
        dot.className = 'carousel-dot';
        dot.type = 'button';
        dot.dataset.slideIndex = validImageCount; // Use validImageCount for index
        dot.setAttribute('aria-label', `Go to image ${validImageCount + 1}`);
        if (validImageCount === 0) dot.classList.add('active');
        dotsContainer.appendChild(dot);

        validImageCount++; // Increment count of successfully added images
    });

    // Only proceed if at least one valid image was added
    if (validImageCount === 0) {
        console.warn("No valid images found for carousel.");
        return null; // Return null if no images could be added
    }

    // If only one valid image, return it as a single image block
    if (validImageCount === 1) {
        const firstSlide = slidesContainer.firstChild;
        // Reconstruct a single-image div structure
        const singleImageDiv = document.createElement('div');
        singleImageDiv.className = 'embed-images single-image';
        // Move the content (the link and image) from the slide
        while (firstSlide.firstChild) {
            singleImageDiv.appendChild(firstSlide.firstChild);
        }
        return singleImageDiv;
    }

    carouselDiv.appendChild(slidesContainer);

    // Add Arrows (only if more than one valid image)
    const prevButton = document.createElement('button');
    prevButton.type = 'button';
    prevButton.className = 'carousel-arrow prev';
    prevButton.innerHTML = '<i class="ph ph-caret-left"></i>';
    prevButton.setAttribute('aria-label', 'Previous image');
    carouselDiv.appendChild(prevButton);

    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.className = 'carousel-arrow next';
    nextButton.innerHTML = '<i class="ph ph-caret-right"></i>';
    nextButton.setAttribute('aria-label', 'Next image');
    carouselDiv.appendChild(nextButton);

    // Add Dots container
    carouselDiv.appendChild(dotsContainer);

    // DO NOT CALL setupCarousel here anymore

    return carouselDiv; // Return the uninitialized carousel structure
}


/**
 * Encapsulates the JavaScript logic for a specific carousel instance.
 * Needs to be called AFTER the carousel element is in the DOM.
 * @param {string} carouselId - The unique ID of the carousel container element.
 */
export function setupCarousel(carouselId) { // Make sure this function is exported
    const carousel = document.getElementById(carouselId);
    if (!carousel) {
        // This log should now only appear if the ID is genuinely wrong or element removed
        console.error(`Carousel element not found during setup: #${carouselId}`);
        return;
    }

    // Check if already initialized
    if (carousel.classList.contains('carousel-initialized')) {
        // console.log(`Carousel #${carouselId} already initialized.`);
        return;
    }

    const slidesContainer = carousel.querySelector('.carousel-slides');
    const slides = carousel.querySelectorAll('.carousel-slide');
    const dots = carousel.querySelectorAll('.carousel-dot');
    const prevButton = carousel.querySelector('.carousel-arrow.prev');
    const nextButton = carousel.querySelector('.carousel-arrow.next');

    if (!slidesContainer || slides.length <= 1 || !dots.length || !prevButton || !nextButton) {
        console.warn(`Carousel #${carouselId} missing required elements or has only one slide. Skipping full setup.`);
        // Hide controls if they exist but aren't needed
        if (prevButton) prevButton.style.display = 'none';
        if (nextButton) nextButton.style.display = 'none';
        const dotsCont = carousel.querySelector('.carousel-dots');
        if (dotsCont) dotsCont.style.display = 'none';
        carousel.classList.add('carousel-initialized'); // Mark as processed
        return;
    }

    let currentIndex = 0;
    let touchStartX = 0;
    let touchEndX = 0;
    let isDragging = false;
    const slideCount = slides.length; // Use the actual number of slides found

    function updateCarousel() {
        const offset = -currentIndex * 100;
        slidesContainer.style.transform = `translateX(${offset}%)`;

        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === currentIndex);
        });

        prevButton.disabled = currentIndex === 0;
        nextButton.disabled = currentIndex === slideCount - 1;

        slides.forEach((slide, index) => {
            slide.classList.toggle('active', index === currentIndex);
        });
    }

    function showSlide(index) {
        // Allow wrapping (optional, remove if not desired)
        // if (index < 0) index = slideCount - 1;
        // if (index >= slideCount) index = 0;

        // No wrapping:
        if (index < 0 || index >= slideCount) return;

        currentIndex = index;
        updateCarousel();
    }

    prevButton.addEventListener('click', () => showSlide(currentIndex - 1));
    nextButton.addEventListener('click', () => showSlide(currentIndex + 1));

    dots.forEach(dot => {
        dot.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.slideIndex, 10);
            if (!isNaN(index)) { // Ensure index is a valid number
                showSlide(index);
            }
        });
    });

    // --- Touch Swipe Navigation ---
    let initialScrollY = 0; // Track vertical scroll to differentiate scroll from swipe
    slidesContainer.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        initialScrollY = window.scrollY; // Record initial scroll position
        isDragging = false;
        slidesContainer.style.transition = 'none';
    }, { passive: true });

    slidesContainer.addEventListener('touchmove', (e) => {
        if (touchStartX === 0) return; // Should not happen if touchstart fired

        // Check for significant vertical scroll - if so, likely not a swipe attempt
        if (Math.abs(window.scrollY - initialScrollY) > 10) { // Adjust threshold as needed
            // Reset swipe detection if user is scrolling vertically
            touchStartX = 0;
            isDragging = false;
            slidesContainer.style.transition = ''; // Restore transition if needed
            return;
        }

        touchEndX = e.touches[0].clientX;
        isDragging = true;
        const diff = touchEndX - touchStartX;
        // Apply temporary transform only during drag
        slidesContainer.style.transform = `translateX(${-currentIndex * 100 + (diff / slidesContainer.offsetWidth * 100)}%)`;

    }, { passive: true }); // Passive true allows default scroll behavior unless cancelled by logic

    slidesContainer.addEventListener('touchend', () => {
        if (!isDragging || touchStartX === 0) { // Ensure it was a drag and startX is valid
            slidesContainer.style.transition = ''; // Restore transition if needed
            // Snap back if not a drag or if vertical scroll interrupted
            if (touchStartX !== 0) updateCarousel();
            touchStartX = 0; // Reset start X regardless
            isDragging = false;
            return;
        }

        slidesContainer.style.transition = ''; // Restore transition *before* calculating swipe
        const threshold = slidesContainer.offsetWidth / 5; // Adjust threshold (e.g., 1/5 width)
        const diff = touchEndX - touchStartX;

        if (Math.abs(diff) > threshold) {
            if (diff < 0 && currentIndex < slideCount - 1) {
                showSlide(currentIndex + 1); // Swipe Left (Next)
            } else if (diff > 0 && currentIndex > 0) {
                showSlide(currentIndex - 1); // Swipe Right (Prev)
            } else {
                updateCarousel(); // Snap back at boundaries
            }
        } else {
            updateCarousel(); // Snap back if below threshold
        }

        touchStartX = 0;
        touchEndX = 0;
        isDragging = false;
    });

    // Prevent link clicks during/after swipe
    slidesContainer.addEventListener('click', (e) => {
        if (isDragging) {
            e.preventDefault();
            e.stopPropagation(); // Stop propagation as well
        }
    }, true); // Use capture phase

    // --- Keyboard Navigation (Optional) ---
    carousel.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            showSlide(currentIndex - 1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            showSlide(currentIndex + 1);
        }
    });
    carousel.setAttribute('tabindex', '0');
    carousel.style.outline = 'none';

    // Mark as initialized and perform initial setup
    carousel.classList.add('carousel-initialized');
    carousel.classList.remove('needs-carousel-init'); // Remove marker class
    updateCarousel();
    // logEvent(`Carousel #${carouselId} initialized successfully.`);
}