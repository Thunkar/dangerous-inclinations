import { Paper, Stack, Box, Typography, IconButton } from '@mui/material'
import { useState, useEffect, useMemo } from 'react'
import { ArrowUpward, ArrowDownward } from '@mui/icons-material'
import type { BurnIntensity, Facing, Player, ActionType } from '@dangerous-inclinations/engine'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { getSubsystem } from '@dangerous-inclinations/engine'
import { useGame, type TacticalAction, type TacticalActionType } from '../context/GameContext'
import { getAvailableWellTransfers, getWellName } from '@dangerous-inclinations/engine'
import { GRAVITY_WELLS, TRANSFER_POINTS } from '@dangerous-inclinations/engine'
import { ShipEnergyPanel } from './energy'
import { OrientationControl } from './actions/OrientationControl'
import { MovementControl } from './actions/MovementControl'
import { ActionSummary } from './actions/ActionSummary'
import { LaserPanel } from './actions/LaserPanel'
import { RailgunPanel } from './actions/RailgunPanel'
import { MissilesPanel } from './actions/MissilesPanel'
import { STARTING_REACTION_MASS, SUBSYSTEM_CONFIGS } from '@dangerous-inclinations/engine'
import { CustomIcon } from './CustomIcon'
import { getMissileStats } from '@dangerous-inclinations/engine'
import { getGravityWell } from '@dangerous-inclinations/engine'

interface ControlPanelProps {
  player: Player
  allPlayers: Player[]
}

type PanelType = 'rotate' | 'move' | 'scoop' | 'fire_laser' | 'fire_railgun' | 'fire_missiles'

interface ActionPanel {
  id: string
  type: PanelType
  sequence: number
  targetPlayerId?: string
  destinationWellId?: string
  criticalTarget?: SubsystemType
}

