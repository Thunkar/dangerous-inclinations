/**
 * Player colours: a UI concern, assigned by seat order. The single source for
 * every screen (lobby, loadouts, board tokens, log).
 */
export const PLAYER_COLORS = [
  '#2f6fb3', // blue
  '#c0392b', // red
  '#3d8b57', // green
  '#d98c1f', // orange
  '#7d4fa8', // purple
  '#1f9aa8', // teal
] as const

export const NEUTRAL_PLAYER_COLOR = '#7a7a7a'

export function getPlayerColor(index: number): string {
  if (index < 0) return NEUTRAL_PLAYER_COLOR
  return PLAYER_COLORS[index % PLAYER_COLORS.length]
}

