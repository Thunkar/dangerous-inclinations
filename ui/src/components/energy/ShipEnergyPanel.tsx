import { useMemo } from 'react'
import { Box, Typography, styled } from '@mui/material'
import type {
  Subsystem,
  SubsystemType,
  ReactorState,
  HeatState,
  ShipLoadout,
} from '@dangerous-inclinations/engine'
import { ShipDisplay } from '../ship'
import { EnergySlot } from './EnergySlot'
import { FixedEnergySlot } from './FixedEnergySlot'

interface ShipEnergyPanelProps {
  subsystems: Subsystem[]
  reactor: ReactorState
  heat: HeatState
  hitPoints: number
  maxHitPoints: number
  dissipationCapacity: number
  loadout: ShipLoadout
  onAllocateEnergy: (subsystemIndex: number, amount: number) => void
  onDeallocateEnergy: (subsystemIndex: number, amount: number) => void
}

const TicksContainer = styled(Box)({
  display: 'flex',
  gap: 2,
  height: 14,
  position: 'relative',
})

interface TickProps {
  filled: boolean
  color: string
}

const Tick = styled(Box, {
  shouldForwardProp: prop => !['filled', 'color'].includes(prop as string),
})<TickProps>(({ filled, color }) => ({
  flex: 1,
  height: '100%',
  backgroundColor: filled ? color : 'rgba(255,255,255,0.1)',
  borderRadius: 2,
  transition: 'background-color 0.2s',
}))

// Helper to find subsystem with its index
function findSubsystemWithIndex(
  subsystems: Subsystem[],
  type: SubsystemType,
  usedIndices: Set<number> = new Set()
): { subsystem: Subsystem; index: number } | null {
  const index = subsystems.findIndex((s, i) => s.type === type && !usedIndices.has(i))
  if (index === -1) return null
  return { subsystem: subsystems[index], index }
}

