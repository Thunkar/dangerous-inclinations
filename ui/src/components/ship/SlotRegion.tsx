/**
 * One of the four slot rails bolted to the hull: aft (engines and thrusters),
 * port and starboard (two side slots each) and forward (scoop + the forward
 * slot). Each rail is a flat plate with a hairline edge; the edge that faces
 * the hull is ruled in red while the rail takes a drop, so the loadout reads
 * as a fitting board rather than as a form.
 */
import { Box } from '@mui/material'
import { TABLE } from '../../theme'
import { FONT_DISPLAY } from '../../design/press'
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

/** Which edge of the rail faces the hull, and so carries the red rule. */
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
        bgcolor: TABLE.plateSunk,
        border: `1px solid ${TABLE.plateEdge}`,
        [INNER_EDGE[position]]: `${active ? 3 : 1}px solid ${edgeColor}`,
        transition: 'border-color 160ms ease',
        overflow: 'visible',
      }}
    >
      {metrics.band >= 60 && (
        <Box
          component="span"
          sx={{
            position: 'absolute',
            fontFamily: FONT_DISPLAY,
            fontSize: 11,
            fontWeight: 600,
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
