/**
 * What the cheatsheet's sections are set from: a numbered band, a list of
 * short points, and the ledger a heat check is written in.
 */
import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import { FONT_SANS } from '../../theme'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Body, Display, Kicker, Numeral } from '../poster'

export const COLUMN = { maxWidth: 1120, mx: 'auto', px: { xs: 2, sm: 4 } } as const

export type BandTone = 'paper' | 'ink' | 'deep'

const BAND: Record<
  BandTone,
  { bg: string; fg: string; soft: string; num: string; kicker: string }
> = {
  paper: {
    bg: PRESS.paper,
    fg: PRESS.ink,
    soft: PRESS.inkSoft,
    num: PRESS.red,
    kicker: PRESS.redText,
  },
  deep: {
    bg: PRESS.paperDeep,
    fg: PRESS.ink,
    soft: PRESS.inkSoft,
    num: PRESS.red,
    kicker: PRESS.redText,
  },
  ink: {
    bg: PRESS.ink,
    fg: PRESS.paper,
    soft: PRESS.paperSoft,
    num: PRESS.red,
    kicker: PRESS.paperSoft,
  },
}

/**
 * One section of the cheatsheet: a full-width band, the step's number big in
 * red, the headline, the sentence that says what the section is for, and the
 * content under it.
 */
export function GuideSection({
  id,
  n,
  kicker,
  title,
  lede,
  tone = 'paper',
  children,
}: {
  id: string
  n: number
  kicker: string
  title: string
  lede: ReactNode
  tone?: BandTone
  children: ReactNode
}) {
  const c = BAND[tone]
  return (
    <Box
      component="section"
      id={id}
      aria-labelledby={`${id}-title`}
      sx={{ bgcolor: c.bg, color: c.fg, scrollMarginTop: 64 }}
    >
      <Box sx={{ ...COLUMN, py: { xs: 5, sm: 7 } }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '150px 1fr' },
            columnGap: 4,
            rowGap: 1.5,
            mb: { xs: 3, sm: 4.5 },
            alignItems: 'start',
          }}
        >
          <Numeral size={{ xs: '4.5rem', md: '7.5rem' }} color={c.num}>
            {String(n).padStart(2, '0')}
          </Numeral>
          <Box>
            <Kicker color={c.kicker}>{kicker}</Kicker>
            <Box id={`${id}-title`}>
              <Display
                component="h2"
                size={{ xs: '2.4rem', sm: '3.4rem' }}
                color={c.fg}
                sx={{ mt: 0.75 }}
              >
                {title}
              </Display>
            </Box>
            <Body size={{ xs: '1.02rem', sm: '1.12rem' }} color={c.soft} sx={{ mt: 1.5 }}>
              {lede}
            </Body>
          </Box>
        </Box>
        {children}
      </Box>
    </Box>
  )
}

/** Short points, one per line, each led by a square bullet in red. */
export function Points({
  items,
  color = PRESS.ink,
  size = '1rem',
}: {
  items: ReactNode[]
  color?: string
  size?: string
}) {
  return (
    <Box
      component="ul"
      sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1.1 }}
    >
      {items.map((item, index) => (
        <Box
          component="li"
          key={index}
          sx={{
            display: 'grid',
            gridTemplateColumns: '14px 1fr',
            gap: 1.25,
            fontFamily: FONT_SANS,
            fontSize: size,
            lineHeight: 1.5,
            color,
            '& b': { fontWeight: 700 },
          }}
        >
          <Box sx={{ width: 10, height: 10, bgcolor: PRESS.red, mt: '0.5em' }} aria-hidden />
          <Box>{item}</Box>
        </Box>
      ))}
    </Box>
  )
}

/** A small heading inside a section: capitals on a black rule. */
export function SubHead({ children, color = PRESS.ink }: { children: ReactNode; color?: string }) {
  return (
    <Box
      sx={{
        borderTop: `4px solid ${color}`,
        pt: 1,
        mb: 1.5,
        fontFamily: FONT_DISPLAY,
        fontWeight: 600,
        fontSize: '1.3rem',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        lineHeight: 1.1,
        color,
      }}
    >
      {children}
    </Box>
  )
}

export interface LedgerRow {
  value: string
  label: string
  tone?: 'red' | 'ink'
  /** A rule above: this row is a total. */
  rule?: boolean
}

/** A sum written down the way a table does it: a column of figures and what each is. */
export function Ledger({ rows }: { rows: LedgerRow[] }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      {rows.map(row => {
        const bg = row.tone === 'red' ? PRESS.red : row.tone === 'ink' ? PRESS.ink : 'transparent'
        const fg = row.tone ? PRESS.paper : PRESS.ink
        return (
          <Box
            key={row.label}
            sx={{
              display: 'grid',
              gridTemplateColumns: '84px 1fr',
              alignItems: 'center',
              gap: 1.5,
              bgcolor: bg,
              color: fg,
              borderTop: row.rule ? `3px solid ${PRESS.ink}` : 'none',
              px: 1,
              py: 0.5,
            }}
          >
            <Box sx={{ textAlign: 'right' }}>
              <Numeral size="2rem" color={fg}>
                {row.value}
              </Numeral>
            </Box>
            <Box
              sx={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 500,
                fontSize: '0.95rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                lineHeight: 1.2,
              }}
            >
              {row.label}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
