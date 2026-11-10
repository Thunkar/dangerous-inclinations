/**
 * Games on the wire (docs/protocol.md, "REST" and the game socket): the
 * request schemas the server checks, and the shapes it answers with. Every
 * answer carries a `GameView` for its recipient; a `GameState` never leaves
 * the server during a live game.
 */
import { z } from 'zod'
import { ShipAppearanceSchema } from '../models/appearance.ts'
import { PlayerActionSchema, ShipLoadoutSchema } from '../models/game.ts'
import type { PlayerAction } from '../models/game.ts'
import { HOME_RINGS } from '../models/gravityWells.ts'
import { SECTORS_PER_RING } from '../models/rings.ts'
import type { GameEvent } from '../models/events.ts'
import type { LoadoutSubmission } from '../game/setup.ts'
import type { GameView } from '../game/view.ts'
import type { RecordingMetadata } from '../recording/types.ts'
import type { LobbySeat } from './lobby.ts'

/** The most actions one turn may carry. */
const MAX_TURN_ACTIONS = 64

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** `POST /api/games/:gameId/loadout`. */
export const LoadoutSubmissionSchema = z
  .object({
    loadout: ShipLoadoutSchema,
    appearance: ShipAppearanceSchema.optional(),
    // The engine checks the count against MISSIONS_PER_PLAYER, that the ids
    // were actually offered, and that the loadout can complete every card kept
    // (Intercept needs a sensor array, Destroy a weapon), and that the hand is
    // one primary and two secondaries; this only bounds the payload.
    missionIds: z.array(z.string().min(1)).min(1).max(16),
  })
  .strict()
// The schema checks exactly what `submitLoadout` takes, both ways.
const _loadoutSubmissionMatches: [z.infer<typeof LoadoutSubmissionSchema>] extends [
  LoadoutSubmission,
]
  ? [LoadoutSubmission] extends [z.infer<typeof LoadoutSubmissionSchema>]
    ? true
    : never
  : never = true
void _loadoutSubmissionMatches

/** `POST /api/games/:gameId/deploy`. */
export const DeploySchema = z
  .object({
    /** One of the Black Hole's deployment rings; the engine refuses anything else. */
    ring: z
      .number()
      .int()
      .refine(r => (HOME_RINGS as readonly number[]).includes(r)),
    sector: z
      .number()
      .int()
      .finite()
      .min(0)
      .max(SECTORS_PER_RING - 1),
  })
  .strict()
export type DeployRequest = z.infer<typeof DeploySchema>

/** `POST /api/games/fork`. */
export const ForkSchema = z
  .object({
    recordingId: z.string().min(1),
    turnIndex: z.number().int().finite().min(-1),
    /** The recorded seat to take over: your own, or a bot's. */
    impersonateOriginalPlayerId: z.string().min(1),
  })
  .strict()
export type ForkRequest = z.infer<typeof ForkSchema>

/** `POST /api/games/:gameId/preview`: a dry run of a turn's actions against the live state. */
export const PreviewSchema = z
  .object({
    actions: z.array(PlayerActionSchema).max(MAX_TURN_ACTIONS),
  })
  .strict()
export type PreviewRequest = z.infer<typeof PreviewSchema>

/**
 * Table talk has one channel per game and two lanes: `say` is heard by
 * everyone at the table (humans and agents alike); `think` is an agent's
 * reasoning, which only an agent seat may post, sent to its author and to the
 * seats people play (the supervisors), never to another agent.
 */
export const CHAT_KINDS = ['say', 'think'] as const
export type ChatKind = (typeof CHAT_KINDS)[number]

/** `POST /api/games/:gameId/chat`. */
export const ChatSchema = z
  .object({
    text: z.string().trim().min(1).max(2000),
    kind: z.enum(CHAT_KINDS).default('say'),
  })
  .strict()
export type ChatRequest = z.input<typeof ChatSchema>

