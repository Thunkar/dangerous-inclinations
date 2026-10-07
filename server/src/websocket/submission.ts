/**
 * The game socket's messages that do not depend on the socket itself, so the
 * smoke test can run them against an in-memory game service.
 */
import type { PlayerAction } from "@dangerous-inclinations/engine";
import { SubmitTurnSchema, issueLines } from "../schemas/game.ts";
import type { ServerGameMessage } from "../protocol.ts";
import { StaleGameError, type GameService } from "../services/gameService.ts";

export function connectedMessage(gameId: string): ServerGameMessage {
  return { type: "CONNECTED", room: "game", roomId: gameId };
}

/**
 * Run one raw SUBMIT_TURN from `playerId`. Returns the TURN_ERROR to send the
 * submitter, or null when the turn was committed (every seat then receives
 * TURN_EXECUTED from the service). Other failures throw.
 */
export async function answerSubmission(
  games: Pick<GameService, "submitTurn">,
  gameId: string,
  playerId: string,
  raw: string
): Promise<ServerGameMessage | null> {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return turnError("Invalid SUBMIT_TURN message", ["payload: not JSON"]);
  }
  const parsed = SubmitTurnSchema.safeParse(message);
  if (!parsed.success) {
    // A malformed action fails the whole submission: never a silent coast.
    return turnError("Invalid SUBMIT_TURN message", issueLines(parsed.error));
  }
  const { actions, turn, activePlayerId } = parsed.data.payload;
  try {
    const result = await games.submitTurn(gameId, playerId, actions as PlayerAction[], {
      turn,
      activePlayerId,
    });
    return result.ok ? null : turnError(result.error, result.errors);
  } catch (error) {
    if (error instanceof StaleGameError) return turnError(error.message);
    throw error;
  }
}

function turnError(error?: string, errors?: string[]): ServerGameMessage {
  return { type: "TURN_ERROR", payload: { error, errors } };
}
