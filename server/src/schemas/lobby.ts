import { z } from "zod";
import { MAX_PLAYERS, MIN_PLAYERS } from "@dangerous-inclinations/engine";

export const CreateLobbySchema = z.object({
  lobbyName: z.string().min(1).max(100),
  password: z.string().min(0).max(100).optional(), // Empty string or undefined means no password
  // The engine builds games of MIN_PLAYERS..MAX_PLAYERS seats; a lobby that
  // allowed more could never start.
  maxPlayers: z.number().int().finite().min(MIN_PLAYERS).max(MAX_PLAYERS).default(MAX_PLAYERS),
});

export const JoinLobbySchema = z.object({
  lobbyId: z.string().uuid(),
  password: z.string().optional(),
});

export type CreateLobbyInput = z.infer<typeof CreateLobbySchema>;
export type JoinLobbyInput = z.infer<typeof JoinLobbySchema>;
