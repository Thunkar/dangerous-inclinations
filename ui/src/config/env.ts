/**
 * Environment configuration for the UI
 * Reads from Vite environment variables with sensible defaults
 */

export const ENV = {
  // API base URL for HTTP requests
  API_URL: import.meta.env.VITE_API_URL || "http://localhost:3000",

  // WebSocket base URL for real-time connections
  WS_URL: import.meta.env.VITE_WS_URL || "ws://localhost:3000",

  // Enable/disable multiplayer mode (for gradual migration)
  MULTIPLAYER_MODE:
    import.meta.env.VITE_MULTIPLAYER_MODE !== "false" && true, // Default to true

  // Debug logging
  DEBUG: import.meta.env.DEV,
} as const;

// Log configuration in development
if (ENV.DEBUG) {
  console.log("[ENV] Configuration:", ENV);
}
