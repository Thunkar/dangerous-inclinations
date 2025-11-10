import { Box, Typography, styled } from '@mui/material'
import { Fragment, useState, useCallback } from 'react'
import type { Subsystem, ReactorState, HeatState, SubsystemType } from '../../types/subsystems'
import { RadialMenu } from './energy/RadialMenu'
import { SubsystemButton } from './energy/SubsystemButton'
import { getSubsystem } from '../../utils/subsystemHelpers'
import { isSubsystemOverclocked } from '../../types/subsystems'

interface EnergyPanelProps {
  subsystems: Subsystem[]
  reactor: ReactorState
  heat: HeatState
  hitPoints: number
  maxHitPoints: number
  onAllocateEnergy: (subsystemType: SubsystemType, amount: number) => void
  onDeallocateEnergy: (subsystemType: SubsystemType, amount: number) => void
  onVentHeat: (amount: number) => void
}

const buttonContainerWidth = 60
const positioningMargin = 5
const trapezoidCorrection = 5
const trapezoidFactor = 50
const trapezoidAngle = 9

const Container = styled(Box)({
  display: 'flex',
  flexDirection: 'row',
  position: 'relative',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5em 0.5em',
  width: '100%',
})

const Stats = styled(Box)({
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

const Break = styled(Box)({
  flexBasis: '100%',
  height: 'calc(100% - 6rem)',
})

const Stat = styled(Box)({
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  fontSize: '0.7rem',
  height: '3rem',
  width: '2.2rem',
  pointerEvents: 'auto',
})

const CircleInfo = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  width: '100%',
  aspectRatio: '1/1',
  background: `radial-gradient(circle, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 50%, ${theme.palette.primary.light} 70%)`,
  borderRadius: '50%',
  border: `solid 2px ${theme.palette.divider}`,
}))

const Reactor = styled(CircleInfo)(({ theme }) => ({
  background: `radial-gradient(circle, ${theme.palette.secondary.dark} 0%, ${theme.palette.secondary.main} 50%, ${theme.palette.secondary.light} 70%)`,
}))

const Vent = styled(CircleInfo)(({ theme }) => ({
  background: `radial-gradient(circle, ${theme.palette.warning.dark} 0%, ${theme.palette.warning.main} 50%, ${theme.palette.warning.light} 70%)`,
}))

const Hull = styled(CircleInfo)(({ theme }) => ({
  background: `radial-gradient(circle, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 50%, ${theme.palette.primary.light} 70%)`,
}))

const Heat = styled(CircleInfo, {
  shouldForwardProp: prop => prop !== 'hasHeat',
})<{ hasHeat?: boolean }>(({ theme, hasHeat }) => ({
  background: `radial-gradient(circle, ${theme.palette.error.dark} 0%, ${theme.palette.error.main} 50%, ${theme.palette.error.light} 70%)`,
  cursor: hasHeat ? 'pointer' : 'default',
  pointerEvents: hasHeat ? 'auto' : 'none',
}))

const Systems = styled(Box)({
  display: 'flex',
  position: 'relative',
  overflow: 'visible',
  width: '340px',
  height: '280px',
})

const ButtonContainer = styled(Box)({
  position: 'absolute',
  display: 'flex',
  justifyContent: 'space-around',
  margin: 'auto',
  alignItems: 'center',
  overflow: 'visible',
})

const Aft = styled(ButtonContainer)({
  flexDirection: 'column',
  left: 0,
  height: `calc(100% - ${(buttonContainerWidth + positioningMargin) * 2}px)`,
  width: `${buttonContainerWidth}px`,
  top: `${buttonContainerWidth + positioningMargin}px`,
  padding: '0.3rem 0',
  borderRadius: '5px 0px 0px 5px',
})

const AftTrapezoid = styled(Aft, {
  shouldForwardProp: prop => prop !== 'shouldBlur',
})<{ shouldBlur?: boolean }>(({ theme, shouldBlur }) => ({
  left: `-${trapezoidCorrection}px`,
  transform: `perspective(${trapezoidFactor}px) rotateY(-${trapezoidAngle}deg)`,
  backgroundColor: theme.palette.action.hover,
  border: `solid ${theme.palette.divider}`,
  borderWidth: '2px 0px 2px 2px',
  filter: shouldBlur ? 'blur(4px)' : undefined,
  transition: 'filter 0.3s',
  overflow: 'visible',
}))

