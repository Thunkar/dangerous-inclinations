/**
 * Game REST endpoints (docs/protocol.md). Every response carries a GameView
 * computed for the requesting player; the client never sees a GameState.
 */
import { api } from './client'
import type { ShipLoadout, ShipAppearance } from '@dangerous-inclinations/engine'
import type {
  ChatHistoryResponse,
  ChatKind,
  ChatPostResponse,
  ForkResponse,
  GameViewResponse,
  ViewResponse,
} from './types'

/** The current view plus the full filtered event history. */
export async function getGame(gameId: string): Promise<GameViewResponse> {
  return api.get<GameViewResponse>(`/api/games/${gameId}`)
}

/** Deployment: place your ship and Home marker on a Black Hole Ring 4 sector. */
export async function deployShip(gameId: string, sector: number): Promise<ViewResponse> {
  return api.post<ViewResponse>(`/api/games/${gameId}/deploy`, { sector })
}

/** Loadout phase: the ship's tiles and the three missions kept from the five offered. */
export async function submitLoadout(
  gameId: string,
  loadout: ShipLoadout,
  missionIds: string[],
  appearance?: ShipAppearance
): Promise<ViewResponse> {
  return api.post<ViewResponse>(`/api/games/${gameId}/loadout`, { loadout, missionIds, appearance })
}

/** Table talk so far, oldest first. */
export async function getChat(gameId: string): Promise<ChatHistoryResponse> {
  return api.get<ChatHistoryResponse>(`/api/games/${gameId}/chat`)
}

/** Say something at the table (or think out loud); the server tells every seat. */
export async function postChat(
  gameId: string,
  text: string,
  kind: ChatKind = 'say'
): Promise<ChatPostResponse> {
  return api.post<ChatPostResponse>(`/api/games/${gameId}/chat`, { text, kind })
}

/** Fork a finished recording into a fresh live game. */
export async function forkRecording(args: {
  recordingId: string
  turnIndex: number
  impersonateOriginalPlayerId?: string
}): Promise<ForkResponse> {
  return api.post<ForkResponse>('/api/games/fork', args)
}
