/**
 * Game REST endpoints (docs/protocol.md). Every response carries a GameView
 * computed for the requesting player; the client never sees a GameState.
 */
import { api } from './client'
import type { ShipLoadout } from '@dangerous-inclinations/engine'
import type { ForkResponse, GameViewResponse, ViewResponse } from './types'

/** The current view plus the full filtered event history. */
export async function getGame(gameId: string): Promise<GameViewResponse> {
  return api.get<GameViewResponse>(`/api/games/${gameId}`)
}

/** Deployment: place your ship and Home marker on a planet's outer ring. */
export async function deployShip(gameId: string, wellId: string, sector: number): Promise<ViewResponse> {
  return api.post<ViewResponse>(`/api/games/${gameId}/deploy`, { wellId, sector })
}

/** Loadout phase: the ship's tiles and the three missions kept from the five offered. */
export async function submitLoadout(
  gameId: string,
  loadout: ShipLoadout,
  missionIds: string[],
): Promise<ViewResponse> {
  return api.post<ViewResponse>(`/api/games/${gameId}/loadout`, { loadout, missionIds })
}

/** Fork a finished recording into a fresh live game. */
export async function forkRecording(args: {
  recordingId: string
  turnIndex: number
  impersonateOriginalPlayerId?: string
}): Promise<ForkResponse> {
  return api.post<ForkResponse>('/api/games/fork', args)
}
