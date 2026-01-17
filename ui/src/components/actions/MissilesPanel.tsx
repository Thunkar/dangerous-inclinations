import { Typography } from '@mui/material'
import type { SubsystemType, Player } from '@dangerous-inclinations/engine'
import { WeaponPanel } from './WeaponPanel'

interface MissilesPanelProps {
  allPlayers: Player[]
  playerId: string
  targetPlayerId?: string
  criticalTarget?: SubsystemType
  onTargetChange: (targetPlayerId: string) => void
  onCriticalTargetChange: (subsystemType: SubsystemType) => void
  totalMissileAmmo: number
}

export function MissilesPanel({
  allPlayers,
  playerId,
  targetPlayerId,
  criticalTarget,
  onTargetChange,
  onCriticalTargetChange,
  totalMissileAmmo,
}: MissilesPanelProps) {
  // Missiles can target ANY player (they're self-propelled)
  const validTargets = allPlayers
    .filter(p => p.id !== playerId)
    .map(p => ({ targetPlayer: p, inRange: true }))

  return (
    <WeaponPanel
      title="Missiles"
      icon="missiles"
      targetPlayerId={targetPlayerId}
      criticalTarget={criticalTarget}
      inRangeTargets={validTargets}
      onTargetChange={onTargetChange}
      onCriticalTargetChange={onCriticalTargetChange}
      extraInfo={
        <Typography variant="caption" color="text.secondary">
          ({totalMissileAmmo} remaining)
        </Typography>
      }
    />
  )
}
