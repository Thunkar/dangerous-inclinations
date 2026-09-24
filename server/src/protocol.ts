/**
 * Messages exchanged over the game WebSocket. See docs/protocol.md.
 * Every server → client game message carries a per-recipient GameView; a
 * GameState never leaves the server during a live game.
 */
import type { GameEvent, GameView, PlayerAction } from "@dangerous-inclinations/engine";

export interface ViewPayload {
  view: GameView;
  events: GameEvent[];
}

/**
 * One player-turn of a live game as the timeline lists it: no views, so the
 * whole game can be listed cheaply. `index` addresses the turn's frames.
 */
export interface TurnSummary {
  /** Position in the game's recording, for `GET /api/games/:gameId/turns/:index`. */
  index: number;
  /** The round (`GameState.turn`) the turn was played in. */
  turn: number;
  /** Whose turn it was. */
  actorId: string;
  /** Events of the turn the caller may see. */
  eventCount: number;
}

/** A turn as the caller saw it: the views it ran between and its events. */
export interface TurnFrames {
  from: GameView;
  to: GameView;
  events: GameEvent[];
}

export interface TurnExecutedPayload extends ViewPayload {
  /** Who acted. */
  playerId: string;
  turnNumber: number;
  /** Only present when the recipient is the actor. */
  actions?: PlayerAction[];
  rewind?: true;
}

export interface TurnErrorPayload {
  error?: string;
  errors?: string[];
}

/**
 * Table talk. One channel per game, two lanes: `say` is heard by everyone at
 * the table (humans and agents alike); `think` is a player's reasoning,
 * shown to humans in the UI but not fed to other agents.
 */
export interface ChatMessage {
  id: string;
  gameId: string;
  playerId: string;
  name: string;
  kind: "say" | "think";
  text: string;
  /** Game turn when it was said. */
  turn: number;
  /** ISO timestamp. */
  at: string;
}

/** A dry run of a turn: what the engine would say, without committing anything. */
export interface PreviewPayload {
  ok: boolean;
  error?: string;
  errors?: string[];
  /** Events the caller would see, when the turn is legal. */
  events?: GameEvent[];
}

export type ServerGameMessage =
  | { type: "CONNECTED"; room: "game"; roomId: string }
  | { type: "GAME_VIEW"; payload: ViewPayload }
  | { type: "TURN_EXECUTED"; payload: TurnExecutedPayload }
  | { type: "TURN_ERROR"; payload: TurnErrorPayload }
  | { type: "CHAT"; payload: ChatMessage };
