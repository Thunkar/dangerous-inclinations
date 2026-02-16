import type { ShipState, Subsystem, SubsystemType, Player, Facing, ActionType, BurnIntensity } from '@dangerous-inclinations/engine'
import { calculateFiringSolutions, calculatePostMovementPosition } from '@dangerous-inclinations/engine'
import { WeaponPanel } from './WeaponPanel'

interface BallisticRackPanelProps {
  ship: ShipState
  ballisticRackSubsystems: Subsystem[]
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

export function BallisticRackPanel({
  ship,
  ballisticRackSubsystems,
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
}: BallisticRackPanelProps) {
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

  // Calculate firing solutions from all ballistic rack instances, deduplicating targets
  const allSolutions = new Map<string, { targetPlayer: Player; inRange: boolean }>()
  for (const sub of ballisticRackSubsystems) {
    const solutions = calculateFiringSolutions(sub, shipForRangeCalc, allPlayers, playerId)
    for (const sol of solutions) {
      if (!allSolutions.has(sol.targetPlayer.id) || sol.inRange) {
        allSolutions.set(sol.targetPlayer.id, sol)
      }
    }
  }
  const inRangeTargets = Array.from(allSolutions.values()).filter(fs => fs.inRange)

  return (
    <WeaponPanel
      title="Ballistic Rack (PDC)"
      icon="ballistic_rack"
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
