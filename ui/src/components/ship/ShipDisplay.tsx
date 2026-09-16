/**
 * The ship mat: the hull silhouette with its slot rails around it — the
 * forward slot at the nose, two side slots down each flank, the fixed systems
 * at the stern and the scoop at the bow.
 *
 * The same mat is used to fit the ship out at the start of the game (the
 * rails hold drop targets) and to run it at the table (the rails hold the
 * tiles and their energy cells).
 */
import { Box } from '@mui/material'
import { KestrelMark } from '../../ships/KestrelMark'
import { SlotRegion } from './SlotRegion'
import { DEFAULT_SHIP_METRICS } from './types'
import type { ShipDisplayProps, ShipMetrics } from './types'

export function ShipDisplay({
  slots,
  fixed,
  shipImageSrc,
  appearance,
  identityColor,
  metrics,
  faded,
  activeRails,
}: ShipDisplayProps) {
  const m: ShipMetrics = { ...DEFAULT_SHIP_METRICS, ...metrics }
  const inset = m.band + 6
  const hullWidth = Math.max(60, m.width - inset * 2 - 16)

  return (
    <Box sx={{ position: 'relative', width: m.width, height: m.height, flexShrink: 0 }}>
      {/* The hull itself, lit from above */}
      <Box
        sx={{
          position: 'absolute',
          inset: `${inset}px`,
          borderRadius: '6px',
          background: 'radial-gradient(ellipse, #71817e15, transparent 70%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        {shipImageSrc ? (
          <Box
            component="img"
            src={shipImageSrc}
            alt="Ship"
            sx={{
              width: hullWidth,
              maxHeight: '100%',
              objectFit: 'contain',
              opacity: faded ? 0.3 : 0.85,
            }}
          />
        ) : (
          <Box sx={{ width: hullWidth, opacity: faded ? 0.3 : 1 }}>
            <KestrelMark appearance={appearance} accent={identityColor} />
          </Box>
        )}
      </Box>

      <SlotRegion position="aft" metrics={m}>
        {fixed?.aft}
      </SlotRegion>
      <SlotRegion position="port" metrics={m} active={activeRails?.side}>
        {slots.side[0]}
        {slots.side[1]}
      </SlotRegion>
      <SlotRegion position="forward" metrics={m} active={activeRails?.forward}>
        {fixed?.forward}
        {slots.forward[0]}
      </SlotRegion>
      <SlotRegion position="starboard" metrics={m} active={activeRails?.side}>
        {slots.side[2]}
        {slots.side[3]}
      </SlotRegion>
    </Box>
  )
}
