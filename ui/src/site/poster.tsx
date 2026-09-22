/**
 * The pieces every page of the site is set from, in the press's idiom
 * (`design/press.ts`): condensed capitals, solid blocks, black rules and one
 * red. Nothing here has a radius, a shadow or a gradient.
 */
import type { ReactNode } from 'react'
import { Box, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import { FONT_SANS } from '../theme'
import { FONT_DISPLAY, PRESS } from '../design/press'
import type { Route } from './routes'
import { SiteLink } from './SiteLink'

/** Capitals in the poster face, at whatever size the caller needs. */
export function Display({
  children,
  size,
  color = PRESS.ink,
  weight = 700,
  component = 'div',
  sx,
}: {
  children: ReactNode
  size: string | Record<string, string>
  color?: string
  weight?: number
  component?: 'h1' | 'h2' | 'h3' | 'div' | 'span'
  sx?: SxProps<Theme>
}) {
  return (
    <Typography
      component={component}
      sx={[
        {
          fontFamily: FONT_DISPLAY,
          fontWeight: weight,
          fontSize: size,
          lineHeight: 0.92,
          letterSpacing: '-0.005em',
          textTransform: 'uppercase',
          color,
          m: 0,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Typography>
  )
}

/** The small capitals over a heading: what kind of thing this is. */
export function Kicker({
  children,
  color = PRESS.redText,
}: {
  children: ReactNode
  color?: string
}) {
  return (
    <Typography
      sx={{
        fontFamily: FONT_DISPLAY,
        fontWeight: 600,
        fontSize: '0.95rem',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        lineHeight: 1.2,
        color,
      }}
    >
      {children}
    </Typography>
  )
}

/** Body copy on paper. */
export function Body({
  children,
  color = PRESS.ink,
  size = '1rem',
  sx,
}: {
  children: ReactNode
  color?: string
  size?: string | Record<string, string>
  sx?: SxProps<Theme>
}) {
  return (
    <Typography
      sx={[
        { fontFamily: FONT_SANS, fontSize: size, lineHeight: 1.5, color, maxWidth: '64ch' },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Typography>
  )
}

/** A number in the poster face: a step, a score, a die. */
export function Numeral({
  children,
  size = '3rem',
  color = PRESS.red,
}: {
  children: ReactNode
  size?: string | Record<string, string>
  color?: string
}) {
  return (
    <Typography
      component="span"
      sx={{
        fontFamily: FONT_DISPLAY,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 0.85,
        color,
        fontVariantNumeric: 'tabular-nums',
        display: 'block',
      }}
    >
      {children}
    </Typography>
  )
}

type Tone = 'red' | 'ink' | 'paper'

const TONES: Record<
  Tone,
  { bg: string; fg: string; edge: string; hoverBg: string; hoverFg: string }
> = {
  red: {
    bg: PRESS.red,
    fg: PRESS.paper,
    edge: PRESS.red,
    hoverBg: PRESS.ink,
    hoverFg: PRESS.paper,
  },
  ink: {
    bg: PRESS.ink,
    fg: PRESS.paper,
    edge: PRESS.ink,
    hoverBg: PRESS.red,
    hoverFg: PRESS.paper,
  },
  paper: {
    bg: 'transparent',
    fg: PRESS.ink,
    edge: PRESS.ink,
    hoverBg: PRESS.ink,
    hoverFg: PRESS.paper,
  },
}

/** A slab of a button: a link to a place on the site, or a button. */
export function Slab({
  children,
  tone = 'red',
  to,
  onClick,
  sx,
}: {
  children: ReactNode
  tone?: Tone
  to?: Route
  onClick?: () => void
  sx?: SxProps<Theme>
}) {
  const t = TONES[tone]
  const look: SxProps<Theme> = [
    {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 1,
      minHeight: 48,
      px: 2.5,
      border: `3px solid ${t.edge}`,
      bgcolor: t.bg,
      color: t.fg,
      fontFamily: FONT_DISPLAY,
      fontWeight: 600,
      fontSize: '1.05rem',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      textDecoration: 'none',
      cursor: 'pointer',
      touchAction: 'manipulation',
      transition: 'background-color 90ms, color 90ms, border-color 90ms',
      '&:hover': { bgcolor: t.hoverBg, color: t.hoverFg, borderColor: t.hoverBg },
    },
    ...(Array.isArray(sx) ? sx : [sx]),
  ]
  if (to) {
    return (
      <SiteLink to={to} sx={look}>
        {children}
      </SiteLink>
    )
  }
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={[{ font: 'inherit' }, ...(look as object[])]}
    >
      {children}
    </Box>
  )
}

/**
 * The mark: a black hole on the red, cut by the paper diagonal every printed
 * thing in the game carries.
 */
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden focusable="false">
      <rect width="30" height="30" fill={PRESS.red} />
      <path d="M-4 30.5L30 9.3V16L-4 37.2z" fill={PRESS.paper} />
      <circle cx="15" cy="15" r="7.2" fill={PRESS.ink} />
    </svg>
  )
}
