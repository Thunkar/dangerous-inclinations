/**
 * Environment configuration for the UI.
 * Reads from Vite environment variables with sensible defaults.
 */
/**
 * In development the server is its own process on :3000. A production build
 * is served from one origin (deploy/nginx.conf hands /api and /ws to the
 * server), so it talks to whatever host it was loaded from.
 */
const SERVER_ORIGIN = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin

export const ENV = {
  /** API base URL for HTTP requests */
  API_URL: import.meta.env.VITE_API_URL || SERVER_ORIGIN,
  /** WebSocket base URL for real-time connections */
  WS_URL: import.meta.env.VITE_WS_URL || SERVER_ORIGIN.replace(/^http/, 'ws'),
  /** Development mode */
  DEBUG: import.meta.env.DEV,
} as const
