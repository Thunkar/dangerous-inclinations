/**
 * Dark instrument theme.
 *
 * The table is a deep graphite/navy surface; every panel is a matte dark
 * instrument plate with one thin luminous edge. One restrained accent (amber)
 * marks everything interactive or active; the player colours and the four
 * data colours (hull, heat, energy, fuel) are the only other hues on screen.
 *
 * Type is a clean technical sans for prose and a monospace face for every
 * number, code and label — no serifs anywhere, no external font loading.
 */
import { createTheme } from '@mui/material/styles'

export const TABLE = {
  /** The table surface. */
  felt: '#080b11',
  feltLight: '#111823',

  /** Instrument plates. */
  plate: '#121924',
  plateHi: '#18212e',
  plateSunk: '#0c1119',
  plateEdge: 'rgba(126,165,205,0.20)',
  line: 'rgba(126,165,205,0.12)',

  /**
   * Legacy names kept so every screen keeps compiling. On a dark table both
   * "ink" and "card" mean text: cool white on the plates.
   */
  card: '#e7eef6',
  cardDark: '#18212e',
  cardEdge: 'rgba(126,165,205,0.20)',
  ink: '#e7eef6',
  inkSoft: '#93a6bc',
  inkFaint: '#63768c',

  /** The single interactive accent. */
  accent: '#ffb445',
  accentDim: '#b57c25',
  accentGlow: 'rgba(255,180,69,0.35)',
  /** Older aliases for the accent. */
  brick: '#ffb445',
  gold: '#ffb445',

  /** Data colours. */
  hull: '#46d191',
  heat: '#ff7a45',
  energy: '#49c3ff',
  fuel: '#8fa6c0',
  teal: '#3fbfd8',
  danger: '#ff5a72',
  success: '#46d191',
  faceDown: '#24303f',
} as const

export const FONT_SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
export const FONT_MONO =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'

/** Headings and numeric readouts share the condensed monospace face. */
export const FONT_DISPLAY = FONT_MONO
export const FONT_BODY = FONT_SANS

const MONO_LABEL = {
  fontFamily: FONT_MONO,
  letterSpacing: '0.06em',
} as const

export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: TABLE.felt,
      paper: TABLE.plate,
    },
    text: {
      primary: TABLE.ink,
      secondary: TABLE.inkSoft,
      disabled: TABLE.inkFaint,
    },
    primary: {
      main: TABLE.accent,
      light: '#ffca7c',
      dark: TABLE.accentDim,
      contrastText: '#12181f',
    },
    secondary: {
      main: TABLE.teal,
      light: '#7fd8e8',
      dark: '#256b7c',
      contrastText: '#0b1117',
    },
    error: { main: TABLE.danger },
    warning: { main: TABLE.heat },
    success: { main: TABLE.success },
    info: { main: TABLE.energy },
    divider: TABLE.line,
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: FONT_SANS,
    fontSize: 14,
    h1: { ...MONO_LABEL, fontWeight: 600 },
    h2: { ...MONO_LABEL, fontWeight: 600 },
    h3: { ...MONO_LABEL, fontWeight: 600, letterSpacing: '0.04em' },
    h4: { ...MONO_LABEL, fontWeight: 600, letterSpacing: '0.04em' },
    h5: { ...MONO_LABEL, fontWeight: 600 },
    h6: { ...MONO_LABEL, fontWeight: 600 },
    subtitle1: { ...MONO_LABEL, fontWeight: 600 },
    subtitle2: { ...MONO_LABEL, fontWeight: 600 },
    caption: { fontFamily: FONT_SANS, fontSize: '0.8rem' },
    overline: { ...MONO_LABEL, letterSpacing: '0.14em', fontWeight: 600, fontSize: '0.75rem' },
    button: { fontFamily: FONT_MONO, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: TABLE.felt },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: TABLE.plate,
          border: `1px solid ${TABLE.plateEdge}`,
          boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.55)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 4, boxShadow: 'none', fontSize: '0.8rem' },
        contained: {
          boxShadow: `0 0 0 1px ${TABLE.accentGlow}`,
          '&:hover': { boxShadow: `0 0 12px ${TABLE.accentGlow}` },
        },
        outlined: { borderColor: TABLE.plateEdge, '&:hover': { borderColor: TABLE.accent } },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderColor: TABLE.plateEdge,
          color: TABLE.inkSoft,
          fontFamily: FONT_MONO,
          textTransform: 'none',
          '&.Mui-selected': {
            color: TABLE.accent,
            backgroundColor: 'rgba(255,180,69,0.12)',
            '&:hover': { backgroundColor: 'rgba(255,180,69,0.2)' },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontFamily: FONT_MONO, fontWeight: 600, borderRadius: 4, fontSize: '0.8rem' },
        outlined: { borderColor: TABLE.plateEdge },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#070a0f',
          color: TABLE.ink,
          fontSize: '0.8rem',
          border: `1px solid ${TABLE.plateEdge}`,
          borderRadius: 4,
        },
        arrow: { color: '#070a0f' },
      },
    },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiDialog: {
      styleOverrides: {
        paper: { backgroundColor: TABLE.plate, backgroundImage: 'none' },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 4, border: `1px solid ${TABLE.plateEdge}`, backgroundImage: 'none' },
        standardError: { backgroundColor: 'rgba(255,90,114,0.10)', color: '#ffc2cc' },
        standardWarning: { backgroundColor: 'rgba(255,122,69,0.10)', color: '#ffd0ba' },
        standardSuccess: { backgroundColor: 'rgba(70,209,145,0.10)', color: '#b6f0d6' },
        standardInfo: { backgroundColor: 'rgba(73,195,255,0.10)', color: '#bfe6ff' },
      },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: TABLE.line } },
    },
  },
})
