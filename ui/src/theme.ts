/** Shipyard theme: matte graphite, warm interactions, and clear gameplay colors. */
import { createTheme } from '@mui/material/styles'

import { TABLE } from './design/tokens'
export { TABLE } from './design/tokens'

export const FONT_SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
export const FONT_MONO =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'

/** Calm sans headings; technical readings retain monospace. */
export const FONT_DISPLAY = FONT_SANS
export const FONT_BODY = FONT_SANS

const DISPLAY = { fontFamily: FONT_SANS, letterSpacing: '-0.025em' } as const

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
      light: '#efbf91',
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
    h1: { ...DISPLAY, fontWeight: 600 },
    h2: { ...DISPLAY, fontWeight: 600 },
    h3: { ...DISPLAY, fontWeight: 600, letterSpacing: '-0.025em' },
    h4: { ...DISPLAY, fontWeight: 600, letterSpacing: '-0.025em' },
    h5: { ...DISPLAY, fontWeight: 600 },
    h6: { ...DISPLAY, fontWeight: 600 },
    subtitle1: { ...DISPLAY, fontWeight: 600 },
    subtitle2: { ...DISPLAY, fontWeight: 600 },
    caption: { fontFamily: FONT_SANS, fontSize: '0.8rem' },
    overline: { ...MONO_LABEL, letterSpacing: '0.14em', fontWeight: 600, fontSize: '0.75rem' },
    button: {
      fontFamily: FONT_SANS,
      textTransform: 'none',
      letterSpacing: '0.01em',
      fontWeight: 600,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: TABLE.felt },
        ':focus-visible': { outline: `2px solid ${TABLE.accent}`, outlineOffset: 3 },
        '@media (prefers-reduced-motion: reduce)': {
          '*': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important' },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: TABLE.plate,
          border: `1px solid ${TABLE.plateEdge}`,
          boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 16px rgba(0,0,0,0.18)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          boxShadow: 'none',
          fontSize: '0.8rem',
          '&[aria-pressed="true"]': { backgroundColor: '#ddaa7814', borderColor: TABLE.accent },
        },
        contained: {
          boxShadow: `0 0 0 1px ${TABLE.accentGlow}`,
          '&:hover': { boxShadow: 'none' },
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
            backgroundColor: 'rgba(221,170,120,0.12)',
            '&:hover': { backgroundColor: 'rgba(221,170,120,0.2)' },
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
      // A tooltip must never sit between the pointer and the control below it.
      defaultProps: { disableInteractive: true, enterDelay: 350, enterNextDelay: 200 },
      styleOverrides: {
        tooltip: {
          backgroundColor: '#141b1e',
          color: TABLE.ink,
          fontSize: '0.8rem',
          border: `1px solid ${TABLE.plateEdge}`,
          borderRadius: 4,
        },
        arrow: { color: '#141b1e' },
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
