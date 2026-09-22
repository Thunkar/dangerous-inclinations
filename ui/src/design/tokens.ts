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

  /** Text: bone white on the plates. */
  ink: '#e0e3db',
  inkSoft: '#a4b2aa',
  inkFaint: '#8d9f95',

  /** The interface interaction accent; player colors are assigned independently. */
  accent: '#ddaa78',
  accentDim: '#ad8057',
  accentGlow: 'rgba(221,170,120,0.35)',

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
