/**
 * One of the four slot rails bolted to the hull: aft (engines and thrusters),
 * port and starboard (two side slots each) and forward (scoop + the forward
 * slot). Each rail is a dark instrument plate whose inner edge glows toward
 * the hull, so the mat reads as hardware rather than as a form.
 */
import { Box } from '@mui/material'
import { FONT_MONO, TABLE } from '../../theme'
import type { SlotRegionProps, SlotRegionPosition } from './types'

const GAP = 6

const LABEL: Record<SlotRegionPosition, string> = {
  aft: 'AFT',
  port: 'PORT',
  forward: 'FWD',
  starboard: 'STBD',
}

function railBox(position: SlotRegionPosition, { width, height, band }: SlotRegionProps['metrics']) {
  const inset = band + GAP
  const vertical = { top: inset, height: height - inset * 2, width: band }
  const horizontal = { left: inset, width: width - inset * 2, height: band }
  switch (position) {
    case 'aft':
      return { ...vertical, left: 0 }
    case 'forward':
      return { ...vertical, right: 0 }
    case 'port':
      return { ...horizontal, top: 0 }
    case 'starboard':
      return { ...horizontal, bottom: 0 }
  }
}

/** Which edge of the rail faces the hull, and so carries the glow. */
const INNER_EDGE: Record<SlotRegionPosition, string> = {
  aft: 'borderRight',
  forward: 'borderLeft',
  port: 'borderBottom',
  starboard: 'borderTop',
}

export function SlotRegion({ position, children, metrics, active }: SlotRegionProps) {
  const vertical = position === 'aft' || position === 'forward'
  const edgeColor = active ? TABLE.accent : TABLE.plateEdge

  return (
    <Box
      sx={{
        position: 'absolute',
        ...railBox(position, metrics),
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'space-evenly',
        gap: 0.5,
        borderRadius: '3px',
        background: `linear-gradient(${vertical ? '90deg' : '180deg'}, ${TABLE.plateHi} 0%, ${TABLE.plateSunk} 100%)`,
        border: `1px solid ${TABLE.plateEdge}`,
        [INNER_EDGE[position]]: `1px solid ${edgeColor}`,
        boxShadow: active
          ? `inset 0 0 14px ${TABLE.accentGlow}, 0 0 10px ${TABLE.accentGlow}`
          : 'inset 0 0 12px rgba(0,0,0,0.5)',
        transition: 'box-shadow 160ms ease, border-color 160ms ease',
        overflow: 'visible',
      }}
    >
      {metrics.band >= 60 && (
        <Box
          component="span"
          sx={{
            position: 'absolute',
            fontFamily: FONT_MONO,
            fontSize: 11,
            letterSpacing: '0.18em',
            color: TABLE.inkFaint,
            pointerEvents: 'none',
            ...(vertical
              ? {
                  writingMode: 'vertical-rl',
                  top: 2,
                  left: 1,
                  transform: position === 'aft' ? 'rotate(180deg)' : 'none',
                }
              : { left: 4, top: 1 }),
          }}
        >
          {LABEL[position]}
        </Box>
      )}
      {children}
    </Box>
  )
}
