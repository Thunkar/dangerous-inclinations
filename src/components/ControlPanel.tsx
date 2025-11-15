import { Paper, Stack, Box, Typography } from '@mui/material'
import { useState, useEffect } from 'react'
import type { BurnIntensity, Facing, Player, ActionType } from '../types/game'
import { getSubsystem } from '../utils/subsystemHelpers'
import { useGame } from '../context/GameContext'
import { EnergyPanel } from './actions/EnergyPanel'
import { OrientationControl } from './actions/OrientationControl'
import { MovementControl } from './actions/MovementControl'
import { WeaponPanel } from './actions/WeaponPanel'
import { UtilityActions } from './actions/UtilityActions'
import { ActionSummary } from './actions/ActionSummary'
import { BURN_COSTS } from '../constants/rings'
import { STARTING_REACTION_MASS } from '../constants/rings'

interface ControlPanelProps {
  player: Player
  allPlayers: Player[]
}

export function ControlPanel({ player, allPlayers }: ControlPanelProps) {
  // Get everything from context
  const {
    weaponRangeVisibility,
    toggleWeaponRange,
    setFacing,
    setMovement,
    pendingState,
    executeTurn,
    allocateEnergy,
    deallocateEnergy,
    ventHeat,
  } = useGame()

  // State for all action components
  const [targetFacing, setTargetFacing] = useState<Facing>(player.ship.facing)
  const [actionType, setActionType] = useState<ActionType>('coast')
  const [burnIntensity, setBurnIntensity] = useState<BurnIntensity>('light')
  const [sectorAdjustment, setSectorAdjustment] = useState<number>(0)
  const [activateScoop, setActivateScoop] = useState(false)
  const [selectedTargets, setSelectedTargets] = useState({
    laser: '',
    railgun: '',
    missiles: '',
  })

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

  // Reset to defaults when player changes
  useEffect(() => {
    setTargetFacing(player.ship.facing)
    setActionType('coast')
    setBurnIntensity('light')
    setSectorAdjustment(0)
    setActivateScoop(false)
    setSelectedTargets({
      laser: '',
      railgun: '',
      missiles: '',
    })
  }, [player.id, player.ship.facing])

  // Update pending facing immediately when targetFacing changes (for railgun range visualization)
  useEffect(() => {
    setFacing(targetFacing)
  }, [targetFacing, setFacing])

  // Update pending movement whenever movement parameters change (for position prediction visualization)
  useEffect(() => {
    setMovement({
      actionType,
      burnIntensity: actionType === 'burn' ? burnIntensity : undefined,
      sectorAdjustment,
      activateScoop,
    })
  }, [actionType, burnIntensity, sectorAdjustment, activateScoop, setMovement])

  // Handle execute turn - pass all parameters to executeTurn
  const handleExecuteTurn = () => {
    // Build weapon targets object
    const weaponTargets: { laser?: string; railgun?: string; missiles?: string } = {}
    if (selectedTargets.laser) {
      weaponTargets.laser = selectedTargets.laser
    }
    if (selectedTargets.railgun) {
      weaponTargets.railgun = selectedTargets.railgun
    }
    if (selectedTargets.missiles) {
      weaponTargets.missiles = selectedTargets.missiles
    }

    // Execute turn with all parameters
    executeTurn(
      actionType,
      burnIntensity,
      sectorAdjustment,
      activateScoop,
      Object.keys(weaponTargets).length > 0 ? weaponTargets : undefined
    )
  }

  // Validation
  const needsRotation = targetFacing !== ship.facing
  const burnCost =
    actionType === 'burn' ? BURN_COSTS[burnIntensity] : { energy: 0, mass: 0, rings: 0 }

  // Check if subsystems are powered and available
  const hasRotation = rotationSubsystem?.isPowered && !rotationSubsystem.usedThisTurn
  const hasEnoughEngines = enginesSubsystem && enginesSubsystem.allocatedEnergy >= burnCost.energy
  const hasEnoughMass = ship.reactionMass >= burnCost.mass || actionType === 'coast'
  const canActivateScoop =
    actionType === 'coast' && scoopSubsystem?.isPowered && !scoopSubsystem.usedThisTurn

  // Validate weapons
  const weaponValidationErrors: string[] = []
  const weaponWarnings: string[] = []

  if (selectedTargets.laser) {
    if (!laserSubsystem?.isPowered || laserSubsystem.usedThisTurn) {
      weaponValidationErrors.push('Broadside Laser is not available')
    }
  }
  if (selectedTargets.railgun) {
    if (!railgunSubsystem?.isPowered || railgunSubsystem.usedThisTurn) {
      weaponValidationErrors.push('Railgun is not available')
    }

    // Railgun needs 4 energy to fire (overclocks at 4, min is 4)
    if (railgunSubsystem && railgunSubsystem.allocatedEnergy < 4) {
      weaponValidationErrors.push('Railgun requires 4 energy to fire (generates heat)')
    }

    // Recoil warning (not an error - recoil is allowed, just dangerous)
    const hasEnginesWithMass =
      enginesSubsystem && enginesSubsystem.allocatedEnergy >= 1 && ship.reactionMass >= 1
    if (!hasEnginesWithMass) {
      weaponWarnings.push(
        '⚠️ Railgun: Recoil will cause uncontrolled burn! (Need 1E in engines + 1M)'
      )
    }
  }
  if (selectedTargets.missiles) {
    if (!missilesSubsystem?.isPowered || missilesSubsystem.usedThisTurn) {
      weaponValidationErrors.push('Missiles are not available')
    }
  }

  const validationErrors: string[] = []
  if (actionType === 'burn' && !hasEnoughEngines) {
    validationErrors.push(`Need ${burnCost.energy} energy in engines for ${burnIntensity} burn`)
  }
  if (actionType === 'burn' && !hasEnoughMass) {
    validationErrors.push(`Need ${burnCost.mass} reaction mass for ${burnIntensity} burn`)
  }
  if (needsRotation && !hasRotation) {
    validationErrors.push(
      'Need powered maneuvering thrusters (not used this turn) to change orientation'
    )
  }
  if (activateScoop && !canActivateScoop) {
    validationErrors.push('Need powered fuel scoop (not used this turn) and must be coasting')
  }
  validationErrors.push(...weaponValidationErrors)

  const handleTargetSelect = (weaponType: 'laser' | 'railgun' | 'missiles', targetId: string) => {
    setSelectedTargets(prev => ({
      ...prev,
      [weaponType]: targetId,
    }))
  }

  return (
    <Stack spacing={2}>
      {/* Reaction Mass Gauge */}
      <Paper sx={{ px: 2, py: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', minWidth: 90 }}>
            REACTION MASS
          </Typography>
          <Box sx={{ flex: 1, position: 'relative', height: 12, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 1, overflow: 'hidden' }}>
            <Box
              sx={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${(ship.reactionMass / STARTING_REACTION_MASS) * 100}%`,
                bgcolor: ship.reactionMass <= 2
                  ? 'error.main'
                  : ship.reactionMass <= 5
                  ? 'warning.main'
                  : '#00ff00',
                transition: 'all 0.3s',
                boxShadow: ship.reactionMass <= 2
                  ? '0 0 6px rgba(255,0,0,0.6)'
                  : 'none',
              }}
            />
          </Box>
          <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.75rem', minWidth: 32 }}>
            {ship.reactionMass}/{STARTING_REACTION_MASS}
          </Typography>
        </Box>
      </Paper>

      {/* Ship Systems Panel - Energy Management */}
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

      {/* Action Controls */}
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <OrientationControl
            currentFacing={ship.facing}
            targetFacing={targetFacing}
            onFacingChange={setTargetFacing}
            rotationSubsystem={rotationSubsystem}
          />

          <MovementControl
            actionType={actionType}
            burnIntensity={burnIntensity}
            sectorAdjustment={sectorAdjustment}
            onActionTypeChange={setActionType}
            onBurnIntensityChange={setBurnIntensity}
            onSectorAdjustmentChange={setSectorAdjustment}
            enginesSubsystem={enginesSubsystem}
            reactionMass={ship.reactionMass}
          />

          <WeaponPanel
            laserSubsystem={laserSubsystem}
            railgunSubsystem={railgunSubsystem}
            missilesSubsystem={missilesSubsystem}
            currentPlayer={player}
            allPlayers={allPlayers}
            selectedTargets={selectedTargets}
            onTargetSelect={handleTargetSelect}
            showRanges={weaponRangeVisibility}
            onRangeToggle={toggleWeaponRange}
          />

          <UtilityActions
            actionType={actionType}
            activateScoop={activateScoop}
            onScoopToggle={setActivateScoop}
            scoopSubsystem={scoopSubsystem}
          />

          <ActionSummary
            validationErrors={validationErrors}
            warnings={weaponWarnings}
            onExecute={handleExecuteTurn}
          />
        </Stack>
      </Paper>
    </Stack>
  )
}
