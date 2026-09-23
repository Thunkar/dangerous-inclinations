/**
 * Player colours: a UI concern, assigned by seat order. The single source for
 * every screen (lobby, loadouts, board tokens, log). Red is never a seat: on
 * the table red means danger and the thing you can act on.
 */
export const PLAYER_COLORS = [
  '#3f7fd0', // cobalt
  '#3d9a5c', // green
  '#d08a1e', // ochre
  '#9a62c8', // violet
  '#1fa3b3', // teal
  '#c8b89a', // sand
] as const

export const NEUTRAL_PLAYER_COLOR = '#7a7a7a'

export function getPlayerColor(index: number): string {
  if (index < 0) return NEUTRAL_PLAYER_COLOR
  return PLAYER_COLORS[index % PLAYER_COLORS.length]
}

