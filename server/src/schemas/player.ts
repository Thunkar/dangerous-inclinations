import { z } from "zod";

export const CreatePlayerSchema = z.object({
  playerId: z.string().uuid().optional(), // If provided, will validate; if not, server creates
  playerName: z.string().min(1).max(50),
});

// Player data structure (not validated by Zod, used for storage/retrieval)
export interface PlayerAuth {
  playerId: string;
  playerName: string;
  createdAt: number;
}

export type CreatePlayerInput = z.infer<typeof CreatePlayerSchema>;
