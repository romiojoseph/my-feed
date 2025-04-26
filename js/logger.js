// js/logger.js

let logMessages = [];
const MAX_LOG_MESSAGES = 200;

// No longer overriding console.log etc.
// We will use an explicit function for important events.

/**
 * Logs a specific event message to the internal log store.
 * @param {string} message - The message to log.
 */
export function logEvent(message) {
    if (typeof message !== 'string' || message.trim() === '') {
        return;
    }
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;

    logMessages.push(logEntry);

    // Trim old messages
    if (logMessages.length > MAX_LOG_MESSAGES) {
        logMessages.shift();
    }

    // DO NOT log regular events to console
    // Only errors and warnings should be logged via console.error/console.warn
}

export function getLogs() {
    return logMessages;
}

export function clearLogs() {
    logMessages = [];
    logEvent("Log Cleared"); // Log the clearing action itself
    console.log("Internal log cleared via UI.");
}

// Initial log message
logEvent("Logger Initialized.");