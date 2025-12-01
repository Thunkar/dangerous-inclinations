import { Paper, Stack, Box, Typography, IconButton, Button, Tooltip } from '@mui/material'
import { useState, useEffect, useMemo } from 'react'
import { ArrowUpward, ArrowDownward, Delete, Visibility, VisibilityOff } from '@mui/icons-material'
import type { BurnIntensity, Facing, Player, ActionType } from '../types/game'
import { getSubsystem } from '../utils/subsystemHelpers'
import { getSubsystemConfig } from '../types/subsystems'
import { calculateFiringSolutions } from '../utils/weaponRange'
import { calculatePostMovementPosition } from '../utils/tacticalSequence'
import { useGame, type TacticalAction, type TacticalActionType } from '../context/GameContext'
import { getAvailableWellTransfers, getWellName } from '../utils/transferPoints'
import { EnergyPanel } from './actions/EnergyPanel'
import { OrientationControl } from './actions/OrientationControl'
import { MovementControl } from './actions/MovementControl'
import { UtilityActions } from './actions/UtilityActions'
import { ActionSummary } from './actions/ActionSummary'
import { STARTING_REACTION_MASS } from '../constants/rings'
import { CustomIcon } from './CustomIcon'
import { MISSILE_CONFIG } from '../game-logic/missiles'

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
}

