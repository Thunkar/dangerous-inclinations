import { Paper, Stack, Box, Typography, IconButton, Button } from '@mui/material'
import { useState, useEffect, useMemo } from 'react'
import { ArrowUpward, ArrowDownward, Delete } from '@mui/icons-material'
import type { BurnIntensity, Facing, Player, ActionType } from '@dangerous-inclinations/engine'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { getSubsystem } from '@dangerous-inclinations/engine'
import { useGame, type TacticalAction, type TacticalActionType } from '../context/GameContext'
import { getAvailableWellTransfers, getWellName } from '@dangerous-inclinations/engine'
import { GRAVITY_WELLS, TRANSFER_POINTS } from '@dangerous-inclinations/engine'
import { ShipEnergyPanel } from './energy'
import { OrientationControl } from './actions/OrientationControl'
import { MovementControl } from './actions/MovementControl'
import { UtilityActions } from './actions/UtilityActions'
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

type PanelType = 'rotate' | 'move' | 'fire_laser' | 'fire_railgun' | 'fire_missiles'

interface ActionPanel {
  id: string
  type: PanelType
  sequence: number
  targetPlayerId?: string
  destinationWellId?: string
  criticalTarget?: SubsystemType // For weapon panels: subsystem to break on critical hit
}


export function ControlPanel({ player, allPlayers }: ControlPanelProps) {
  // Get everything from context
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

  // State for all action components
  const [targetFacing, setTargetFacing] = useState<Facing>(player.ship.facing)
  const [actionType, setActionType] = useState<ActionType>('coast')
  const [burnIntensity, setBurnIntensity] = useState<BurnIntensity>('soft')
  const [sectorAdjustment, setSectorAdjustment] = useState<number>(0)
  const [activateScoop, setActivateScoop] = useState(false)

  // Panels state - derived from tactical sequence
  const [panels, setPanels] = useState<ActionPanel[]>([])

  const { ship } = player

  // Use pending subsystems from context
  const subsystems = pendingState.subsystems

  // Get subsystems
  const enginesSubsystem = getSubsystem(subsystems, 'engines')
  const rotationSubsystem = getSubsystem(subsystems, 'rotation')
  const scoopSubsystem = getSubsystem(subsystems, 'scoop')
  const laserSubsystem = getSubsystem(subsystems, 'laser')
  const railgunSubsystem = getSubsystem(subsystems, 'railgun')
  const missilesSubsystem = getSubsystem(subsystems, 'missiles')

  // Get available well transfers (memoized to prevent infinite loops)
  const availableWellTransfers = useMemo(
    () => getAvailableWellTransfers(ship.wellId, ship.ring, ship.sector, TRANSFER_POINTS),
    [ship.wellId, ship.ring, ship.sector]
  )

  // Get current ring velocity for sector adjustment calculations
  const currentVelocity = useMemo(() => {
    const well = getGravityWell(ship.wellId)
    const ringConfig = well?.rings.find(r => r.ring === ship.ring)
    return ringConfig?.velocity || 1
  }, [ship.wellId, ship.ring])

  // Initialize tactical sequence with base actions when it's empty
  useEffect(() => {
    // Only initialize if tacticalSequence is empty (freshly reset)
    if (pendingState.tacticalSequence.length > 0) {
      return
    }

    // UI panels - always show rotation and movement
    const basePanels: ActionPanel[] = []

    basePanels.push({
      id: 'rotate-panel',
      type: 'rotate',
      sequence: 1,
    })

    basePanels.push({
      id: 'move-panel',
      type: 'move',
      sequence: 2,
    })

    setPanels(basePanels)

    // Tactical sequence - only include move initially (rotate added if facing changes)
    const tacticalActions: TacticalAction[] = [
      {
        id: 'move-panel',
        type: 'move',
        sequence: 1,
      },
    ]
    setTacticalSequence(tacticalActions)
  }, [pendingState.tacticalSequence.length, setTacticalSequence]) // Re-run when length changes from 0

  // Reset to defaults when player changes
  useEffect(() => {
    setTargetFacing(player.ship.facing)
    setActionType('coast')
    setBurnIntensity('soft')
    setSectorAdjustment(0)
    setActivateScoop(false)
  }, [player.id, player.ship.facing])

  // Update pending facing immediately when targetFacing changes
  useEffect(() => {
    setFacing(targetFacing)
  }, [targetFacing, setFacing])

  // Update pending movement whenever movement parameters change
  useEffect(() => {
    setMovement({
      actionType,
      burnIntensity: actionType === 'burn' ? burnIntensity : undefined,
      sectorAdjustment,
      activateScoop,
    })
  }, [actionType, burnIntensity, sectorAdjustment, activateScoop, setMovement])

  // Sync tactical sequence from panels, excluding rotate if facing hasn't changed
  useEffect(() => {
    const facingChanged = targetFacing !== player.ship.facing

    const tacticalActions: TacticalAction[] = panels
      .filter(p => {
        // Exclude rotation action if facing hasn't changed
        if (p.type === 'rotate' && !facingChanged) {
          return false
        }
        return true
      })
      .map((p, index) => {
        // If this is a move panel and actionType is well_transfer, convert to well_transfer action
        if (p.type === 'move' && actionType === 'well_transfer') {
          return {
            id: p.id,
            type: 'well_transfer' as TacticalActionType,
            sequence: index + 1,
            destinationWellId:
              availableWellTransfers.length > 0 ? availableWellTransfers[0].toWellId : undefined,
          }
        }

        return {
          id: p.id,
          type: p.type,
          sequence: index + 1, // Renumber sequentially
          targetPlayerId: p.targetPlayerId,
          destinationWellId: p.destinationWellId,
          criticalTarget: p.criticalTarget,
        }
      })

    setTacticalSequence(tacticalActions)
  }, [
    panels,
    targetFacing,
    player.ship.facing,
    actionType,
    availableWellTransfers,
    setTacticalSequence,
  ])

  const canMovePanel = (id: string, direction: 'up' | 'down'): boolean => {
    const index = panels.findIndex(p => p.id === id)
    if (index < 0) return false

    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= panels.length) return false

    return true
  }

  const movePanel = (id: string, direction: 'up' | 'down') => {
    if (!canMovePanel(id, direction)) return

    const index = panels.findIndex(p => p.id === id)
    if (index < 0) return

    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= panels.length) return

    const newPanels = [...panels]
    ;[newPanels[index], newPanels[newIndex]] = [newPanels[newIndex], newPanels[index]]

    // Renumber and apply
    const renumbered = newPanels.map((p, i) => ({ ...p, sequence: i + 1 }))
    setPanels(renumbered)
    // Tactical sequence will be synced by the effect
  }

  const addWeapon = (weaponType: 'fire_laser' | 'fire_railgun' | 'fire_missiles') => {
    const newPanel: ActionPanel = {
      id: `${weaponType}-${Date.now()}`,
      type: weaponType,
      sequence: panels.length + 1,
      criticalTarget: 'shields', // Default to shields
    }
    const newPanels = [...panels, newPanel]
    setPanels(newPanels)
  }

  const removeWeapon = (id: string) => {
    // Find the panel being removed
    const panelToRemove = panels.find(p => p.id === id)

    // If it's a weapon panel, turn off its range visualization
    if (panelToRemove) {
      if (panelToRemove.type === 'fire_laser' && weaponRangeVisibility.laser) {
        toggleWeaponRange('laser')
      } else if (panelToRemove.type === 'fire_railgun' && weaponRangeVisibility.railgun) {
        toggleWeaponRange('railgun')
      } else if (panelToRemove.type === 'fire_missiles' && weaponRangeVisibility.missiles) {
        toggleWeaponRange('missiles')
      }
    }

    const filtered = panels.filter(p => p.id !== id)
    const renumbered = filtered.map((p, i) => ({ ...p, sequence: i + 1 }))
    setPanels(renumbered)
  }

  const updateWeaponTarget = (id: string, targetPlayerId: string) => {
    const updated = panels.map(p => (p.id === id ? { ...p, targetPlayerId } : p))
    setPanels(updated)
  }

  const updateCriticalTarget = (id: string, criticalTarget: SubsystemType) => {
    const updated = panels.map(p => (p.id === id ? { ...p, criticalTarget } : p))
    setPanels(updated)
  }

  const handleExecuteTurn = () => {
    executeTurn()
  }

  // Validation
  const validationErrors: string[] = []
  if (panels.length === 0) {
    validationErrors.push('No actions to execute')
  }

  const weaponPanels = panels.filter(
    p => p.type === 'fire_laser' || p.type === 'fire_railgun' || p.type === 'fire_missiles'
  )
  const weaponPanelsWithoutTargets = weaponPanels.filter(p => !p.targetPlayerId)
  if (weaponPanelsWithoutTargets.length > 0) {
    validationErrors.push('All weapon actions must have a target selected')
  }

  const getPanelColor = (type: PanelType): string => {
    if (type === 'rotate') return 'rgba(33, 150, 243, 0.1)' // Blue
    if (type === 'move') return 'rgba(76, 175, 80, 0.1)' // Green
    return 'rgba(244, 67, 54, 0.1)' // Red for weapons
  }

  const isWeaponPanel = (type: PanelType): boolean => {
    return type === 'fire_laser' || type === 'fire_railgun' || type === 'fire_missiles'
  }

  const isRemovablePanel = (type: PanelType): boolean => {
    return type === 'fire_laser' || type === 'fire_railgun' || type === 'fire_missiles'
  }

  // Enemy players for targeting
  // const enemyPlayers = allPlayers.filter(p => p.id !== player.id && p.ship.hitPoints > 0)

  // Check which weapons can be added
  const hasLaser = panels.some(p => p.type === 'fire_laser')
  const hasRailgun = panels.some(p => p.type === 'fire_railgun')
  const hasMissiles = panels.some(p => p.type === 'fire_missiles')

  const canAddLaser = !hasLaser && laserSubsystem?.isPowered && !laserSubsystem.usedThisTurn
  const canAddRailgun = !hasRailgun && railgunSubsystem?.isPowered && !railgunSubsystem.usedThisTurn

  // Get all missile subsystems (player can have multiple)
  const missileSubsystems = useMemo(
    () => ship.subsystems.filter(s => s.type === 'missiles'),
    [ship.subsystems]
  )
  const totalMissileAmmo = missileSubsystems.reduce((sum, s) => sum + (s.ammo ?? 0), 0)
  const missileStats = getMissileStats()
  const canAddMissiles =
    !hasMissiles &&
    missilesSubsystem?.isPowered &&
    !missilesSubsystem.usedThisTurn &&
    totalMissileAmmo > 0

  // Calculate fuel tank stats for reaction mass display
  const fuelTankCount = useMemo(() => {
    const allSlots = [...ship.loadout.forwardSlots, ...ship.loadout.sideSlots]
    return allSlots.filter(type => type === 'fuel_tank').length
  }, [ship.loadout])
  const fuelTankBonus = SUBSYSTEM_CONFIGS.fuel_tank.passiveEffect?.reactionMassBonus ?? 0

  // Current base fuel and external fuel
  const baseFuel = Math.min(ship.reactionMass, STARTING_REACTION_MASS)
  const extFuel = Math.max(0, ship.reactionMass - STARTING_REACTION_MASS)
  const extFuelMax = fuelTankCount * fuelTankBonus

  return (
    <Stack spacing={2}>
      {/* Ship Stats Section - Hull, Fuel, Missiles */}
      <Paper sx={{ px: 2, py: 1.5 }}>
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.6rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'text.secondary',
            display: 'block',
            mb: 1,
          }}
        >
          Ship Status
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Hull Bar with ticks */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                HULL
              </Typography>
              <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.65rem' }}>
                {player.ship.hitPoints}/{player.ship.maxHitPoints}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: '3px', height: 10 }}>
              {Array.from({ length: player.ship.maxHitPoints }).map((_, i) => (
                <Box
                  key={i}
                  sx={{
                    flex: 1,
                    height: '100%',
                    bgcolor:
                      i < player.ship.hitPoints
                        ? player.ship.hitPoints <= 3
                          ? '#f44336'
                          : player.ship.hitPoints <= 5
                            ? '#ff9800'
                            : '#4caf50'
                        : 'rgba(255,255,255,0.1)',
                    borderRadius: 0.5,
                    transition: 'all 0.3s',
                  }}
                />
              ))}
            </Box>
          </Box>

          {/* Fuel (Base) Bar with ticks */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                FUEL (BASE)
              </Typography>
              <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.65rem' }}>
                {baseFuel}/{STARTING_REACTION_MASS}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: '3px', height: 10 }}>
              {Array.from({ length: STARTING_REACTION_MASS }).map((_, i) => (
                <Box
                  key={i}
                  sx={{
                    flex: 1,
                    height: '100%',
                    bgcolor:
                      i < baseFuel
                        ? baseFuel <= 2
                          ? '#f44336'
                          : baseFuel <= 5
                            ? '#ff9800'
                            : '#00ff00'
                        : 'rgba(255,255,255,0.1)',
                    borderRadius: 0.5,
                    transition: 'all 0.3s',
                  }}
                />
              ))}
            </Box>
          </Box>

          {/* External Fuel Tanks with ticks */}
          {fuelTankCount > 0 && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                  FUEL (EXT x{fuelTankCount})
                </Typography>
                <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.65rem' }}>
                  {extFuel}/{extFuelMax}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: '3px', height: 10 }}>
                {Array.from({ length: extFuelMax }).map((_, i) => (
                  <Box
                    key={i}
                    sx={{
                      flex: 1,
                      height: '100%',
                      bgcolor: i < extFuel ? '#2196f3' : 'rgba(255,255,255,0.1)',
                      borderRadius: 0.5,
                      transition: 'all 0.3s',
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Missile Inventory with ticks */}
          {missileSubsystems.map((missileSub, idx) => {
            const ammo = missileSub.ammo ?? 0
            return (
              <Box key={idx}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                    MISSILES{missileSubsystems.length > 1 ? ` #${idx + 1}` : ''}
                  </Typography>
                  <Typography
                    variant="caption"
                    fontWeight="bold"
                    sx={{ fontSize: '0.65rem', color: ammo === 0 ? 'error.main' : 'inherit' }}
                  >
                    {ammo}/{missileStats.maxAmmo}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: '3px', height: 10 }}>
                  {Array.from({ length: missileStats.maxAmmo }).map((_, i) => (
                    <Box
                      key={i}
                      sx={{
                        flex: 1,
                        height: '100%',
                        bgcolor: i < ammo ? '#00ff00' : 'rgba(255,255,255,0.1)',
                        borderRadius: 0.5,
                        transition: 'all 0.3s',
                        boxShadow: i < ammo ? '0 0 4px rgba(0,255,0,0.3)' : 'none',
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )
          })}
        </Box>
      </Paper>

      {/* Ship Systems Panel - Energy Management */}
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

      {/* Reorderable Action Panels */}
      {panels.map(panel => (
        <Paper
          key={panel.id}
          elevation={2}
          sx={{
            position: 'relative',
            bgcolor: getPanelColor(panel.type),
            border: '2px solid rgba(255,255,255,0.15)',
            overflow: 'visible',
          }}
        >
          {/* Sequence Badge - Top Left */}
          <Box
            sx={{
              position: 'absolute',
              left: 4,
              top: 4,
              width: 20,
              height: 20,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              border: '1px solid',
              borderColor: 'background.paper',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 1,
              zIndex: 10,
            }}
          >
            <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.65rem' }}>
              {panel.sequence}
            </Typography>
          </Box>

          {/* Reorder Controls - Top Right */}
          <Box
            sx={{
              position: 'absolute',
              right: 4,
              top: 4,
              display: 'flex',
              gap: 0.25,
              zIndex: 10,
            }}
          >
            <IconButton
              size="small"
              onClick={() => movePanel(panel.id, 'up')}
              disabled={!canMovePanel(panel.id, 'up')}
              sx={{
                bgcolor: 'background.paper',
                width: 20,
                height: 20,
                minWidth: 20,
                padding: 0,
                '&:hover': { bgcolor: 'primary.main' },
                '&:disabled': { opacity: 0.3 },
              }}
            >
              <ArrowUpward sx={{ fontSize: 12 }} />
            </IconButton>

            <IconButton
              size="small"
              onClick={() => movePanel(panel.id, 'down')}
              disabled={!canMovePanel(panel.id, 'down')}
              sx={{
                bgcolor: 'background.paper',
                width: 20,
                height: 20,
                minWidth: 20,
                padding: 0,
                '&:hover': { bgcolor: 'primary.main' },
                '&:disabled': { opacity: 0.3 },
              }}
            >
              <ArrowDownward sx={{ fontSize: 12 }} />
            </IconButton>
          </Box>

          {/* Delete Button - Bottom Right (only for weapons and well transfers) */}
          {isRemovablePanel(panel.type) && (
            <IconButton
              size="small"
              onClick={() => removeWeapon(panel.id)}
              sx={{
                position: 'absolute',
                right: 4,
                bottom: 4,
                bgcolor: 'background.paper',
                width: 20,
                height: 20,
                minWidth: 20,
                padding: 0,
                '&:hover': { bgcolor: 'error.main' },
                zIndex: 10,
              }}
            >
              <Delete sx={{ fontSize: 12 }} />
            </IconButton>
          )}

          {/* Panel Content */}
          <Box sx={{ p: 1.5, pt: 3.5, pb: isWeaponPanel(panel.type) ? 4 : 1.5 }}>
            {panel.type === 'rotate' && (
              <OrientationControl
                currentFacing={ship.facing}
                targetFacing={targetFacing}
                onFacingChange={setTargetFacing}
                rotationSubsystem={rotationSubsystem}
              />
            )}

            {panel.type === 'move' && (
              <Stack spacing={1.5}>
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
                  transferDestination={
                    availableWellTransfers.length > 0
                      ? getWellName(availableWellTransfers[0].toWellId, GRAVITY_WELLS)
                      : undefined
                  }
                  currentVelocity={currentVelocity}
                />
                {actionType === 'coast' && (
                  <UtilityActions
                    actionType={actionType}
                    activateScoop={activateScoop}
                    onScoopToggle={setActivateScoop}
                    scoopSubsystem={scoopSubsystem}
                  />
                )}
              </Stack>
            )}

            {panel.type === 'fire_laser' && (() => {
              const moveAction = panels.find(p => p.type === 'move')
              const rotateAction = panels.find(p => p.type === 'rotate')
              const firesAfterMovement = !!(moveAction && panel.sequence > moveAction.sequence)
              const rotateBeforeMove = rotateAction && moveAction ? rotateAction.sequence < moveAction.sequence : true

              return (
                <LaserPanel
                  ship={ship}
                  laserSubsystem={laserSubsystem}
                  allPlayers={allPlayers}
                  playerId={player.id}
                  targetPlayerId={panel.targetPlayerId}
                  criticalTarget={panel.criticalTarget}
                  onTargetChange={(targetId) => updateWeaponTarget(panel.id, targetId)}
                  onCriticalTargetChange={(subsystem) => updateCriticalTarget(panel.id, subsystem)}
                  rangeVisible={weaponRangeVisibility.laser}
                  onToggleRange={() => toggleWeaponRange('laser')}
                  firesAfterMovement={firesAfterMovement}
                  rotateBeforeMove={rotateBeforeMove}
                  targetFacing={targetFacing}
                  actionType={actionType}
                  burnIntensity={burnIntensity}
                  sectorAdjustment={sectorAdjustment}
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
                  ship={ship}
                  railgunSubsystem={railgunSubsystem}
                  allPlayers={allPlayers}
                  playerId={player.id}
                  targetPlayerId={panel.targetPlayerId}
                  criticalTarget={panel.criticalTarget}
                  onTargetChange={(targetId) => updateWeaponTarget(panel.id, targetId)}
                  onCriticalTargetChange={(subsystem) => updateCriticalTarget(panel.id, subsystem)}
                  rangeVisible={weaponRangeVisibility.railgun}
                  onToggleRange={() => toggleWeaponRange('railgun')}
                  firesAfterMovement={firesAfterMovement}
                  rotateBeforeMove={rotateBeforeMove}
                  targetFacing={targetFacing}
                  actionType={actionType}
                  burnIntensity={burnIntensity}
                  sectorAdjustment={sectorAdjustment}
                />
              )
            })()}

            {panel.type === 'fire_missiles' && (
              <MissilesPanel
                allPlayers={allPlayers}
                playerId={player.id}
                targetPlayerId={panel.targetPlayerId}
                criticalTarget={panel.criticalTarget}
                onTargetChange={(targetId) => updateWeaponTarget(panel.id, targetId)}
                onCriticalTargetChange={(subsystem) => updateCriticalTarget(panel.id, subsystem)}
                totalMissileAmmo={totalMissileAmmo}
              />
            )}
          </Box>
        </Paper>
      ))}

      {/* Add Weapon Buttons */}
      {(canAddLaser || canAddRailgun || canAddMissiles) && (
        <Paper sx={{ p: 2 }}>
          <Typography
            variant="caption"
            fontWeight="bold"
            gutterBottom
            sx={{ display: 'block', mb: 1 }}
          >
            Add Weapon Fire:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {canAddLaser && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<CustomIcon icon="laser" size={16} />}
                onClick={() => addWeapon('fire_laser')}
                sx={{ fontSize: '0.75rem' }}
              >
                Broadside Laser
              </Button>
            )}
            {canAddRailgun && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<CustomIcon icon="railgun" size={16} />}
                onClick={() => addWeapon('fire_railgun')}
                sx={{ fontSize: '0.75rem' }}
              >
                Railgun
              </Button>
            )}
            {canAddMissiles && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<CustomIcon icon="missiles" size={16} />}
                onClick={() => addWeapon('fire_missiles')}
                sx={{ fontSize: '0.75rem' }}
              >
                Missiles
              </Button>
            )}
          </Box>
        </Paper>
      )}

      {/* Turn Execution Errors */}
      {turnErrors.length > 0 && (
        <Paper sx={{ p: 2, bgcolor: '#2a1515', border: '2px solid', borderColor: 'error.main' }}>
          <Stack spacing={1}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ color: '#ff6b6b', fontWeight: 'bold' }}>
                Turn Execution Failed
              </Typography>
              <Button size="small" onClick={clearTurnErrors} sx={{ color: '#ffa8a8' }}>
                Dismiss
              </Button>
            </Box>
            {turnErrors.map((error, index) => (
              <Typography key={index} variant="body2" sx={{ color: '#ffcccc', pl: 1 }}>
                • {error}
              </Typography>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Execute Turn Button */}
      <Paper sx={{ p: 2 }}>
        <ActionSummary
          validationErrors={validationErrors}
          warnings={[]}
          onExecute={handleExecuteTurn}
        />
      </Paper>
    </Stack>
  )
}
