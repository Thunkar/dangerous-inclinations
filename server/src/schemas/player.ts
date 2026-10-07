import { z } from "zod";

/**
 * An AI agent sitting at a seat: which driver plays it and with which model.
 * Public, like a name: everyone at the table sees who is a person, a bot and
 * an agent. A bot is the server's own AI; an agent is an outside program.
 */
const AgentSchema = z.object({
  driver: z.enum(["claude", "codex"]),
  model: z.string().min(1).max(80),
});

/** The server picks the player id; a body that names one is refused. */
export const CreatePlayerSchema = z
  .object({
    playerName: z.string().min(1).max(50),
    agent: AgentSchema.optional(),
  })
  .strict();

export const UpdatePlayerSchema = z.object({
  playerName: z.string().min(1).max(50),
});

// Player data structure (not validated by Zod, used for storage/retrieval)
export type AgentInfo = z.infer<typeof AgentSchema>;

export interface PlayerAuth {
  playerId: string;
  playerName: string;
  /** Present when the seat is played by an outside agent. */
  agent?: AgentInfo;
  createdAt: number;
}
