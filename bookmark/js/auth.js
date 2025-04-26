// js/auth.js
const STORAGE_KEY = 'blueskySession';
const MAX_REFRESH_ATTEMPTS = 3;

// Client-side session expiry in milliseconds (e.g., 30 days) - For cleanup, not strict expiry
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Auto refresh timer management
let autoRefreshTimer = null;
const AUTO_REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

// --- Add a variable to hold the UI logout handler ---
let uiLogoutHandler = null;

async function login(identifier, password, blueskyApi) {
    let sessionData;
    try {
        sessionData = await blueskyApi.createSession(identifier, password);
        if (!sessionData?.did) throw new Error("Login failed: Invalid session data received.");

        let profileData = {};
        try {
            // Use the access token we just got to fetch the profile
            const authHeaders = { 'Authorization': `Bearer ${sessionData.accessJwt}` };
            const profileUrl = `https://bsky.social/xrpc/app.bsky.actor.getProfile?actor=${sessionData.did}`;
            const profileResponse = await fetch(profileUrl, { headers: authHeaders });
            if (!profileResponse.ok) {
                console.warn(`Could not fetch profile for ${sessionData.handle}: ${profileResponse.status} ${profileResponse.statusText}`);
            } else {
                profileData = await profileResponse.json();
            }
        }
        catch (profileError) {
            console.warn(`Could not fetch profile for ${sessionData.handle}: ${profileError.message}`);
            // Continue with login even if profile fetch fails
        }

        const sessionToStore = {
            accessJwt: sessionData.accessJwt,
            refreshJwt: sessionData.refreshJwt,
            did: sessionData.did,
            handle: sessionData.handle,
            displayName: profileData?.displayName || sessionData.handle,
            loginTimestamp: Date.now()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionToStore));

        // Set up auto refresh is now done in script.js after login succeeds

        return sessionToStore;

    } catch (error) {
        console.error("Login failed:", error);
        localStorage.removeItem(STORAGE_KEY); // Ensure cleanup on login fail
        throw error;
    }
}

function logout() {
    console.log("Logging out (auth.js)...");
    localStorage.removeItem(STORAGE_KEY);
    console.log("Session cleared from localStorage.");

    // Clear auto refresh timer
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
        console.log("Auto refresh timer cleared.");
    }
    // Don't call the UI handler from here, let the caller handle UI updates
}

function getSession() {
    const storedSession = localStorage.getItem(STORAGE_KEY);
    if (storedSession) {
        try {
            const session = JSON.parse(storedSession);

            // Check client-side expiry (useful for cleanup, not strict security)
            if (SESSION_MAX_AGE_MS && session.loginTimestamp) {
                const age = Date.now() - session.loginTimestamp;
                if (age > SESSION_MAX_AGE_MS) {
                    console.log(`Client-side session expired (age: ${Math.round(age / 1000 / 60)} mins). Needs refresh or login.`);
                    // Don't logout here, let refresh handle it or proactive check
                }
            }

            // Basic validation of essential fields
            if (session.did && session.accessJwt && session.refreshJwt) {
                return session; // Return valid session object
            } else {
                console.warn("Stored session missing essential fields (did, accessJwt, refreshJwt). Discarding.");
                logout(); // Clear invalid partial session
                return null;
            }

        } catch (e) {
            console.error("Failed to parse stored session:", e);
            logout(); // Clear corrupted session
            return null;
        }
    }
    return null;
}