export function ControlPanel({ player, allPlayers }: ControlPanelProps) {
  // Get everything from context
  const {
    gameState,
    setFacing,
    setMovement,
    pendingState,
    executeTurn,
    allocateEnergy,
    deallocateEnergy,
    ventHeat,
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
    () => getAvailableWellTransfers(ship.wellId, ship.ring, ship.sector, gameState.transferPoints),
    [ship.wellId, ship.ring, ship.sector, gameState.transferPoints]
  )

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
  const canAddMissiles =
    !hasMissiles &&
    missilesSubsystem?.isPowered &&
    !missilesSubsystem.usedThisTurn &&
    ship.missileInventory > 0

  return (
    <Stack spacing={2}>
      {/* Reaction Mass Gauge */}
      <Paper sx={{ px: 2, py: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: '0.65rem', minWidth: 90 }}
          >
            REACTION MASS
          </Typography>
          <Box
            sx={{
              flex: 1,
              position: 'relative',
              height: 12,
              bgcolor: 'rgba(0,0,0,0.3)',
              borderRadius: 1,
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${(ship.reactionMass / STARTING_REACTION_MASS) * 100}%`,
                bgcolor:
                  ship.reactionMass <= 2
                    ? 'error.main'
                    : ship.reactionMass <= 5
                      ? 'warning.main'
                      : '#00ff00',
                transition: 'all 0.3s',
                boxShadow: ship.reactionMass <= 2 ? '0 0 6px rgba(255,0,0,0.6)' : 'none',
              }}
            />
          </Box>
          <Typography
            variant="caption"
            fontWeight="bold"
            sx={{ fontSize: '0.75rem', minWidth: 32 }}
          >
            {ship.reactionMass}/{STARTING_REACTION_MASS}
          </Typography>
        </Box>
      </Paper>

      {/* Missile Inventory */}
      <Paper sx={{ px: 2, py: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: '0.65rem', minWidth: 90 }}
          >
            MISSILES
          </Typography>
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              gap: 0.5,
            }}
          >
            {Array.from({ length: MISSILE_CONFIG.MAX_INVENTORY }).map((_, i) => (
              <Box
                key={i}
                sx={{
                  flex: 1,
                  height: 12,
                  bgcolor: i < ship.missileInventory ? '#00ff00' : 'rgba(0,0,0,0.3)',
                  borderRadius: 0.5,
                  transition: 'all 0.3s',
                  boxShadow: i < ship.missileInventory ? '0 0 4px rgba(0,255,0,0.4)' : 'none',
                }}
              />
            ))}
          </Box>
          <Typography
            variant="caption"
            fontWeight="bold"
            sx={{
              fontSize: '0.75rem',
              minWidth: 32,
              color: ship.missileInventory === 0 ? 'error.main' : 'inherit',
            }}
          >
            {ship.missileInventory}/{MISSILE_CONFIG.MAX_INVENTORY}
          </Typography>
        </Box>
      </Paper>

      {/* Ship Systems Panel - Energy Management (Always First) */}
      <Box sx={{ overflow: 'visible' }}>
        <EnergyPanel
          subsystems={pendingState.subsystems}
          reactor={pendingState.reactor}
          heat={pendingState.heat}
          hitPoints={player.ship.hitPoints}
          maxHitPoints={player.ship.maxHitPoints}
          onAllocateEnergy={allocateEnergy}
          onDeallocateEnergy={deallocateEnergy}
          onVentHeat={ventHeat}
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
                      ? getWellName(availableWellTransfers[0].toWellId, gameState.gravityWells)
                      : undefined
                  }
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

            {panel.type === 'fire_laser' &&
              (() => {
                const subsystemConfig = laserSubsystem
                  ? getSubsystemConfig(laserSubsystem.type)
                  : null
                const weaponStats = subsystemConfig?.weaponStats

                // Check if this weapon fires after movement
                const moveAction = panels.find(p => p.type === 'move')
                const firesAfterMovement = moveAction && panel.sequence > moveAction.sequence

                // Calculate ship position for range calculations
                let shipForRangeCalc = ship
                if (firesAfterMovement && actionType === 'burn') {
                  shipForRangeCalc = calculatePostMovementPosition(ship, targetFacing, {
                    actionType,
                    burnIntensity,
                    sectorAdjustment,
                  })
                } else if (firesAfterMovement && actionType === 'coast') {
                  shipForRangeCalc = calculatePostMovementPosition(ship, targetFacing, {
                    actionType: 'coast',
                    sectorAdjustment: 0,
                  })
                }

                const firingSolutions = weaponStats
                  ? calculateFiringSolutions(weaponStats, shipForRangeCalc, allPlayers, player.id)
                  : []
                const inRangeTargets = firingSolutions.filter(fs => fs.inRange)

                return (
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: '8px',
                      bgcolor: 'background.paper',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mb: 1.5,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <CustomIcon icon="laser" size={20} />
                        <Typography variant="body2" fontWeight="bold">
                          Broadside Laser
                        </Typography>
                      </Box>
                      <Tooltip title={weaponRangeVisibility.laser ? 'Hide Range' : 'Show Range'}>
                        <IconButton
                          size="small"
                          onClick={() => toggleWeaponRange('laser')}
                          sx={{
                            padding: '4px',
                            color: weaponRangeVisibility.laser ? 'primary.main' : 'text.secondary',
                          }}
                        >
                          {weaponRangeVisibility.laser ? (
                            <Visibility sx={{ fontSize: 16 }} />
                          ) : (
                            <VisibilityOff sx={{ fontSize: 16 }} />
                          )}
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <select
                      value={panel.targetPlayerId || ''}
                      onChange={e => updateWeaponTarget(panel.id, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        border: panel.targetPlayerId
                          ? '2px solid rgba(76, 175, 80, 0.5)'
                          : '2px solid rgba(244, 67, 54, 0.5)',
                        backgroundColor: 'rgba(0,0,0,0.3)',
                        color: 'white',
                        fontSize: '0.875rem',
                      }}
                    >
                      <option value="" style={{ backgroundColor: '#1a1a1a' }}>
                        Select Target ({inRangeTargets.length} in range)
                      </option>
                      {inRangeTargets.map(solution => (
                        <option
                          key={solution.targetPlayer.id}
                          value={solution.targetPlayer.id}
                          style={{ backgroundColor: '#1a1a1a' }}
                        >
                          {solution.targetPlayer.name} (HP: {solution.targetPlayer.ship.hitPoints}/
                          {solution.targetPlayer.ship.maxHitPoints})
                        </option>
                      ))}
                    </select>
                  </Box>
                )
              })()}

            {panel.type === 'fire_railgun' &&
              (() => {
                const subsystemConfig = railgunSubsystem
                  ? getSubsystemConfig(railgunSubsystem.type)
                  : null
                const weaponStats = subsystemConfig?.weaponStats

                // Check if this weapon fires after movement
                const moveAction = panels.find(p => p.type === 'move')
                const firesAfterMovement = moveAction && panel.sequence > moveAction.sequence

                // Calculate ship position for range calculations
                let shipForRangeCalc = ship
                if (firesAfterMovement && actionType === 'burn') {
                  shipForRangeCalc = calculatePostMovementPosition(ship, targetFacing, {
                    actionType,
                    burnIntensity,
                    sectorAdjustment,
                  })
                } else if (firesAfterMovement && actionType === 'coast') {
                  shipForRangeCalc = calculatePostMovementPosition(ship, targetFacing, {
                    actionType: 'coast',
                    sectorAdjustment: 0,
                  })
                }

                const firingSolutions = weaponStats
                  ? calculateFiringSolutions(weaponStats, shipForRangeCalc, allPlayers, player.id)
                  : []
                const inRangeTargets = firingSolutions.filter(fs => fs.inRange)

                return (
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: '8px',
                      bgcolor: 'background.paper',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mb: 1.5,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <CustomIcon icon="railgun" size={20} />
                        <Typography variant="body2" fontWeight="bold">
                          Railgun
                        </Typography>
                      </Box>
                      <Tooltip title={weaponRangeVisibility.railgun ? 'Hide Range' : 'Show Range'}>
                        <IconButton
                          size="small"
                          onClick={() => toggleWeaponRange('railgun')}
                          sx={{
                            padding: '4px',
                            color: weaponRangeVisibility.railgun
                              ? 'primary.main'
                              : 'text.secondary',
                          }}
                        >
                          {weaponRangeVisibility.railgun ? (
                            <Visibility sx={{ fontSize: 16 }} />
                          ) : (
                            <VisibilityOff sx={{ fontSize: 16 }} />
                          )}
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <select
                      value={panel.targetPlayerId || ''}
                      onChange={e => updateWeaponTarget(panel.id, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        border: panel.targetPlayerId
                          ? '2px solid rgba(76, 175, 80, 0.5)'
                          : '2px solid rgba(244, 67, 54, 0.5)',
                        backgroundColor: 'rgba(0,0,0,0.3)',
                        color: 'white',
                        fontSize: '0.875rem',
                      }}
                    >
                      <option value="" style={{ backgroundColor: '#1a1a1a' }}>
                        Select Target ({inRangeTargets.length} in range)
                      </option>
                      {inRangeTargets.map(solution => (
                        <option
                          key={solution.targetPlayer.id}
                          value={solution.targetPlayer.id}
                          style={{ backgroundColor: '#1a1a1a' }}
                        >
                          {solution.targetPlayer.name} (HP: {solution.targetPlayer.ship.hitPoints}/
                          {solution.targetPlayer.ship.maxHitPoints})
                        </option>
                      ))}
                    </select>
                  </Box>
                )
              })()}

            {panel.type === 'fire_missiles' &&
              (() => {
                // Missiles can target ANY player (they're self-propelled)
                const validTargets = allPlayers.filter(p => p.id !== player.id)

                return (
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: '8px',
                      bgcolor: 'background.paper',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mb: 1.5,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <CustomIcon icon="missiles" size={20} />
                        <Typography variant="body2" fontWeight="bold">
                          Missiles
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          ({ship.missileInventory} remaining)
                        </Typography>
                      </Box>
                    </Box>
                    <select
                      value={panel.targetPlayerId || ''}
                      onChange={e => updateWeaponTarget(panel.id, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        border: panel.targetPlayerId
                          ? '2px solid rgba(76, 175, 80, 0.5)'
                          : '2px solid rgba(244, 67, 54, 0.5)',
                        backgroundColor: 'rgba(0,0,0,0.3)',
                        color: 'white',
                        fontSize: '0.875rem',
                      }}
                    >
                      <option value="" style={{ backgroundColor: '#1a1a1a' }}>
                        Select Target ({validTargets.length} available)
                      </option>
                      {validTargets.map(target => (
                        <option
                          key={target.id}
                          value={target.id}
                          style={{ backgroundColor: '#1a1a1a' }}
                        >
                          {target.name} (HP: {target.ship.hitPoints}/{target.ship.maxHitPoints})
                        </option>
                      ))}
                    </select>
                  </Box>
                )
              })()}
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