/** The one message a client sends on the game socket. */
export const SubmitTurnSchema = z
  .object({
    type: z.literal('SUBMIT_TURN'),
    payload: z
      .object({
        actions: z.array(PlayerActionSchema).max(MAX_TURN_ACTIONS),
        turn: z.number().int().finite().positive(),
        activePlayerId: z.string().min(1),
      })
      .strict(),
  })
  .strict()
export type SubmitTurnMessage = z.infer<typeof SubmitTurnSchema>

/** A rejected payload's issues, one "path: message" line each, as a turn error lists them. */
export function issueLines(error: z.ZodError): string[] {
  return error.errors.map(issue => `${issue.path.join('.') || 'payload'}: ${issue.message}`)
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/** A view and the events the recipient may see with it. */
export interface ViewPayload {
  view: GameView
  events: GameEvent[]
}

/** `GET /api/games/:gameId`: the full filtered history and who plays each seat (empty for a fork). */
export interface GameResponse extends ViewPayload {
  seats: LobbySeat[]
}

/** The loadout and deploy routes. */
export interface ViewResponse {
  view: GameView
}

/**
 * One player-turn of a live game as the timeline lists it: no views, so the
 * whole game can be listed cheaply. `index` addresses the turn's frames.
 */
export interface TurnSummary {
  /** Position in the game's recording, for `GET /api/games/:gameId/turns/:index`. */
  index: number
  /** The round (`GameState.turn`) the turn was played in. */
  turn: number
  /** Whose turn it was. */
  actorId: string
  /** Events of the turn the caller may see. */
  eventCount: number
}

/** `GET /api/games/:gameId/turns`. */
export interface TurnsResponse {
  turns: TurnSummary[]
}

/** A turn as the caller saw it (`GET /api/games/:gameId/turns/:index`): the views it ran between and its events. */
export interface TurnFrames {
  from: GameView
  to: GameView
  events: GameEvent[]
}

/**
 * A dry run of a turn: whether the engine would accept it, and nothing else.
 * No events: they would carry the dice the live RNG is about to roll.
 */
export interface PreviewResponse {
  ok: boolean
  error?: string
  errors?: string[]
}

/** A line of table talk (see `CHAT_KINDS`). */
export interface ChatMessage {
  id: string
  gameId: string
  playerId: string
  name: string
  kind: ChatKind
  text: string
  /** Game turn when it was said. */
  turn: number
  /** ISO timestamp. */
  at: string
}

/** `GET /api/games/:gameId/chat`: oldest first. */
export interface ChatHistoryResponse {
  messages: ChatMessage[]
}

/** `POST /api/games/:gameId/chat`: the line as the table will see it. */
export interface ChatPostResponse {
  message: ChatMessage
}

/** `POST /api/games/fork`. */
export interface ForkResponse {
  gameId: string
  view: GameView
}

/** A finished recording as `GET /api/recordings` lists it. */
export interface RecordingSummary {
  recordingId: string
  createdAt: string
  source: RecordingMetadata['source']
  turnCount: number
  winnerId?: string
  label?: string
}

/** `GET /api/recordings`: newest first. */
export interface RecordingsResponse {
  recordings: RecordingSummary[]
}

/** Any refused request: `error` for one reason, `errors` for the engine's, `details` for a schema's. */
export interface APIError {
  error?: string
  errors?: string[]
  details?: unknown
}

// ---------------------------------------------------------------------------
// The game socket (server to client)
// ---------------------------------------------------------------------------

export interface TurnExecutedPayload extends ViewPayload {
  /** Who acted. */
  playerId: string
  turnNumber: number
  /** Only present when the recipient is the actor. */
  actions?: PlayerAction[]
}

export interface TurnErrorPayload {
  error?: string
  errors?: string[]
}

export type GameSocketMessage =
  | { type: 'CONNECTED'; room: 'game'; roomId: string }
  | { type: 'GAME_VIEW'; payload: ViewPayload }
  | { type: 'TURN_EXECUTED'; payload: TurnExecutedPayload }
  | { type: 'TURN_ERROR'; payload: TurnErrorPayload }
  | { type: 'CHAT'; payload: ChatMessage }
