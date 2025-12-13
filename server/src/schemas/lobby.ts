import { z } from 'zod'

export const CreateLobbySchema = z.object({
  lobbyName: z.string().min(1).max(100),
  password: z.string().min(0).max(100).optional(), // Empty string or undefined means no password
  maxPlayers: z.number().int().min(2).max(6).default(6),
})

export const JoinLobbySchema = z.object({
  lobbyId: z.string().uuid(),
  password: z.string().optional(),
})

export const LobbyActionSchema = z.object({
  lobbyId: z.string().uuid(),
  action: z.enum(['start_game', 'leave_lobby', 'kick_player']),
  targetPlayerId: z.string().uuid().optional(), // For kick_player action
})

export type CreateLobbyInput = z.infer<typeof CreateLobbySchema>
export type JoinLobbyInput = z.infer<typeof JoinLobbySchema>
export type LobbyAction = z.infer<typeof LobbyActionSchema>
