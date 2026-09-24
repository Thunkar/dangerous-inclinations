/**
 * The table's theme: the press's inks at night (`design/tokens.ts`). Headings,
 * labels, buttons and chips are set in the poster face in capitals; numbers
 * stay monospaced, because a column of them has to line up. Square corners,
 * no shadow, no glow.
 */
import { createTheme } from '@mui/material/styles'

import { TABLE } from './design/tokens'
import { FONT_DISPLAY } from './design/press'
export { TABLE } from './design/tokens'

export const FONT_SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
export const FONT_MONO =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'

/** The poster face in capitals: every heading, label, button and chip. */
const DISPLAY = {
  fontFamily: FONT_DISPLAY,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
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
      main: TABLE.accentBlock,
      light: TABLE.accent,
      dark: TABLE.accentDim,
      contrastText: TABLE.onAccent,
    },
    secondary: {
      main: TABLE.teal,
      contrastText: TABLE.felt,
    },
    error: { main: TABLE.danger },
    warning: { main: TABLE.heat },
    success: { main: TABLE.success },
    info: { main: TABLE.energy },
    divider: TABLE.line,
  },
  shape: { borderRadius: 0 },
  typography: {
    fontFamily: FONT_SANS,
    fontSize: 14,
    h1: { ...DISPLAY, fontWeight: 600 },
    h2: { ...DISPLAY, fontWeight: 600 },
    h3: { ...DISPLAY, fontWeight: 600 },
    h4: { ...DISPLAY, fontWeight: 600 },
    h5: { ...DISPLAY, fontWeight: 600 },
    h6: { ...DISPLAY, fontWeight: 600 },
    subtitle1: { ...DISPLAY, fontWeight: 600 },
    subtitle2: { ...DISPLAY, fontWeight: 600 },
    caption: { fontFamily: FONT_SANS, fontSize: '0.8rem' },
    overline: { ...DISPLAY, letterSpacing: '0.12em', fontWeight: 600, fontSize: '0.8rem' },
    button: { ...DISPLAY, letterSpacing: '0.08em', fontWeight: 600 },
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
          boxShadow: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          boxShadow: 'none',
          fontSize: '0.85rem',
          '&[aria-pressed="true"]': {
            backgroundColor: TABLE.selected,
            borderColor: TABLE.selected,
            color: TABLE.onSelected,
          },
        },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
          '&.Mui-disabled': { backgroundColor: TABLE.plateHi, color: TABLE.inkFaint },
        },
        outlined: { borderColor: TABLE.plateEdge, '&:hover': { borderColor: TABLE.accent } },
      },
      // The poster red is a block colour: as type on the ink it is the lifted
      // red, and a plain text button is cream print that reddens under the pointer.
      variants: [
        {
          props: { variant: 'text', color: 'primary' },
          style: {
            color: TABLE.ink,
            '&:hover': { color: TABLE.accent, backgroundColor: TABLE.hover },
          },
        },
        {
          props: { variant: 'outlined', color: 'primary' },
          style: { color: TABLE.ink },
        },
      ],
    },
    MuiTabs: {
      styleOverrides: { indicator: { height: 3, backgroundColor: TABLE.accentBlock } },
    },
    // A picked option is a cream block with ink type; red is kept for the
    // action that ends the turn.
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderColor: TABLE.plateEdge,
          color: TABLE.inkSoft,
          ...DISPLAY,
          borderRadius: 0,
          '&:hover': { backgroundColor: TABLE.hover },
          '&.Mui-selected': {
            color: TABLE.onSelected,
            backgroundColor: TABLE.selected,
            borderColor: TABLE.selected,
            '&:hover': { backgroundColor: TABLE.inkSoft },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          ...DISPLAY,
          fontWeight: 600,
          borderRadius: 0,
          fontSize: '0.8rem',
          // MUI tucks the icon into a pill's round end (2px on an outlined small
          // chip); a square chip has no round end, so give it a real margin.
          '&& .MuiChip-icon': { marginLeft: 8, marginRight: -2 },
        },
        outlined: { borderColor: TABLE.plateEdge },
      },
      variants: [
        {
          props: { variant: 'filled', color: 'primary' },
          style: {
            backgroundColor: TABLE.selected,
            color: TABLE.onSelected,
            '&.MuiChip-clickable:hover': { backgroundColor: TABLE.inkSoft },
            '& .MuiChip-icon': { color: TABLE.onSelected },
          },
        },
      ],
    },
    MuiSlider: {
      styleOverrides: {
        thumb: { borderRadius: 0, boxShadow: 'none', '&:hover, &.Mui-focusVisible': { boxShadow: 'none' } },
        rail: { borderRadius: 0 },
        track: { borderRadius: 0 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          ...DISPLAY,
          fontWeight: 600,
          color: TABLE.inkSoft,
          '&.Mui-selected': { color: TABLE.ink },
        },
      },
    },
    MuiTooltip: {
      // A tooltip must never sit between the pointer and the control below it.
      defaultProps: { disableInteractive: true, enterDelay: 350, enterNextDelay: 200 },
      styleOverrides: {
        tooltip: {
          backgroundColor: TABLE.bar,
          color: TABLE.ink,
          fontSize: '0.8rem',
          border: `1px solid ${TABLE.plateEdge}`,
          borderRadius: 0,
        },
        arrow: { color: TABLE.bar },
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
        root: { borderRadius: 0, border: `1px solid ${TABLE.plateEdge}`, backgroundImage: 'none' },
        // Cream type on a tint of the one colour that says what kind of news it is.
        standardError: { backgroundColor: TABLE.accentWash, color: TABLE.ink },
        standardWarning: { backgroundColor: TABLE.accentWash, color: TABLE.ink },
        standardSuccess: { backgroundColor: TABLE.successWash, color: TABLE.ink },
        standardInfo: { backgroundColor: TABLE.fuelWash, color: TABLE.ink },
      },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: TABLE.line } },
    },
  },
})
