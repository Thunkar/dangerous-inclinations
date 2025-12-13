import { z } from "zod";

export const CreatePlayerSchema = z.object({
  playerId: z.string().uuid().optional(), // If provided, will validate; if not, server creates
  playerName: z.string().min(1).max(50),
});

export const PlayerAuthSchema = z.object({
  playerId: z.string().uuid(),
  playerName: z.string(),
});

export type CreatePlayerInput = z.infer<typeof CreatePlayerSchema>;
export type PlayerAuth = z.infer<typeof PlayerAuthSchema>;
