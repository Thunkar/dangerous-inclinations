import { randomUUID } from 'crypto'
import { getRedis } from './redis.js'
import type { CreateLobbyInput } from '../schemas/lobby.js'

const LOBBY_KEY_PREFIX = 'lobby:'
const LOBBY_LIST_KEY = 'lobbies'

export interface Lobby {
  lobbyId: string
  lobbyName: string
  password?: string
  maxPlayers: number
  players: string[] // player IDs
  hostPlayerId: string
  gameId?: string // Set when game starts
  createdAt: number
}

export async function createLobby(
  input: CreateLobbyInput,
  hostPlayerId: string
): Promise<Lobby> {
  const redis = getRedis()
  const lobbyId = randomUUID()

  const lobby: Lobby = {
    lobbyId,
    lobbyName: input.lobbyName,
    password: input.password,
    maxPlayers: input.maxPlayers,
    players: [hostPlayerId],
    hostPlayerId,
    createdAt: Date.now(),
  }

  await redis.set(`${LOBBY_KEY_PREFIX}${lobbyId}`, JSON.stringify(lobby))
  await redis.sadd(LOBBY_LIST_KEY, lobbyId)

  return lobby
}

export async function getLobby(lobbyId: string): Promise<Lobby | null> {
  const redis = getRedis()
  const data = await redis.get(`${LOBBY_KEY_PREFIX}${lobbyId}`)

  if (!data) return null

  return JSON.parse(data) as Lobby
}

export async function listLobbies(): Promise<Lobby[]> {
  const redis = getRedis()
  const lobbyIds = await redis.smembers(LOBBY_LIST_KEY)

  const lobbies = await Promise.all(
    lobbyIds.map(async (id) => {
      const data = await redis.get(`${LOBBY_KEY_PREFIX}${id}`)
      return data ? (JSON.parse(data) as Lobby) : null
    })
  )

  return lobbies.filter((l): l is Lobby => l !== null)
}

export async function joinLobby(
  lobbyId: string,
  playerId: string,
  password?: string
): Promise<{ success: boolean; error?: string; lobby?: Lobby }> {
  const redis = getRedis()
  const lobby = await getLobby(lobbyId)

  if (!lobby) {
    return { success: false, error: 'Lobby not found' }
  }

  if (lobby.password && lobby.password !== password) {
    return { success: false, error: 'Incorrect password' }
  }

  if (lobby.players.length >= lobby.maxPlayers) {
    return { success: false, error: 'Lobby is full' }
  }

  if (lobby.players.includes(playerId)) {
    return { success: true, lobby } // Already in lobby
  }

  if (lobby.gameId) {
    return { success: false, error: 'Game already started' }
  }

  lobby.players.push(playerId)
  await redis.set(`${LOBBY_KEY_PREFIX}${lobbyId}`, JSON.stringify(lobby))

  return { success: true, lobby }
}

export async function leaveLobby(lobbyId: string, playerId: string): Promise<boolean> {
  const redis = getRedis()
  const lobby = await getLobby(lobbyId)

  if (!lobby) return false

  lobby.players = lobby.players.filter((id) => id !== playerId)

  if (lobby.players.length === 0) {
    // Delete empty lobby
    await redis.del(`${LOBBY_KEY_PREFIX}${lobbyId}`)
    await redis.srem(LOBBY_LIST_KEY, lobbyId)
    return true
  }

  // If host left, assign new host
  if (lobby.hostPlayerId === playerId) {
    lobby.hostPlayerId = lobby.players[0]
  }

  await redis.set(`${LOBBY_KEY_PREFIX}${lobbyId}`, JSON.stringify(lobby))
  return true
}

export async function startGame(lobbyId: string, hostPlayerId: string): Promise<string | null> {
  const redis = getRedis()
  const lobby = await getLobby(lobbyId)

  if (!lobby) return null
  if (lobby.hostPlayerId !== hostPlayerId) return null // Only host can start
  if (lobby.players.length < 2) return null // Need at least 2 players
  if (lobby.gameId) return null // Game already started

  const gameId = randomUUID()
  lobby.gameId = gameId

  await redis.set(`${LOBBY_KEY_PREFIX}${lobbyId}`, JSON.stringify(lobby))

  return gameId
}

export async function deleteLobby(lobbyId: string): Promise<boolean> {
  const redis = getRedis()
  await redis.del(`${LOBBY_KEY_PREFIX}${lobbyId}`)
  await redis.srem(LOBBY_LIST_KEY, lobbyId)
  return true
}
