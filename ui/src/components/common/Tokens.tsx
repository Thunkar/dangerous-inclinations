/**
 * The readouts on a loadout: energy cells, segmented hull/heat/fuel bars and the
 * cargo chits in the hold. Everything is a plain lit shape: no icons, so it
 * reads at a glance from across the table.
 */
import type { ReactNode } from 'react'
import { Box, Tooltip, Typography } from '@mui/material'
import { FONT_MONO, TABLE } from '../../theme'

// ---------------------------------------------------------------------------
// Energy cells
// ---------------------------------------------------------------------------

interface EnergyCubesProps {
  count: number
  /** Cells printed on the tile. 0 hides the row entirely. */
  capacity: number
  size?: number
  /** Click a cell to set the allocation to that many cubes. */
  onSet?: (n: number) => void
  disabled?: boolean
  title?: string
  /**
   * Cubes needed before the tile does anything (its minimum). A tick is drawn
   * after that cell, so the row reads "off, or at least this many".
   */
  threshold?: number
}

export function EnergyCubes({
  count,
  capacity,
  size = 9,
  onSet,
  disabled,
  title,
  threshold,
}: EnergyCubesProps) {
  if (capacity <= 0) return null
  const tick = threshold !== undefined && threshold > 0 && threshold < capacity ? threshold : undefined
  const row = (
    <Box sx={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
      {Array.from({ length: capacity }, (_, i) => {
        const filled = i < count
        return (
          <Box
            key={i}
            onClick={
              onSet && !disabled
                ? (e) => {
                    e.stopPropagation()
                    onSet(filled && i + 1 === count ? i : i + 1)
                  }
                : undefined
            }
            sx={{
              width: size,
              height: size,
              borderRadius: '1px',
              flexShrink: 0,
              cursor: onSet && !disabled ? 'pointer' : 'default',
              bgcolor: filled ? TABLE.energy : 'rgba(126,165,205,0.08)',
              border: `1px solid ${filled ? TABLE.energy : 'rgba(126,165,205,0.22)'}`,
              boxShadow: filled ? `0 0 ${Math.max(3, size * 0.7)}px rgba(73,195,255,0.65)` : 'none',
              transition: 'background-color 120ms ease, box-shadow 120ms ease',
              ...(tick !== undefined && i + 1 === tick
                ? { mr: '3px', borderRight: `2px solid ${TABLE.accent}` }
                : null),
              '&:hover': onSet && !disabled ? { outline: `1px solid ${TABLE.accent}` } : undefined,
            }}
          />
        )
      })}
    </Box>
  )
  return title ? (
    <Tooltip title={title} placement="top">
      {row}
    </Tooltip>
  ) : (
    row
  )
}

// ---------------------------------------------------------------------------
// Segmented bars
// ---------------------------------------------------------------------------

interface PipTrackProps {
  value: number
  max: number
  color: string
  /** Draw a heavier divider after this many segments (heat dissipation). */
  threshold?: number
  label?: string
  size?: number
  compact?: boolean
  /**
   * Where the track ends up once the planned turn has played out. Segments
   * between the two are drawn as ghosts: heat about to be made, fuel about
   * to be spent or scooped.
   */
  projected?: number
  /**
   * Where the track could still end up in the worst case: heat your powered
   * shields would make if they absorbed their whole allocation. Segments past
   * the ghosts are drawn hatched: heat that is not yours to spend, only heat
   * someone else can put on you.
   */
  worstCase?: number
  /** Replaces the plain "value/max" readout at the end of the bar. */
  readout?: ReactNode
  /** Reserved label width, so several tracks under each other line up. */
  labelWidth?: number
}

/** Hull, heat and fuel read as segmented bars: lit segments up to the value. */
export function PipTrack({
  value,
  max,
  color,
  threshold,
  label,
  size = 10,
  compact,
  projected,
  worstCase,
  readout,
  labelWidth = 30,
}: PipTrackProps) {
  const target = projected ?? value
  const lit = Math.max(0, Math.min(value, target))
  const ghostTo = Math.max(value, target)
  const hatchTo = Math.max(ghostTo, worstCase ?? 0)

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, minWidth: 0 }}>
      {label && !compact && (
        <Typography
          variant="overline"
          sx={{ color: TABLE.inkFaint, lineHeight: 1, minWidth: labelWidth, flexShrink: 0 }}
        >
          {label}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: '2px', alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
        {Array.from({ length: max }, (_, i) => {
          const on = i < lit
          const ghost = !on && i < ghostTo
          const hatched = !on && !ghost && i < hatchTo
          return (
            <Box
              key={i}
              sx={{
                width: Math.max(4, Math.round(size * 0.55)),
                height: size,
                borderRadius: '1px',
                flexShrink: 0,
                boxSizing: 'border-box',
                bgcolor: on || ghost ? color : 'rgba(126,165,205,0.09)',
                opacity: ghost ? 0.38 : 1,
                boxShadow: on ? `0 0 5px ${color}66` : 'none',
                // Alpha on the colours rather than on the box, so the amber
                // dissipation tick below keeps its own full strength.
                ...(hatched
                  ? {
                      bgcolor: 'transparent',
                      border: `1px solid ${color}bb`,
                      backgroundImage: `repeating-linear-gradient(135deg, ${color}aa 0 1px, transparent 1px 3px)`,
                    }
                  : null),
                ...(threshold !== undefined && i + 1 === threshold
                  ? { mr: '4px', borderRight: `2px solid ${TABLE.accent}` }
                  : null),
              }}
            />
          )
        })}
      </Box>
      <Typography
        sx={{
          fontFamily: FONT_MONO,
          fontSize: '0.8rem',
          color: TABLE.ink,
          fontWeight: 700,
          ml: 0.25,
          whiteSpace: 'nowrap',
        }}
      >
        {readout ?? (
          <>
            {value}
            <Box component="span" sx={{ color: TABLE.inkFaint, fontWeight: 400 }}>
              /{max}
            </Box>
          </>
        )}
      </Typography>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Cargo chits
// ---------------------------------------------------------------------------

const CARGO_COLORS = {
  crate: '#c79a4e',
  data: TABLE.teal,
} as const

export function CargoChits({ crates, data, size = 11 }: { crates: number; data: number; size?: number }) {
  const groups: Array<[keyof typeof CARGO_COLORS, number]> = [
    ['crate', crates],
    ['data', data],
  ]
  if (crates + data === 0) {
    return (
      <Typography variant="caption" sx={{ color: TABLE.inkFaint }}>
        empty hold
      </Typography>
    )
  }
  return (
    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
      {groups.map(([kind, n]) =>
        n === 0 ? null : (
          <Tooltip key={kind} title={`${n} ${kind}${n > 1 ? 's' : ''}`}>
            <Box sx={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
              {Array.from({ length: Math.min(n, 5) }, (_, i) => (
                <Box
                  key={i}
                  sx={{
                    width: size,
                    height: size,
                    bgcolor: 'transparent',
                    border: `1.5px solid ${CARGO_COLORS[kind]}`,
                    boxShadow: `0 0 6px ${CARGO_COLORS[kind]}55`,
                    borderRadius: kind === 'data' ? '50%' : '1px',
                  }}
                />
              ))}
              {n > 5 && (
                <Typography variant="caption" sx={{ color: TABLE.inkFaint }}>
                  ×{n}
                </Typography>
              )}
            </Box>
          </Tooltip>
        ),
      )}
    </Box>
  )
}
