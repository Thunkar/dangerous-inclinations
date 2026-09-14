/**
 * Environment configuration for the UI.
 * Reads from Vite environment variables with sensible defaults.
 */
export const ENV = {
  /** API base URL for HTTP requests */
  API_URL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  /** WebSocket base URL for real-time connections */
  WS_URL: import.meta.env.VITE_WS_URL || 'ws://localhost:3000',
  /** Development mode */
  DEBUG: import.meta.env.DEV,
} as const
