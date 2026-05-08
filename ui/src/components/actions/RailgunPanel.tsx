import { useMemo } from 'react'
import { Box, Typography, FormControlLabel, Switch, Chip } from '@mui/material'
import type { ShipState, Subsystem, SubsystemType, Player, Facing, ActionType, BurnIntensity } from '@dangerous-inclinations/engine'
import { calculateFiringSolutions, calculatePostMovementPosition, BURN_COSTS } from '@dangerous-inclinations/engine'
import { getGravityWell } from '@dangerous-inclinations/engine'
import { WeaponPanel } from './WeaponPanel'

interface RailgunPanelProps {
  ship: ShipState
  pendingSubsystems: Subsystem[]
  railgunSubsystem: Subsystem | null | undefined
  allPlayers: Player[]
  playerId: string
  targetPlayerId?: string
  criticalTarget?: SubsystemType
  onTargetChange: (targetPlayerId: string) => void
  onCriticalTargetChange: (subsystemType: SubsystemType) => void
  rangeVisible: boolean
  onToggleRange: () => void
  // Movement context for firing solution calculation
  firesAfterMovement: boolean
  rotateBeforeMove: boolean
  targetFacing: Facing
  actionType: ActionType
  burnIntensity: BurnIntensity
  sectorAdjustment: number
  // Recoil
  compensateRecoil: boolean
  onCompensateRecoilChange: (compensate: boolean) => void
}

export function RailgunPanel({
  ship,
  pendingSubsystems,
  railgunSubsystem,
  allPlayers,
  playerId,
  targetPlayerId,
  criticalTarget,
  onTargetChange,
  onCriticalTargetChange,
  rangeVisible,
  onToggleRange,
  firesAfterMovement,
  rotateBeforeMove,
  targetFacing,
  actionType,
  burnIntensity,
  sectorAdjustment,
  compensateRecoil,
  onCompensateRecoilChange,
}: RailgunPanelProps) {
  // Calculate ship position for range calculations
  let shipForRangeCalc = ship
  if (firesAfterMovement && actionType === 'burn') {
    shipForRangeCalc = calculatePostMovementPosition(
      ship,
      targetFacing,
      { actionType, burnIntensity, sectorAdjustment },
      rotateBeforeMove
    )
  } else if (firesAfterMovement && actionType === 'coast') {
    shipForRangeCalc = calculatePostMovementPosition(
      ship,
      targetFacing,
      { actionType: 'coast', sectorAdjustment: 0 },
      rotateBeforeMove
    )
  }

  const firingSolutions = railgunSubsystem
    ? calculateFiringSolutions(railgunSubsystem, shipForRangeCalc, allPlayers, playerId, targetFacing)
    : []
  const inRangeTargets = firingSolutions.filter(fs => fs.inRange)

  // Recoil info
  const recoilInfo = useMemo(() => {
    const recoilDirection = ship.facing === 'prograde' ? 1 : -1
    const recoilRing = ship.ring + recoilDirection
    const maxRing = getGravityWell(ship.wellId)?.rings.length ?? 5
    const wouldBeInvalid = recoilRing < 1 || recoilRing > maxRing
    // Use pending subsystems (reflects current energy allocation in the UI)
    const engines = pendingSubsystems.find(s => s.type === 'engines')
    const canCompensate = !!engines && engines.allocatedEnergy >= BURN_COSTS.soft.energy && !engines.usedThisTurn && ship.reactionMass >= BURN_COSTS.soft.mass
    const directionLabel = ship.facing === 'prograde' ? 'outward' : 'inward'
    return { recoilRing, wouldBeInvalid, canCompensate, directionLabel }
  }, [ship, pendingSubsystems])

  return (
    <Box>
      <WeaponPanel
        title="Railgun"
        icon="railgun"
        targetPlayerId={targetPlayerId}
        criticalTarget={criticalTarget}
        inRangeTargets={inRangeTargets}
        onTargetChange={onTargetChange}
        onCriticalTargetChange={onCriticalTargetChange}
        showRangeToggle
        rangeVisible={rangeVisible}
        onToggleRange={onToggleRange}
      />
      {/* Recoil info */}
      <Box sx={{ px: 1.5, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600 }}>
            Recoil: Ring {ship.ring} → {recoilInfo.recoilRing} ({recoilInfo.directionLabel})
          </Typography>
          {recoilInfo.wouldBeInvalid && !compensateRecoil && (
            <Chip label="BLOCKED" size="small" color="error" sx={{ height: 18, fontSize: '0.6rem' }} />
          )}
        </Box>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={compensateRecoil}
              onChange={(_, checked) => onCompensateRecoilChange(checked)}
              disabled={!recoilInfo.canCompensate}
            />
          }
          label={
            <Typography variant="caption" color={recoilInfo.canCompensate ? 'text.primary' : 'text.disabled'}>
              Engine compensation (-1 mass, +heat)
            </Typography>
          }
          sx={{ ml: 0 }}
        />
      </Box>
    </Box>
  )
}
