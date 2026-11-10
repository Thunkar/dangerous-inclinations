/**
 * Game REST endpoints (docs/protocol.md). Every response carries a GameView
 * computed for the requesting player; the client never sees a GameState.
 */
import { api } from './client'
import type {
  ChatHistoryResponse,
  ChatPostResponse,
  ChatRequest,
  DeployRequest,
  ForkResponse,
  GameResponse,
  LoadoutSubmission,
  ShipAppearance,
  ShipLoadout,
  TurnFrames,
  TurnsResponse,
  ViewResponse,
} from '@dangerous-inclinations/engine'

/** The current view plus the full filtered event history. */
export async function getGame(gameId: string): Promise<GameResponse> {
  return api.get<GameResponse>(`/api/games/${gameId}`)
}

/** Every turn of the game so far that this seat saw something of, oldest first. */
export async function getTurns(gameId: string): Promise<TurnsResponse> {
  return api.get<TurnsResponse>(`/api/games/${gameId}/turns`)
}

/** One turn's pair of views and events, as this seat saw it. */
export async function getTurnFrames(gameId: string, index: number): Promise<TurnFrames> {
  return api.get<TurnFrames>(`/api/games/${gameId}/turns/${index}`)
}

/** Deployment: place your ship and Home marker on a sector of Black Hole Ring 2, 3 or 4. */
export async function deployShip(
  gameId: string,
  sector: number,
  ring: number
): Promise<ViewResponse> {
  return api.post<ViewResponse>(`/api/games/${gameId}/deploy`, {
    ring,
    sector,
  } satisfies DeployRequest)
}

/** Loadout phase: the ship's tiles and the three missions kept from the six offered. */
export async function submitLoadout(
  gameId: string,
  loadout: ShipLoadout,
  missionIds: string[],
  appearance?: ShipAppearance
): Promise<ViewResponse> {
  return api.post<ViewResponse>(`/api/games/${gameId}/loadout`, {
    loadout,
    missionIds,
    appearance,
  } satisfies LoadoutSubmission)
}

/** Table talk so far, oldest first. */
export async function getChat(gameId: string): Promise<ChatHistoryResponse> {
  return api.get<ChatHistoryResponse>(`/api/games/${gameId}/chat`)
}

/** Say something at the table. A `think` is an agent's, posted by `yarn seat`, never by the UI. */
export async function postChat(gameId: string, text: string): Promise<ChatPostResponse> {
  return api.post<ChatPostResponse>(`/api/games/${gameId}/chat`, {
    text,
    kind: 'say',
  } satisfies ChatRequest)
}

/** Fork a finished recording into a fresh live game. */
export async function forkRecording(args: {
  recordingId: string
  turnIndex: number
  impersonateOriginalPlayerId?: string
}): Promise<ForkResponse> {
  return api.post<ForkResponse>('/api/games/fork', args)
}