async function refreshSession(blueskyApi) {
    console.log("Attempting session refresh...");
    // Get current session data directly from storage *within* refresh logic
    // to ensure we use the latest refresh token if it was updated recently.
    const storedSession = localStorage.getItem(STORAGE_KEY);
    let currentSession = null;
    if (storedSession) {
        try { currentSession = JSON.parse(storedSession); } catch (e) { /* ignore parsing error here, handled below */ }
    }

    if (!currentSession?.refreshJwt) {
        console.warn("No valid session or refresh token found in storage. Cannot refresh.");
        // If a session key exists but has no refresh token, clear it.
        if (localStorage.getItem(STORAGE_KEY)) {
            logout();
            // If the UI handler is set, trigger immediate logout on UI
            if (typeof uiLogoutHandler === 'function') {
                console.log("Triggering UI logout due to missing refresh token.");
                uiLogoutHandler();
            }
        }
        return null; // Indicate failure
    }

    try {
        // Use the _refreshSessionInternal defined in blueskyApi.js via the passed instance
        const newSessionData = await blueskyApi.refreshSession(currentSession.refreshJwt);

        if (!newSessionData?.did || !newSessionData.accessJwt || !newSessionData.refreshJwt) {
            throw new Error("Refresh failed: Invalid session data received from API.");
        }

        // Preserve original displayName and handle if possible, update tokens and timestamp
        const sessionToStore = {
            accessJwt: newSessionData.accessJwt,
            refreshJwt: newSessionData.refreshJwt, // Store the potentially new refresh token
            did: newSessionData.did,
            handle: newSessionData.handle || currentSession.handle, // Use new handle if provided
            displayName: currentSession.displayName || newSessionData.handle || 'Unknown', // Keep old display name
            loginTimestamp: Date.now() // Update timestamp on successful refresh
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionToStore));
        console.log("Session refreshed successfully.");
        return sessionToStore; // Return the new session data

    } catch (error) {
        console.error("Session refresh API call failed:", error);
        // IMPORTANT: Call logout() to clear the invalid session from storage
        logout();
        // IMPORTANT: Trigger the UI logout via the handler
        if (typeof uiLogoutHandler === 'function') {
            console.log("Triggering UI logout due to refresh API failure.");
            uiLogoutHandler('Your session expired. Please log in again.'); // Pass reason
        }
        return null; // Indicate failure
    }
}


async function getAuthHeaders() {
    const session = getSession();
    // Check accessJwt specifically
    if (!session?.accessJwt) {
        console.log("No valid access token found for auth headers.");
        return null;
    }
    return { 'Authorization': `Bearer ${session.accessJwt}` };
}

// --- Modified setupAutoRefresh ---
// Accepts blueskyApi instance and the UI logout handler function
function setupAutoRefresh(blueskyApi, logoutHandlerCallback) {
    // Store the handler
    uiLogoutHandler = logoutHandlerCallback;

    // Clear existing timer if any
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }

    // Set up new timer
    autoRefreshTimer = setInterval(async () => {
        console.log("Auto refresh timer triggered");
        const session = getSession(); // Check if session *still* exists

        // Check specifically for refreshJwt existence before attempting refresh
        if (session?.refreshJwt) {
            try {
                // Refresh session will handle logout and calling uiLogoutHandler on failure
                const refreshed = await refreshSession(blueskyApi);
                if (refreshed) {
                    console.log("Auto refresh completed successfully");
                } else {
                    console.log("Auto refresh failed (handled by refreshSession).");
                    // No need to call logoutHandler here, refreshSession does it.
                    // Timer is cleared within logout() called by refreshSession.
                }
            } catch (error) {
                // Should not happen if refreshSession handles its errors, but just in case
                console.error("Unexpected error during auto refresh interval:", error);
                logout(); // Cleanup local storage
                if (typeof uiLogoutHandler === 'function') {
                    uiLogoutHandler('An error occurred during auto-refresh. Please log in again.');
                }
            }
        } else {
            // If session (or refreshJwt) doesn't exist when timer runs, stop.
            console.log("No valid session/refreshJwt for auto refresh, clearing timer.");
            logout(); // Ensure cleanup
            // No need to call handler here, assume logout happened elsewhere or wasn't needed
        }
    }, AUTO_REFRESH_INTERVAL);

    console.log("Auto refresh timer set up");
}

// Export MAX_REFRESH_ATTEMPTS needed by blueskyApi.js
export { login, logout, getSession, refreshSession, getAuthHeaders, setupAutoRefresh, MAX_REFRESH_ATTEMPTS };