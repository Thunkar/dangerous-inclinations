import { Box, styled } from '@mui/material'
import { SlotRegion } from './SlotRegion'
import type { ShipDisplayProps } from './types'
import { FixedSubsystemSlot } from './FixedSubsystemSlot'

const buttonContainerWidth = 60
const positioningMargin = 5

const Container = styled(Box)({
  display: 'flex',
  flexDirection: 'row',
  position: 'relative',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5em 0.5em',
  width: '100%',
})

const Systems = styled(Box)({
  display: 'flex',
  position: 'relative',
  overflow: 'visible',
  width: '340px',
  height: '280px',
})

const ShipImage = styled('img', {
  shouldForwardProp: prop => prop !== 'shouldBlur',
})<{ shouldBlur?: boolean }>(({ shouldBlur }) => ({
  margin: `${buttonContainerWidth + positioningMargin * 2}px`,
  width: '190px',
  height: '150px',
  objectFit: 'contain',
  zIndex: 1,
  filter: shouldBlur ? 'blur(4px)' : undefined,
  transition: 'filter 0.3s',
}))

const StatsOverlay = styled(Box)({
  display: 'flex',
  flexWrap: 'wrap',
  position: 'absolute',
  justifyContent: 'space-between',
  height: '280px',
  width: '340px',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
})

export function ShipDisplay({
  slots,
  fixedSlots,
  stats,
  shipImageSrc = '/assets/ship.svg',
  blurShip = false,
}: ShipDisplayProps) {
  return (
    <Container>
      {stats && <StatsOverlay>{stats}</StatsOverlay>}

      <Systems>
        <ShipImage src={shipImageSrc} alt="Ship" shouldBlur={blurShip} />

        {/* Aft region - engines/rotation (fixed, not removable) */}
        <SlotRegion position="aft" shouldBlur={blurShip}>
          {fixedSlots?.aft ? (
            fixedSlots.aft
          ) : (
            <>
              <FixedSubsystemSlot subsystemType="engines" label="Engines" />
              <FixedSubsystemSlot subsystemType="rotation" label="Thrusters" />
            </>
          )}
        </SlotRegion>

        {/* Port region - side slots 0, 1 (upper side) */}
        <SlotRegion position="port" shouldBlur={blurShip}>
          {slots.side[0]}
          {slots.side[1]}
        </SlotRegion>

        {/* Forward region - forward slots 0, 1 */}
        <SlotRegion position="forward" shouldBlur={blurShip}>
          {slots.forward[0]}
          {slots.forward[1]}
        </SlotRegion>

        {/* Starboard region - side slots 2, 3 (lower side) */}
        <SlotRegion position="starboard" shouldBlur={blurShip}>
          {slots.side[2]}
          {slots.side[3]}
        </SlotRegion>
      </Systems>
    </Container>
  )
}
