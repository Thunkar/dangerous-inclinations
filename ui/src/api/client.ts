/**
 * Base API client. Adds the player id header and turns error bodies into
 * exceptions.
 */
import { ENV } from '../config/env'
import type { APIError } from './types'

export class APIClientError extends Error {
  public statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'APIClientError'
    this.statusCode = statusCode
  }
}

/** Where this browser remembers who is sitting here. */
export const STORAGE_KEY_PLAYER_ID = 'playerId'

export function getStoredPlayerId(): string | null {
  return localStorage.getItem(STORAGE_KEY_PLAYER_ID)
}

export async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const playerId = getStoredPlayerId()

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options.headers) {
    const existing =
      options.headers instanceof Headers
        ? Object.fromEntries(options.headers.entries())
        : (options.headers as Record<string, string>)
    Object.assign(headers, existing)
  }
  if (playerId) headers['x-player-id'] = playerId

  const url = `${ENV.API_URL}${endpoint}`

  try {
    const response = await fetch(url, { ...options, headers })
    const data = (await response.json().catch(() => null)) as (APIError & T) | null

    if (!response.ok) {
      const message =
        data?.error ?? (data?.errors && data.errors.length > 0 ? data.errors.join('; ') : `HTTP ${response.status}`)
      throw new APIClientError(message, response.status)
    }

    return data as T
  } catch (error) {
    if (error instanceof APIClientError) throw error
    throw new APIClientError(error instanceof Error ? error.message : 'Network error')
  }
}

export const api = {
  get: <T>(endpoint: string) => apiCall<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, body?: unknown) =>
    apiCall<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(endpoint: string, body?: unknown) =>
    apiCall<T>(endpoint, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(endpoint: string, body?: unknown) =>
    apiCall<T>(endpoint, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(endpoint: string) => apiCall<T>(endpoint, { method: 'DELETE' }),
}
