/** Shared shipyard colors. Player identity and gameplay signals have separate roles. */
export const TABLE = {
  /** The table surface. */
  felt: '#151a1d',
  feltLight: '#192023',

  /** Instrument plates. */
  plate: '#1b2225',
  plateHi: '#252e30',
  plateSunk: '#171e21',
  plateEdge: 'rgba(132,150,142,0.20)',
  line: 'rgba(132,150,142,0.12)',

  /**
   * Legacy names kept so every screen keeps compiling. On a dark table both
   * "ink" and "card" mean text: bone white on the plates.
   */
  card: '#e0e3db',
  cardDark: '#252e30',
  cardEdge: 'rgba(132,150,142,0.20)',
  ink: '#e0e3db',
  inkSoft: '#a4b2aa',
  inkFaint: '#8d9f95',

  /** The interface interaction accent; player colors are assigned independently. */
  accent: '#ddaa78',
  accentDim: '#ad8057',
  accentGlow: 'rgba(221,170,120,0.35)',
  /** Older aliases for the accent. */
  brick: '#ddaa78',
  gold: '#ddaa78',

  /** Data colours. */
  hull: '#46d191',
  heat: '#ff7a45',
  energy: '#49c3ff',
  fuel: '#8fa6c0',
  teal: '#3fbfd8',
  danger: '#ff5a72',
  success: '#46d191',
  faceDown: '#303c3e',
} as const
