/**
 * Base API client for making HTTP requests to the server
 * Automatically handles authentication headers and error parsing
 */

import { ENV } from "../config/env";
import type { APIError } from "./types";

export class APIClientError extends Error {
  public statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "APIClientError";
    this.statusCode = statusCode;
  }
}

/**
 * Base fetch wrapper with automatic authentication and error handling
 */
export async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  // Get player ID from localStorage if available
  const playerId = localStorage.getItem("playerId");

  // Build headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Merge existing headers
  if (options.headers) {
    const existingHeaders =
      options.headers instanceof Headers
        ? Object.fromEntries(options.headers.entries())
        : options.headers;
    Object.assign(headers, existingHeaders);
  }

  // Add authentication header if player ID exists
  if (playerId) {
    headers["x-player-id"] = playerId;
  }

  // Build full URL
  const url = `${ENV.API_URL}${endpoint}`;

  if (ENV.DEBUG) {
    console.log(`[API] ${options.method || "GET"} ${url}`, {
      playerId,
      body: options.body,
    });
  }

  try {
    // Make request
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Parse response
    const data = await response.json().catch(() => null);

    // Handle errors
    if (!response.ok) {
      const error = data as APIError;
      throw new APIClientError(
        error?.error || `HTTP ${response.status}`,
        response.status,
      );
    }

    if (ENV.DEBUG) {
      console.log(`[API] Response:`, data);
    }

    return data as T;
  } catch (error) {
    if (error instanceof APIClientError) {
      throw error;
    }

    // Network error or other fetch error
    if (ENV.DEBUG) {
      console.error(`[API] Error:`, error);
    }
    throw new APIClientError(
      error instanceof Error ? error.message : "Network error",
    );
  }
}

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  get: <T>(endpoint: string) =>
    apiCall<T>(endpoint, {
      method: "GET",
    }),

  post: <T>(endpoint: string, body?: unknown) =>
    apiCall<T>(endpoint, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(endpoint: string, body?: unknown) =>
    apiCall<T>(endpoint, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(endpoint: string) =>
    apiCall<T>(endpoint, {
      method: "DELETE",
    }),
};