const Port = styled(ButtonContainer)({
  top: 0,
  width: `calc(100% - ${(buttonContainerWidth + positioningMargin) * 2}px)`,
  height: `${buttonContainerWidth}px`,
  left: `${buttonContainerWidth + positioningMargin}px`,
  padding: '0 0.2rem',
  borderRadius: '5px 5px 0px 0px',
})

const PortTrapezoid = styled(Port, {
  shouldForwardProp: prop => prop !== 'shouldBlur',
})<{ shouldBlur?: boolean }>(({ theme, shouldBlur }) => ({
  top: `-${trapezoidCorrection / 2}px`,
  backgroundColor: theme.palette.action.hover,
  transform: `perspective(${trapezoidFactor}px) rotateX(${trapezoidAngle}deg)`,
  border: `solid ${theme.palette.divider}`,
  borderWidth: '2px 2px 0px 2px',
  filter: shouldBlur ? 'blur(4px)' : undefined,
  transition: 'filter 0.3s',
  overflow: 'visible',
}))

const Forward = styled(ButtonContainer)({
  flexDirection: 'column',
  right: 0,
  height: `calc(100% - ${(buttonContainerWidth + positioningMargin) * 2}px)`,
  width: `${buttonContainerWidth}px`,
  top: `${buttonContainerWidth + positioningMargin}px`,
  padding: '0.2rem 0',
  borderRadius: '0px 5px 5px 0px',
})

const ForwardTrapezoid = styled(Forward, {
  shouldForwardProp: prop => prop !== 'shouldBlur',
})<{ shouldBlur?: boolean }>(({ theme, shouldBlur }) => ({
  right: `-${trapezoidCorrection}px`,
  backgroundColor: theme.palette.action.hover,
  transform: `perspective(${trapezoidFactor}px) rotateY(${trapezoidAngle}deg)`,
  border: `solid ${theme.palette.divider}`,
  borderWidth: '2px 2px 2px 0px',
  filter: shouldBlur ? 'blur(4px)' : undefined,
  transition: 'filter 0.3s',
  overflow: 'visible',
}))

const Starboard = styled(ButtonContainer)({
  bottom: 0,
  width: `calc(100% - ${(buttonContainerWidth + positioningMargin) * 2}px)`,
  height: `${buttonContainerWidth}px`,
  left: `${buttonContainerWidth + positioningMargin}px`,
  padding: '0 0.2rem',
})

const StarboardTrapezoid = styled(Starboard, {
  shouldForwardProp: prop => prop !== 'shouldBlur',
})<{ shouldBlur?: boolean }>(({ theme, shouldBlur }) => ({
  bottom: `-${trapezoidCorrection / 2}px`,
  backgroundColor: theme.palette.action.hover,
  transform: `perspective(${trapezoidFactor}px) rotateX(-${trapezoidAngle}deg)`,
  border: `solid ${theme.palette.divider}`,
  borderWidth: '0px 2px 2px 2px',
  borderRadius: '0px 0px 5px 5px',
  filter: shouldBlur ? 'blur(4px)' : undefined,
  transition: 'filter 0.3s',
  overflow: 'visible',
}))

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

const VerticalDivider = styled(Box, {
  shouldForwardProp: prop => prop !== 'visible',
})<{ visible: boolean }>(({ theme, visible }) => ({
  height: '1px',
  width: '100%',
  visibility: visible ? 'visible' : 'hidden',
  backgroundColor: theme.palette.divider,
}))

const HorizontalDivider = styled(Box, {
  shouldForwardProp: prop => prop !== 'visible',
})<{ visible: boolean }>(({ theme, visible }) => ({
  width: '1px',
  height: '100%',
  visibility: visible ? 'visible' : 'hidden',
  backgroundColor: theme.palette.divider,
}))

