import type { ShipState, Subsystem, SubsystemType, Player, Facing, ActionType, BurnIntensity } from '@dangerous-inclinations/engine'
import { getSubsystemConfig, calculateFiringSolutions, calculatePostMovementPosition } from '@dangerous-inclinations/engine'
import { WeaponPanel } from './WeaponPanel'

interface LaserPanelProps {
  ship: ShipState
  laserSubsystem: Subsystem | null | undefined
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
}

export function LaserPanel({
  ship,
  laserSubsystem,
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
}: LaserPanelProps) {
  const subsystemConfig = laserSubsystem ? getSubsystemConfig(laserSubsystem.type) : null
  const weaponStats = subsystemConfig?.weaponStats

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

  const firingSolutions = weaponStats
    ? calculateFiringSolutions(weaponStats, shipForRangeCalc, allPlayers, playerId)
    : []
  const inRangeTargets = firingSolutions.filter(fs => fs.inRange)

  return (
    <WeaponPanel
      title="Broadside Laser"
      icon="laser"
      targetPlayerId={targetPlayerId}
      criticalTarget={criticalTarget}
      inRangeTargets={inRangeTargets}
      onTargetChange={onTargetChange}
      onCriticalTargetChange={onCriticalTargetChange}
      showRangeToggle
      rangeVisible={rangeVisible}
      onToggleRange={onToggleRange}
    />
  )
}
