// js/timeUtils.js

/**
 * Formats a timestamp into "DD Mon YYYY, hh:mm A" format.
 * @param {string | Date | number} timestampInput - The timestamp to format.
 * @returns {string} Formatted date string.
 */
export function formatTimestamp(timestampInput) {
    try {
        const date = new Date(timestampInput);
        if (isNaN(date)) return "Invalid Date";

        const optionsDate = { day: '2-digit', month: 'short', year: 'numeric' };
        const optionsTime = { hour: 'numeric', minute: '2-digit', hour12: true };

        const formattedDate = date.toLocaleDateString(undefined, optionsDate);
        const formattedTime = date.toLocaleTimeString(undefined, optionsTime);

        return `${formattedDate}, ${formattedTime}`;
    } catch (e) {
        console.error("Error formatting timestamp:", e);
        return "Invalid Date";
    }
}

/**
 * Formats a timestamp into a relative time string (e.g., "3mo ago").
 * @param {string | Date | number} timestampInput - The timestamp to format.
 * @returns {string} Relative time string.
 */
export function formatRelativeTime(timestampInput) {
    try {
        const date = new Date(timestampInput);
        if (isNaN(date)) return "Invalid Date";

        const now = new Date();
        const seconds = Math.round((now - date) / 1000);
        const minutes = Math.round(seconds / 60);
        const hours = Math.round(minutes / 60);
        const days = Math.round(hours / 24);
        const weeks = Math.round(days / 7);
        const months = Math.round(days / 30.44); // Average month length
        const years = Math.round(days / 365.25); // Average year length

        if (seconds < 60) return `${seconds}s ago`;
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        if (weeks < 5) return `${weeks}w ago`; // Show weeks up to ~a month
        if (months < 12) return `${months}mo ago`;
        return `${years}y ago`;

    } catch (e) {
        console.error("Error formatting relative time:", e);
        return "Invalid Date";
    }
}