export function EnergyPanel({
  subsystems,
  reactor,
  heat,
  hitPoints,
  maxHitPoints,
  onAllocateEnergy,
  onDeallocateEnergy,
  onVentHeat,
}: EnergyPanelProps) {
  const [openMenuId, setOpenMenuId] = useState<SubsystemType | 'heat' | null>(null)

  const handleMenuToggle = useCallback((subsystemId: SubsystemType, isOpen: boolean) => {
    setOpenMenuId(isOpen ? subsystemId : null)
  }, [])

  const handleAllocate = (subsystemType: SubsystemType) => {
    const subsystem = getSubsystem(subsystems, subsystemType)
    if (subsystem && reactor.availableEnergy > 0) {
      onAllocateEnergy(subsystemType, subsystem.allocatedEnergy + 1)
    }
  }

  const handleDeallocate = (subsystemType: SubsystemType) => {
    const subsystem = getSubsystem(subsystems, subsystemType)
    if (subsystem && subsystem.allocatedEnergy > 0) {
      onDeallocateEnergy(subsystemType, 1)
    }
  }

  const renderSubsystemMenu = (
    subsystem: Subsystem,
    horizontal: boolean = false,
    position: 'aft' | 'port' | 'forward' | 'starboard' = 'aft'
  ) => {
    const isOverclocked = isSubsystemOverclocked(subsystem)
    const canAllocate = reactor.availableEnergy > 0
    const canDeallocate = subsystem.allocatedEnergy > 0

    const customToggle = (
      <Box sx={{ position: 'relative' }}>
        {/* Power indicator */}
        {subsystem.allocatedEnergy > 0 && (
          <Box
            sx={{
              position: 'absolute',
              left: horizontal ? 'calc(50% - 0.5em)' : '-0.8em',
              top: horizontal ? '-0.8em' : undefined,
              bgcolor: 'secondary.main',
              color: 'secondary.contrastText',
              borderRadius: '50%',
              width: '1em',
              height: '1em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7em',
              fontWeight: 'bold',
              zIndex: 15,
              filter:
                openMenuId !== null && openMenuId !== subsystem.type ? 'blur(5px)' : undefined,
            }}
          >
            {subsystem.allocatedEnergy}
          </Box>
        )}

        {/* Heat indicator */}
        {isOverclocked && (
          <Box
            sx={{
              position: 'absolute',
              right: horizontal ? 'calc(50% - 0.5em)' : '-0.8em',
              bottom: horizontal ? '-0.8em' : undefined,
              bgcolor: 'error.main',
              color: 'error.contrastText',
              borderRadius: '50%',
              width: '1em',
              height: '1em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7em',
              fontWeight: 'bold',
              zIndex: 15,
              filter:
                openMenuId !== null && openMenuId !== subsystem.type ? 'blur(5px)' : undefined,
            }}
          >
            !
          </Box>
        )}

        <SubsystemButton
          subsystemType={subsystem.type}
          allocatedEnergy={subsystem.allocatedEnergy}
          isPowered={subsystem.isPowered}
          isOverclocked={isOverclocked}
          usedThisTurn={subsystem.usedThisTurn}
          shouldBlur={openMenuId !== null && openMenuId !== subsystem.type}
        />
      </Box>
    )

    const actionButtons = [
      <SubsystemButton
        key="add"
        subsystemType={subsystem.type}
        allocatedEnergy={0}
        isPowered={false}
        variant="add"
        disabled={!canAllocate}
        onClick={() => handleAllocate(subsystem.type)}
      />,
      <SubsystemButton
        key="remove"
        subsystemType={subsystem.type}
        allocatedEnergy={0}
        isPowered={false}
        variant="remove"
        disabled={!canDeallocate}
        onClick={() => handleDeallocate(subsystem.type)}
      />,
    ]

    // Calculate angles based on position to point toward center
    // The center of the button spread should point toward the component center
    const rotationAngle = Math.PI / 3 // 60 degree spread
    const halfSpread = rotationAngle / 2

    const angleConfig = {
      aft: { centerAngle: 0, startAngle: -halfSpread }, // Right side (0°), spread around it
      port: { centerAngle: Math.PI / 2, startAngle: Math.PI / 2 - halfSpread }, // Bottom (90°), spread around it
      forward: { centerAngle: Math.PI, startAngle: Math.PI - halfSpread }, // Left side (180°), spread around it
      starboard: { centerAngle: -Math.PI / 2, startAngle: -Math.PI / 2 - halfSpread }, // Top (-90°), spread around it
    }

    const { startAngle } = angleConfig[position]

    return (
      <RadialMenu
        key={subsystem.type}
        customToggle={customToggle}
        radius={8}
        startAngle={startAngle}
        rotationAngle={rotationAngle}
        onMenuToggled={isOpen => handleMenuToggle(subsystem.type, isOpen)}
        disabled={openMenuId !== null && openMenuId !== subsystem.type}
      >
        {actionButtons}
      </RadialMenu>
    )
  }

  // Distribute subsystems to sides
  const aftSubsystems = subsystems.filter(s => ['engines', 'rotation'].includes(s.type))
  const portSubsystems = subsystems.filter(s => ['scoop', 'shields'].includes(s.type))
  const forwardSubsystems = subsystems.filter(s => ['railgun'].includes(s.type))
  const starboardSubsystems = subsystems.filter(s => ['missiles', 'laser'].includes(s.type))

  return (
    <Container>
      <Stats>
        <Stat>
          <Typography variant="caption">Reactor</Typography>
          <Reactor>
            <Typography variant="body2">
              {reactor.availableEnergy}/{reactor.totalCapacity}
            </Typography>
          </Reactor>
        </Stat>
        <Stat>
          <Typography variant="caption">Vent</Typography>
          <Vent>
            <Typography variant="body2">
              {reactor.energyToReturn + heat.heatToVent}/{reactor.maxReturnRate}
            </Typography>
          </Vent>
        </Stat>
        <Break />
        <Stat>
          <Typography variant="caption">Hull</Typography>
          <Hull>
            <Typography variant="body2">
              {hitPoints}/{maxHitPoints}
            </Typography>
          </Hull>
        </Stat>
        <Stat>
          <Typography variant="caption">Heat</Typography>
          <Heat hasHeat={heat.currentHeat > 0}>
            <Typography variant="body2">
              {Math.max(0, heat.currentHeat - heat.heatToVent)}
            </Typography>
          </Heat>
        </Stat>
      </Stats>

      <Systems>
        <ShipImage src="/assets/ship.png" alt="Ship" shouldBlur={openMenuId !== null} />

        <AftTrapezoid shouldBlur={openMenuId !== null} />
        <PortTrapezoid shouldBlur={openMenuId !== null} />
        <ForwardTrapezoid shouldBlur={openMenuId !== null} />
        <StarboardTrapezoid shouldBlur={openMenuId !== null} />

        <Aft>
          {aftSubsystems.map((subsystem, index) => (
            <Fragment key={subsystem.type}>
              {renderSubsystemMenu(subsystem, false, 'aft')}
              {index !== aftSubsystems.length - 1 && (
                <VerticalDivider visible={openMenuId === null} />
              )}
            </Fragment>
          ))}
        </Aft>

        <Port>
          {portSubsystems.map((subsystem, index) => (
            <Fragment key={subsystem.type}>
              {renderSubsystemMenu(subsystem, true, 'port')}
              {/* Add heat vent controls after the first subsystem (scoop) */}
              {index === 0 && heat.currentHeat > 0 && (
                <>
                  <HorizontalDivider visible={openMenuId === null} />
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 0.5,
                      position: 'relative',
                      filter: openMenuId !== null ? 'blur(4px)' : undefined,
                      transition: 'filter 0.3s',
                    }}
                  >
                    {/* Undo button - appears on top when heat venting is queued */}
                    {heat.heatToVent > 0 && (
                      <Box
                        sx={{
                          minWidth: '32px',
                          minHeight: '32px',
                          maxWidth: '32px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '50%',
                          backgroundColor: 'warning.main',
                          border: '2px solid black',
                          boxShadow: '2px 2px 1px 1px rgba(0,0,0,0.5)',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          '&:hover': {
                            backgroundColor: 'primary.light',
                            transform: 'scale(1.15)',
                          },
                        }}
                        onClick={() => onVentHeat(Math.max(0, heat.heatToVent - 1))}
                      >
                        <Typography
                          variant="body1"
                          sx={{ fontWeight: 'bold', userSelect: 'none', fontSize: '1rem' }}
                        >
                          ↶
                        </Typography>
                      </Box>
                    )}

                    {/* Main vent button */}
                    <SubsystemButton
                      subsystemType="engines"
                      allocatedEnergy={0}
                      isPowered={false}
                      variant="vent"
                      disabled={
                        heat.heatToVent >= heat.currentHeat ||
                        heat.heatToVent >=
                          Math.max(0, reactor.maxReturnRate - reactor.energyToReturn)
                      }
                      onClick={() => onVentHeat(heat.heatToVent + 1)}
                    />
                  </Box>
                </>
              )}
              {index !== portSubsystems.length - 1 && (
                <HorizontalDivider visible={openMenuId === null} />
              )}
            </Fragment>
          ))}
        </Port>

        <Forward>
          {forwardSubsystems.map((subsystem, index) => (
            <Fragment key={subsystem.type}>
              {renderSubsystemMenu(subsystem, false, 'forward')}
              {index !== forwardSubsystems.length - 1 && (
                <VerticalDivider visible={openMenuId === null} />
              )}
            </Fragment>
          ))}
        </Forward>

        <Starboard>
          {starboardSubsystems.map((subsystem, index) => (
            <Fragment key={subsystem.type}>
              {renderSubsystemMenu(subsystem, true, 'starboard')}
              {index !== starboardSubsystems.length - 1 && (
                <HorizontalDivider visible={openMenuId === null} />
              )}
            </Fragment>
          ))}
        </Starboard>
      </Systems>
    </Container>
  )
}