export function ShipEnergyPanel({
  subsystems,
  reactor,
  heat,
  dissipationCapacity,
  loadout,
  onAllocateEnergy,
  onDeallocateEnergy,
}: ShipEnergyPanelProps) {
  // Track which subsystem indices we've already used (for duplicate types)
  const usedIndices = useMemo(() => new Set<number>(), [])

  // Get fixed subsystems with indices (engines, rotation)
  const enginesData = useMemo(() => {
    const data = findSubsystemWithIndex(subsystems, 'engines')
    if (data) usedIndices.add(data.index)
    return data
  }, [subsystems, usedIndices])

  const rotationData = useMemo(() => {
    const data = findSubsystemWithIndex(subsystems, 'rotation')
    if (data) usedIndices.add(data.index)
    return data
  }, [subsystems, usedIndices])

  // Get shield energy for worst-case heat projection
  const shieldEnergy = useMemo(() => {
    const shieldsData = findSubsystemWithIndex(subsystems, 'shields')
    return shieldsData?.subsystem.allocatedEnergy ?? 0
  }, [subsystems])

  // Calculate worst-case heat (current heat + max shield absorption)
  const worstCaseHeat = heat.currentHeat + shieldEnergy
  const shieldHeatExceedsVenting = worstCaseHeat > dissipationCapacity && shieldEnergy > 0

  // Map loadout slots to subsystem objects with their indices
  // Each slot in loadout corresponds to a specific subsystem instance
  const forwardSubsystemData = useMemo(() => {
    const trackUsed = new Set(usedIndices)
    return loadout.forwardSlots.map(type => {
      if (!type) return null
      const data = findSubsystemWithIndex(subsystems, type, trackUsed)
      if (data) trackUsed.add(data.index)
      return data
    })
  }, [loadout.forwardSlots, subsystems, usedIndices])

  const sideSubsystemData = useMemo(() => {
    // Continue tracking from forward slots
    const trackUsed = new Set(usedIndices)
    forwardSubsystemData.forEach(d => { if (d) trackUsed.add(d.index) })
    return loadout.sideSlots.map(type => {
      if (!type) return null
      const data = findSubsystemWithIndex(subsystems, type, trackUsed)
      if (data) trackUsed.add(data.index)
      return data
    })
  }, [loadout.sideSlots, subsystems, usedIndices, forwardSubsystemData])

  const renderEnergySlot = (
    data: { subsystem: Subsystem; index: number } | null,
    key: string
  ) => {
    if (!data) {
      return (
        <Box
          key={key}
          sx={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: '2px dashed',
            borderColor: 'divider',
            opacity: 0.3,
          }}
        />
      )
    }

    return (
      <EnergySlot
        key={key}
        subsystem={data.subsystem}
        subsystemIndex={data.index}
        availableEnergy={reactor.availableEnergy}
        onAllocate={onAllocateEnergy}
        onDeallocate={onDeallocateEnergy}
      />
    )
  }

  const renderFixedSlot = (
    data: { subsystem: Subsystem; index: number } | null,
    key: string
  ) => {
    if (!data) return null

    return (
      <FixedEnergySlot
        key={key}
        subsystem={data.subsystem}
        subsystemIndex={data.index}
        availableEnergy={reactor.availableEnergy}
        onAllocate={onAllocateEnergy}
        onDeallocate={onDeallocateEnergy}
      />
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Ship Display - no stats overlay */}
      <ShipDisplay
        shipImageSrc="/assets/ship.svg"
        slots={{
          forward: [
            renderEnergySlot(forwardSubsystemData[0], 'f0'),
            renderEnergySlot(forwardSubsystemData[1], 'f1'),
          ] as [React.ReactNode, React.ReactNode],
          side: [
            renderEnergySlot(sideSubsystemData[0], 's0'),
            renderEnergySlot(sideSubsystemData[1], 's1'),
            renderEnergySlot(sideSubsystemData[2], 's2'),
            renderEnergySlot(sideSubsystemData[3], 's3'),
          ] as [React.ReactNode, React.ReactNode, React.ReactNode, React.ReactNode],
        }}
        fixedSlots={{
          aft: [
            renderFixedSlot(enginesData, 'engines'),
            renderFixedSlot(rotationData, 'rotation'),
          ].filter(Boolean) as React.ReactNode[],
        }}
      />

      {/* Energy/Heat Bar below the ship */}
      <Box sx={{ px: 2, pb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Typography
            sx={{
              fontSize: '0.6rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            Projected Heat
          </Typography>
          <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)' }}>
            {heat.currentHeat} heat from used systems
          </Typography>
        </Box>
        <TicksContainer>
          {Array.from({ length: 10 }).map((_, i) => {
            // Determine tick state based on projected heat from USED subsystems
            const isWithinVentCapacity = i < dissipationCapacity
            const hasHeat = i < heat.currentHeat

            // Tick color logic:
            // - Blue if heat is within vent capacity (will be dissipated)
            // - Red if heat is beyond vent capacity (will cause damage)
            const isFilled = hasHeat
            const tickColor = hasHeat
              ? isWithinVentCapacity ? '#2196f3' : '#f44336'
              : 'transparent'

            return (
              <Tick
                key={i}
                filled={isFilled}
                color={tickColor}
              />
            )
          })}
          {/* Vent capacity divider - red vertical bar */}
          <Box
            sx={{
              position: 'absolute',
              left: `${(dissipationCapacity / 10) * 100}%`,
              top: -2,
              bottom: -2,
              width: 3,
              bgcolor: '#f44336',
              borderRadius: 1,
              transform: 'translateX(-50%)',
              boxShadow: '0 0 4px rgba(244, 67, 54, 0.6)',
            }}
          />
          {/* Shield worst-case heat divider - purple vertical bar */}
          {shieldEnergy > 0 && (
            <Box
              sx={{
                position: 'absolute',
                left: `${(worstCaseHeat / 10) * 100}%`,
                top: -2,
                bottom: -2,
                width: 3,
                bgcolor: '#9c27b0',
                borderRadius: 1,
                transform: 'translateX(-50%)',
                boxShadow: '0 0 4px rgba(156, 39, 176, 0.6)',
              }}
            />
          )}
        </TicksContainer>
        {/* Vent capacity label */}
        <Box sx={{ display: 'flex', mt: 0.5 }}>
          <Typography
            sx={{
              fontSize: '0.5rem',
              color: 'rgba(244, 67, 54, 0.8)',
              width: `${(dissipationCapacity / 10) * 100}%`,
              textAlign: 'right',
              pr: 0.5,
            }}
          >
            vent cap
          </Typography>
        </Box>
        {heat.currentHeat > dissipationCapacity && (
          <Typography
            sx={{
              fontSize: '0.6rem',
              color: 'error.main',
              fontWeight: 'bold',
              textAlign: 'center',
              mt: 0.5,
            }}
          >
            -{heat.currentHeat - dissipationCapacity} HP from excess heat at turn start
          </Typography>
        )}
        {shieldHeatExceedsVenting && heat.currentHeat <= dissipationCapacity && (
          <Typography
            sx={{
              fontSize: '0.6rem',
              color: '#9c27b0',
              fontWeight: 'bold',
              textAlign: 'center',
              mt: 0.5,
            }}
          >
            If shields absorb max damage ({shieldEnergy}), you may take {worstCaseHeat - dissipationCapacity} heat damage
          </Typography>
        )}
      </Box>
    </Box>
  )
}
