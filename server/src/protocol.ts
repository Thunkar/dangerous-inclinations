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

export type ServerGameMessage =
  | { type: "CONNECTED"; room: "game"; roomId: string }
  | { type: "GAME_VIEW"; payload: ViewPayload }
  | { type: "TURN_EXECUTED"; payload: TurnExecutedPayload }
  | { type: "TURN_ERROR"; payload: TurnErrorPayload };

export interface SubmitTurnPayload {
  actions: PlayerAction[];
  /** Turn and active player the client believes it is acting in. */
  turn: number;
  activePlayerId: string;
}

export type ClientGameMessage = { type: "SUBMIT_TURN"; payload: SubmitTurnPayload };
