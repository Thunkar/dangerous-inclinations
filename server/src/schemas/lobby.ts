import { z } from "zod";
import { DEFAULT_POINTS_TO_WIN, MAX_PLAYERS, MIN_PLAYERS } from "@dangerous-inclinations/engine";

/**
 * Points to win, agreed by the table before the deal (RULES §Missions): three
 * is the game, four makes all three cards mandatory. Only those two — the
 * engine would take any whole number, but the table is offered a choice, not a
 * dial.
 */
export const PointsToWinSchema = z.union([z.literal(3), z.literal(4)]);

export const CreateLobbySchema = z.object({
  lobbyName: z.string().min(1).max(100),
  password: z.string().min(0).max(100).optional(), // Empty string or undefined means no password
  // The engine builds games of MIN_PLAYERS..MAX_PLAYERS seats; a lobby that
  // allowed more could never start.
  maxPlayers: z.number().int().finite().min(MIN_PLAYERS).max(MAX_PLAYERS).default(MAX_PLAYERS),
  pointsToWin: PointsToWinSchema.default(DEFAULT_POINTS_TO_WIN),
});

/** Settings the host may change while the lobby is still open; the number is not optional here. */
export const UpdateLobbySchema = z.object({
  pointsToWin: PointsToWinSchema,
});

export const JoinLobbySchema = z.object({
  lobbyId: z.string().uuid(),
  password: z.string().optional(),
});

export type CreateLobbyInput = z.infer<typeof CreateLobbySchema>;
export type UpdateLobbyInput = z.infer<typeof UpdateLobbySchema>;
export type JoinLobbyInput = z.infer<typeof JoinLobbySchema>;