export function ControlPanel({ player, allPlayers }: ControlPanelProps) {
  const {
    setFacing,
    setMovement,
    pendingState,
    executeTurn,
    allocateEnergy,
    deallocateEnergy,
    setTacticalSequence,
    weaponRangeVisibility,
    toggleWeaponRange,
    turnErrors,
    clearTurnErrors,
  } = useGame()

  const [targetFacing, setTargetFacing] = useState<Facing>(player.ship.facing)
  const [actionType, setActionType] = useState<ActionType>('coast')
  const [burnIntensity, setBurnIntensity] = useState<BurnIntensity>('soft')
  const [sectorAdjustment, setSectorAdjustment] = useState<number>(0)

  const [panels, setPanels] = useState<ActionPanel[]>([])

  const { ship } = player
  const subsystems = pendingState.subsystems

  const enginesSubsystem = getSubsystem(subsystems, 'engines')
  const rotationSubsystem = getSubsystem(subsystems, 'rotation')
  const scoopSubsystem = getSubsystem(subsystems, 'scoop')
  const laserSubsystem = getSubsystem(subsystems, 'laser')
  const railgunSubsystem = getSubsystem(subsystems, 'railgun')
  const missilesSubsystem = getSubsystem(subsystems, 'missiles')

  const availableWellTransfers = useMemo(
    () => getAvailableWellTransfers(ship.wellId, ship.ring, ship.sector, TRANSFER_POINTS),
    [ship.wellId, ship.ring, ship.sector]
  )

  const currentVelocity = useMemo(() => {
    const well = getGravityWell(ship.wellId)
    const ringConfig = well?.rings.find(r => r.ring === ship.ring)
    return ringConfig?.velocity || 1
  }, [ship.wellId, ship.ring])

  // Track subsystem availability
  const rotationPowered = rotationSubsystem?.isPowered && !rotationSubsystem.usedThisTurn
  const laserPowered = laserSubsystem?.isPowered && !laserSubsystem.usedThisTurn
  const railgunPowered = railgunSubsystem?.isPowered && !railgunSubsystem.usedThisTurn
  const missileSubsystems = useMemo(() => ship.subsystems.filter(s => s.type === 'missiles'), [ship.subsystems])
  const totalMissileAmmo = missileSubsystems.reduce((sum, s) => sum + (s.ammo ?? 0), 0)
  const missilesPowered = missilesSubsystem?.isPowered && !missilesSubsystem.usedThisTurn && totalMissileAmmo > 0
  const scoopPowered = scoopSubsystem?.isPowered && !scoopSubsystem.usedThisTurn
  const canUseScoop = actionType === 'coast' && scoopPowered

  // Build panels based on powered subsystems
  useEffect(() => {
    if (pendingState.tacticalSequence.length > 0) return

    const basePanels: ActionPanel[] = []
    let seq = 1

    // Only show rotation if powered
    if (rotationPowered) {
      basePanels.push({ id: 'rotate-panel', type: 'rotate', sequence: seq++ })
    }

    basePanels.push({ id: 'move-panel', type: 'move', sequence: seq++ })

    // Scoop appears if powered and coasting
    if (canUseScoop) {
      basePanels.push({ id: 'scoop-panel', type: 'scoop', sequence: seq++ })
    }

    // Auto-add weapons if powered
    if (laserPowered) {
      basePanels.push({ id: 'laser-panel', type: 'fire_laser', sequence: seq++, criticalTarget: 'shields' })
    }
    if (railgunPowered) {
      basePanels.push({ id: 'railgun-panel', type: 'fire_railgun', sequence: seq++, criticalTarget: 'shields' })
    }
    if (missilesPowered) {
      basePanels.push({ id: 'missiles-panel', type: 'fire_missiles', sequence: seq++, criticalTarget: 'shields' })
    }

    setPanels(basePanels)
    setTacticalSequence([{ id: 'move-panel', type: 'move', sequence: 1 }])
  }, [pendingState.tacticalSequence.length, setTacticalSequence, rotationPowered, laserPowered, railgunPowered, missilesPowered, canUseScoop])

  // Update panels when subsystem power changes
  useEffect(() => {
    let updated = [...panels]
    let changed = false

    // Rotation panel
    const hasRotate = updated.some(p => p.type === 'rotate')
    if (rotationPowered && !hasRotate) {
      updated.unshift({ id: 'rotate-panel', type: 'rotate', sequence: 1 })
      changed = true
    } else if (!rotationPowered && hasRotate) {
      updated = updated.filter(p => p.type !== 'rotate')
      changed = true
    }

    // Scoop panel
    const hasScoop = updated.some(p => p.type === 'scoop')
    if (canUseScoop && !hasScoop) {
      const moveIdx = updated.findIndex(p => p.type === 'move')
      updated.splice(moveIdx + 1, 0, { id: 'scoop-panel', type: 'scoop', sequence: moveIdx + 2 })
      changed = true
    } else if (!canUseScoop && hasScoop) {
      updated = updated.filter(p => p.type !== 'scoop')
      changed = true
    }

    // Laser
    const hasLaser = updated.some(p => p.type === 'fire_laser')
    if (laserPowered && !hasLaser) {
      updated.push({ id: `laser-${Date.now()}`, type: 'fire_laser', sequence: updated.length + 1, criticalTarget: 'shields' })
      changed = true
    } else if (!laserPowered && hasLaser) {
      if (weaponRangeVisibility.laser) toggleWeaponRange('laser')
      updated = updated.filter(p => p.type !== 'fire_laser')
      changed = true
    }

    // Railgun
    const hasRailgun = updated.some(p => p.type === 'fire_railgun')
    if (railgunPowered && !hasRailgun) {
      updated.push({ id: `railgun-${Date.now()}`, type: 'fire_railgun', sequence: updated.length + 1, criticalTarget: 'shields' })
      changed = true
    } else if (!railgunPowered && hasRailgun) {
      if (weaponRangeVisibility.railgun) toggleWeaponRange('railgun')
      updated = updated.filter(p => p.type !== 'fire_railgun')
      changed = true
    }

    // Missiles
    const hasMissiles = updated.some(p => p.type === 'fire_missiles')
    if (missilesPowered && !hasMissiles) {
      updated.push({ id: `missiles-${Date.now()}`, type: 'fire_missiles', sequence: updated.length + 1, criticalTarget: 'shields' })
      changed = true
    } else if (!missilesPowered && hasMissiles) {
      if (weaponRangeVisibility.missiles) toggleWeaponRange('missiles')
      updated = updated.filter(p => p.type !== 'fire_missiles')
      changed = true
    }

    if (changed) {
      setPanels(updated.map((p, i) => ({ ...p, sequence: i + 1 })))
    }
  }, [rotationPowered, canUseScoop, laserPowered, railgunPowered, missilesPowered, panels, weaponRangeVisibility, toggleWeaponRange])

  useEffect(() => {
    setTargetFacing(player.ship.facing)
    setActionType('coast')
    setBurnIntensity('soft')
    setSectorAdjustment(0)
  }, [player.id, player.ship.facing])

  useEffect(() => {
    setFacing(targetFacing)
  }, [targetFacing, setFacing])

  useEffect(() => {
    const activateScoop = actionType === 'coast' && !!scoopPowered
    setMovement({
      actionType,
      burnIntensity: actionType === 'burn' ? burnIntensity : undefined,
      sectorAdjustment,
      activateScoop,
    })
  }, [actionType, burnIntensity, sectorAdjustment, scoopPowered, setMovement])

  useEffect(() => {
    const facingChanged = targetFacing !== player.ship.facing

    const tacticalActions: TacticalAction[] = panels
      .filter((p): p is ActionPanel & { type: Exclude<PanelType, 'scoop'> } => {
        if (p.type === 'rotate' && !facingChanged) return false
        if (p.type === 'scoop') return false
        return true
      })
      .map((p, index) => {
        if (p.type === 'move' && actionType === 'well_transfer') {
          return {
            id: p.id,
            type: 'well_transfer' as TacticalActionType,
            sequence: index + 1,
            destinationWellId: availableWellTransfers.length > 0 ? availableWellTransfers[0].toWellId : undefined,
          }
        }
        return {
          id: p.id,
          type: p.type as TacticalActionType,
          sequence: index + 1,
          targetPlayerId: p.targetPlayerId,
          destinationWellId: p.destinationWellId,
          criticalTarget: p.criticalTarget,
        }
      })

    setTacticalSequence(tacticalActions)
  }, [panels, targetFacing, player.ship.facing, actionType, availableWellTransfers, setTacticalSequence])

  const canMovePanel = (id: string, direction: 'up' | 'down'): boolean => {
    const index = panels.findIndex(p => p.id === id)
    if (index < 0) return false
    const newIndex = direction === 'up' ? index - 1 : index + 1
    return newIndex >= 0 && newIndex < panels.length
  }

  const movePanel = (id: string, direction: 'up' | 'down') => {
    if (!canMovePanel(id, direction)) return
    const index = panels.findIndex(p => p.id === id)
    const newIndex = direction === 'up' ? index - 1 : index + 1
    const newPanels = [...panels]
    ;[newPanels[index], newPanels[newIndex]] = [newPanels[newIndex], newPanels[index]]
    setPanels(newPanels.map((p, i) => ({ ...p, sequence: i + 1 })))
  }

  const updateWeaponTarget = (id: string, targetPlayerId: string) => {
    setPanels(panels.map(p => (p.id === id ? { ...p, targetPlayerId } : p)))
  }

  const updateCriticalTarget = (id: string, criticalTarget: SubsystemType) => {
    setPanels(panels.map(p => (p.id === id ? { ...p, criticalTarget } : p)))
  }

  const validationErrors: string[] = []
  const weaponPanels = panels.filter(p => p.type === 'fire_laser' || p.type === 'fire_railgun' || p.type === 'fire_missiles')
  if (weaponPanels.some(p => !p.targetPlayerId)) {
    validationErrors.push('All weapons must have a target')
  }

  const getPanelColor = (type: PanelType): string => {
    if (type === 'rotate') return 'rgba(33, 150, 243, 0.08)'
    if (type === 'move') return 'rgba(76, 175, 80, 0.08)'
    if (type === 'scoop') return 'rgba(255, 193, 7, 0.08)'
    return 'rgba(244, 67, 54, 0.08)'
  }

  const getPanelTitle = (type: PanelType): string => {
    switch (type) {
      case 'rotate': return 'Orientation'
      case 'move': return 'Movement'
      case 'scoop': return 'Fuel Scoop'
      case 'fire_laser': return 'Laser'
      case 'fire_railgun': return 'Railgun'
      case 'fire_missiles': return 'Missiles'
    }
  }

  const missileStats = getMissileStats()
  const fuelTankCount = useMemo(() => {
    const allSlots = [...ship.loadout.forwardSlots, ...ship.loadout.sideSlots]
    return allSlots.filter(type => type === 'fuel_tank').length
  }, [ship.loadout])
  const fuelTankBonus = SUBSYSTEM_CONFIGS.fuel_tank.passiveEffect?.reactionMassBonus ?? 0
  const baseFuel = Math.min(ship.reactionMass, STARTING_REACTION_MASS)
  const extFuel = Math.max(0, ship.reactionMass - STARTING_REACTION_MASS)
  const extFuelMax = fuelTankCount * fuelTankBonus

  return (
    <Stack spacing={1}>
      {/* Ship Stats */}
      <Paper sx={{ px: 1.5, py: 1 }}>
        <Typography variant="caption" sx={{ fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'text.secondary', display: 'block', mb: 0.5 }}>
          Ship Status
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.55rem' }}>HULL</Typography>
              <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.6rem' }}>{player.ship.hitPoints}/{player.ship.maxHitPoints}</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: '2px', height: 6 }}>
              {Array.from({ length: player.ship.maxHitPoints }).map((_, i) => (
                <Box key={i} sx={{ flex: 1, bgcolor: i < player.ship.hitPoints ? (player.ship.hitPoints <= 3 ? '#f44336' : player.ship.hitPoints <= 5 ? '#ff9800' : '#4caf50') : 'rgba(255,255,255,0.1)', borderRadius: 0.25 }} />
              ))}
            </Box>
          </Box>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.55rem' }}>FUEL</Typography>
              <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.6rem' }}>{baseFuel}/{STARTING_REACTION_MASS}</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: '2px', height: 6 }}>
              {Array.from({ length: STARTING_REACTION_MASS }).map((_, i) => (
                <Box key={i} sx={{ flex: 1, bgcolor: i < baseFuel ? (baseFuel <= 2 ? '#f44336' : baseFuel <= 5 ? '#ff9800' : '#00ff00') : 'rgba(255,255,255,0.1)', borderRadius: 0.25 }} />
              ))}
            </Box>
          </Box>
          {fuelTankCount > 0 && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.55rem' }}>EXT FUEL</Typography>
                <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.6rem' }}>{extFuel}/{extFuelMax}</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: '2px', height: 6 }}>
                {Array.from({ length: extFuelMax }).map((_, i) => (
                  <Box key={i} sx={{ flex: 1, bgcolor: i < extFuel ? '#2196f3' : 'rgba(255,255,255,0.1)', borderRadius: 0.25 }} />
                ))}
              </Box>
            </Box>
          )}
          {missileSubsystems.map((missileSub, idx) => {
            const ammo = missileSub.ammo ?? 0
            return (
              <Box key={idx}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.55rem' }}>MISSILES{missileSubsystems.length > 1 ? ` #${idx + 1}` : ''}</Typography>
                  <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.6rem', color: ammo === 0 ? 'error.main' : 'inherit' }}>{ammo}/{missileStats.maxAmmo}</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: '2px', height: 6 }}>
                  {Array.from({ length: missileStats.maxAmmo }).map((_, i) => (
                    <Box key={i} sx={{ flex: 1, bgcolor: i < ammo ? '#00ff00' : 'rgba(255,255,255,0.1)', borderRadius: 0.25 }} />
                  ))}
                </Box>
              </Box>
            )
          })}
        </Box>
      </Paper>

      {/* Energy Panel */}
      <Box sx={{ overflow: 'visible' }}>
        <ShipEnergyPanel
          subsystems={pendingState.subsystems}
          reactor={pendingState.reactor}
          heat={pendingState.heat}
          hitPoints={player.ship.hitPoints}
          maxHitPoints={player.ship.maxHitPoints}
          dissipationCapacity={player.ship.dissipationCapacity}
          loadout={player.ship.loadout}
          onAllocateEnergy={allocateEnergy}
          onDeallocateEnergy={deallocateEnergy}
        />
      </Box>

      {/* Action Panels */}
      {panels.map(panel => (
        <Paper
          key={panel.id}
          elevation={1}
          sx={{ position: 'relative', bgcolor: getPanelColor(panel.type), border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.6rem' }}>{panel.sequence}</Typography>
            </Box>
            <Typography variant="caption" fontWeight="bold" sx={{ flex: 1, fontSize: '0.7rem' }}>{getPanelTitle(panel.type)}</Typography>
            <IconButton size="small" onClick={() => movePanel(panel.id, 'up')} disabled={!canMovePanel(panel.id, 'up')} sx={{ width: 16, height: 16, p: 0, '&:disabled': { opacity: 0.3 } }}>
              <ArrowUpward sx={{ fontSize: 10 }} />
            </IconButton>
            <IconButton size="small" onClick={() => movePanel(panel.id, 'down')} disabled={!canMovePanel(panel.id, 'down')} sx={{ width: 16, height: 16, p: 0, '&:disabled': { opacity: 0.3 } }}>
              <ArrowDownward sx={{ fontSize: 10 }} />
            </IconButton>
          </Box>

          <Box sx={{ p: 1 }}>
            {panel.type === 'rotate' && (
              <OrientationControl currentFacing={ship.facing} targetFacing={targetFacing} onFacingChange={setTargetFacing} rotationSubsystem={rotationSubsystem} />
            )}

            {panel.type === 'move' && (
              <MovementControl
                actionType={actionType}
                burnIntensity={burnIntensity}
                sectorAdjustment={sectorAdjustment}
                onActionTypeChange={setActionType}
                onBurnIntensityChange={setBurnIntensity}
                onSectorAdjustmentChange={setSectorAdjustment}
                enginesSubsystem={enginesSubsystem}
                reactionMass={ship.reactionMass}
                canTransfer={availableWellTransfers.length > 0}
                transferDestination={availableWellTransfers.length > 0 ? getWellName(availableWellTransfers[0].toWellId, GRAVITY_WELLS) : undefined}
                currentVelocity={currentVelocity}
              />
            )}

            {panel.type === 'scoop' && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CustomIcon icon="scoop" size={16} />
                <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>Auto-collecting fuel while coasting</Typography>
              </Box>
            )}

            {panel.type === 'fire_laser' && (() => {
              const moveAction = panels.find(p => p.type === 'move')
              const rotateAction = panels.find(p => p.type === 'rotate')
              const firesAfterMovement = !!(moveAction && panel.sequence > moveAction.sequence)
              const rotateBeforeMove = rotateAction && moveAction ? rotateAction.sequence < moveAction.sequence : true
              return (
                <LaserPanel
                  ship={ship} laserSubsystem={laserSubsystem} allPlayers={allPlayers} playerId={player.id}
                  targetPlayerId={panel.targetPlayerId} criticalTarget={panel.criticalTarget}
                  onTargetChange={(id) => updateWeaponTarget(panel.id, id)} onCriticalTargetChange={(s) => updateCriticalTarget(panel.id, s)}
                  rangeVisible={weaponRangeVisibility.laser} onToggleRange={() => toggleWeaponRange('laser')}
                  firesAfterMovement={firesAfterMovement} rotateBeforeMove={rotateBeforeMove}
                  targetFacing={targetFacing} actionType={actionType} burnIntensity={burnIntensity} sectorAdjustment={sectorAdjustment}
                />
              )
            })()}

            {panel.type === 'fire_railgun' && (() => {
              const moveAction = panels.find(p => p.type === 'move')
              const rotateAction = panels.find(p => p.type === 'rotate')
              const firesAfterMovement = !!(moveAction && panel.sequence > moveAction.sequence)
              const rotateBeforeMove = rotateAction && moveAction ? rotateAction.sequence < moveAction.sequence : true
              return (
                <RailgunPanel
                  ship={ship} railgunSubsystem={railgunSubsystem} allPlayers={allPlayers} playerId={player.id}
                  targetPlayerId={panel.targetPlayerId} criticalTarget={panel.criticalTarget}
                  onTargetChange={(id) => updateWeaponTarget(panel.id, id)} onCriticalTargetChange={(s) => updateCriticalTarget(panel.id, s)}
                  rangeVisible={weaponRangeVisibility.railgun} onToggleRange={() => toggleWeaponRange('railgun')}
                  firesAfterMovement={firesAfterMovement} rotateBeforeMove={rotateBeforeMove}
                  targetFacing={targetFacing} actionType={actionType} burnIntensity={burnIntensity} sectorAdjustment={sectorAdjustment}
                />
              )
            })()}

            {panel.type === 'fire_missiles' && (
              <MissilesPanel
                allPlayers={allPlayers} playerId={player.id}
                targetPlayerId={panel.targetPlayerId} criticalTarget={panel.criticalTarget}
                onTargetChange={(id) => updateWeaponTarget(panel.id, id)} onCriticalTargetChange={(s) => updateCriticalTarget(panel.id, s)}
                totalMissileAmmo={totalMissileAmmo}
              />
            )}
          </Box>
        </Paper>
      ))}

      {/* Turn Errors */}
      {turnErrors.length > 0 && (
        <Paper sx={{ p: 1, bgcolor: '#2a1515', border: '1px solid', borderColor: 'error.main' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: '#ff6b6b', fontWeight: 'bold' }}>Turn Failed</Typography>
            <Typography variant="caption" onClick={clearTurnErrors} sx={{ color: '#ffa8a8', cursor: 'pointer' }}>Dismiss</Typography>
          </Box>
          {turnErrors.map((error, i) => (
            <Typography key={i} variant="caption" sx={{ color: '#ffcccc', display: 'block', fontSize: '0.65rem' }}>• {error}</Typography>
          ))}
        </Paper>
      )}

      {/* Execute Button */}
      <ActionSummary validationErrors={validationErrors} warnings={[]} onExecute={executeTurn} />
    </Stack>
  )
}
