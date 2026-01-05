/**
 * Player colors - UI concern only, not stored in game state
 * Colors are assigned based on player index in the players array
 */

// Player colors for up to 6 players
const PLAYER_COLORS = [
  '#2196f3', // Blue
  '#f44336', // Red
  '#4caf50', // Green
  '#ff9800', // Orange
  '#9c27b0', // Purple
  '#00bcd4', // Cyan
]

/**
 * Get a player's color based on their index in the players array
 */
export function getPlayerColor(playerIndex: number): string {
  return PLAYER_COLORS[playerIndex % PLAYER_COLORS.length]
}

/**
 * Get a player's color by looking up their ID in the players array
 */
export function getPlayerColorById(playerId: string, players: { id: string }[]): string {
  const index = players.findIndex((p) => p.id === playerId)
  return index >= 0 ? getPlayerColor(index) : '#888888'
}
