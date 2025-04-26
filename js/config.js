// js/config.js
export const LIST_RECORDS_URL = 'https://bsky.social/xrpc/com.atproto.repo.listRecords';
export const GET_POSTS_URL = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts';
export const RESOLVE_HANDLE_URL = 'https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle';

// Using the custom collection provided by the user
export const BOOKMARK_COLLECTION = 'user.bookmark.feed.public';

export const DEFAULT_DID = 'did:plc:xglrcj6gmrpktysohindaqhj'; // Example DID provided
export const POSTS_PER_FETCH = 25; // Max allowed by getPosts API
export const API_RETRY_DELAY = 500; // ms delay between getPosts chunks