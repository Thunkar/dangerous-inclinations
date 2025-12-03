import type { GameState, TurnLogEntry, PlayerAction, GameStatus } from '../types/game'
import { processActions } from './actionProcessors'
import { processMissiles } from './missiles'

/**
 * Result of executing a complete game turn
 */
export interface TurnResult {
  gameState: GameState
  logEntries: TurnLogEntry[]
  errors?: string[]
}

/**
 * Create a deep copy snapshot of game state for validation
 */
function createGameStateSnapshot(gameState: GameState): GameState {
  return {
    ...gameState,
    players: gameState.players.map(player => ({
      ...player,
      ship: {
        ...player.ship,
        subsystems: player.ship.subsystems.map(s => ({ ...s })),
        reactor: { ...player.ship.reactor },
        heat: { ...player.ship.heat },
        transferState: player.ship.transferState ? { ...player.ship.transferState } : null,
      },
    })),
    turnLog: [...gameState.turnLog],
    missiles: gameState.missiles ? gameState.missiles.map(m => ({ ...m })) : [], // Deep copy missiles array
  }
}

/**
 * Execute a complete game turn for the active player with snapshot-based validation
 *
 * @param gameState - Current game state
 * @param actions - Array of actions for the active player to execute
 *
 * Validation flow:
 * 1. Create a snapshot of the entire game state
 * 2. Process all actions on the snapshot (validation + execution in one step)
 * 3. If successful, use the snapshot as the new game state
 * 4. If errors occur, discard snapshot and return original state with errors
 *
 * Execution phases:
 * 1. Process actions in priority order:
 *    - Energy allocation
 *    - Energy deallocation
 *    - Heat venting
 *    - Rotation (if needed)
 *    - Movement (coast or burn)
 *    - Weapon firing (all simultaneous)
 *    - Heat damage (from previous turns)
 *    - Heat generation (from this turn)
 * 2. Move to next player
 * 3. Prepare next player's turn (resolve their transfer if arriving)
 */
export function executeTurn(gameState: GameState, actions: PlayerAction[]): TurnResult {
  const activePlayerIndex = gameState.activePlayerIndex
  const activePlayer = gameState.players[activePlayerIndex]
  const allLogEntries: TurnLogEntry[] = []

  // Validate all actions belong to the active player
  const wrongPlayerActions = actions.filter(a => a.playerId !== activePlayer.id)
  if (wrongPlayerActions.length > 0) {
    return {
      gameState,
      logEntries: [],
      errors: ['All actions must belong to the active player'],
    }
  }

  // Create a snapshot of the game state
  const snapshot = createGameStateSnapshot(gameState)

  // Process actions on the snapshot (validation + execution in one step)
  const processResult = processActions(snapshot, actions)

  // If processing failed, discard snapshot and return original state
  if (!processResult.success) {
    return {
      gameState,
      logEntries: [],
      errors: processResult.errors || ['Failed to process actions'],
    }
  }

  // Success - use the snapshot as the new game state
  let updatedGameState = processResult.gameState
  allLogEntries.push(...processResult.logEntries)

  // Process missiles owned by the active player (after their actions complete)
  if (updatedGameState.missiles.length > 0) {
    const playerMissiles = updatedGameState.missiles.filter(m => m.ownerId === activePlayer.id)
    if (playerMissiles.length > 0) {
      const missileResult = processMissiles(updatedGameState, activePlayer.id)
      updatedGameState = missileResult.gameState
      allLogEntries.push(...missileResult.logEntries)
    }
  }

  // Move to next alive player (skip dead players)
  let nextPlayerIndex = (gameState.activePlayerIndex + 1) % updatedGameState.players.length
  let isNewTurn = nextPlayerIndex === 0

  // Skip dead players - find the next alive player
  const startIndex = nextPlayerIndex
  while (updatedGameState.players[nextPlayerIndex].ship.hitPoints <= 0) {
    nextPlayerIndex = (nextPlayerIndex + 1) % updatedGameState.players.length
    // Check if we've wrapped around to a new turn
    if (nextPlayerIndex === 0) {
      isNewTurn = true
    }
    // Safety: if we've looped back to start, all players are dead - break to avoid infinite loop
    if (nextPlayerIndex === startIndex) {
      break
    }
  }

  updatedGameState = {
    ...updatedGameState,
    turn: isNewTurn ? gameState.turn + 1 : gameState.turn,
    activePlayerIndex: nextPlayerIndex,
    turnLog: [...gameState.turnLog, ...allLogEntries],
  }

  // Check for win/loss conditions
  updatedGameState = checkGameStatus(updatedGameState)

  // All transfers complete immediately, no need to resolve on turn start

  return {
    gameState: updatedGameState,
    logEntries: allLogEntries,
  }
}

/**
 * Check for win/loss conditions
 * Note: Dead players are NOT removed from the array - they stay for UI/history purposes
 */
function checkGameStatus(gameState: GameState): GameState {
  // Don't check if game is already over
  if (gameState.status !== 'active') {
    return gameState
  }

  // Count alive players (don't remove them from array)
  const alivePlayers = gameState.players.filter(p => p.ship.hitPoints > 0)

  // If all ships destroyed somehow, game is over
  if (alivePlayers.length === 0) {
    return {
      ...gameState,
      status: 'defeat',
    }
  }

  // Find the human player (first player is always human in current setup)
  const humanPlayer = gameState.players[0]
  const humanAlive = humanPlayer.ship.hitPoints > 0
  const otherPlayersAlive = alivePlayers.some(p => p.id !== humanPlayer.id)

  let status: GameStatus = gameState.status
  let winnerId: string | undefined

  if (!humanAlive) {
    // Human player is dead - defeat
    status = 'defeat'
    // Find the survivor with highest HP as winner
    const survivor = alivePlayers.reduce((max, p) =>
      p.ship.hitPoints > max.ship.hitPoints ? p : max
    , alivePlayers[0])
    winnerId = survivor?.id
  } else if (!otherPlayersAlive) {
    // Only human player alive - victory
    status = 'victory'
    winnerId = humanPlayer.id
  }

  // Players array stays unchanged - dead players remain for UI/history
  return {
    ...gameState,
    status,
    winnerId,
  }
}
