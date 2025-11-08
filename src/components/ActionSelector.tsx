import {
  Box,
  Typography,
  Paper,
  Button,
  ButtonGroup,
  FormControlLabel,
  Checkbox,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material'
import { useState, useEffect } from 'react'
import type { PlayerAction, BurnIntensity, Facing, Player, WeaponFiring } from '../types/game'
import { BURN_COSTS, getRingConfig } from '../constants/rings'
import { WEAPONS, calculateWeaponRange } from '../constants/weapons'
import { getSubsystem } from '../utils/subsystemHelpers'

interface ActionSelectorProps {
  player: Player
  allPlayers: Player[]
  onActionSelect: (action: PlayerAction) => void
  onExecuteTurn: () => void
}

export function ActionSelector({
  player,
  allPlayers,
  onActionSelect,
  onExecuteTurn,
}: ActionSelectorProps) {
  const [actionType, setActionType] = useState<'coast' | 'burn'>('coast')
  const [burnDirection, setBurnDirection] = useState<Facing>('prograde')
  const [burnIntensity, setBurnIntensity] = useState<BurnIntensity>('standard')
  const [activateScoop, setActivateScoop] = useState(false)
  const [selectedWeapon, setSelectedWeapon] = useState<string>('laser')
  const [selectedTarget, setSelectedTarget] = useState<string>('')

  const { ship } = player

  // Use pending subsystems if available (during planning phase), otherwise use committed subsystems
  const subsystems = ship.pendingSubsystems || ship.subsystems

  // Get subsystems
  const enginesSubsystem = getSubsystem(subsystems, 'engines')
  const rotationSubsystem = getSubsystem(subsystems, 'rotation')
  const scoopSubsystem = getSubsystem(subsystems, 'scoop')
  const laserSubsystem = getSubsystem(subsystems, 'laser')
  const railgunSubsystem = getSubsystem(subsystems, 'railgun')
  const missilesSubsystem = getSubsystem(subsystems, 'missiles')

  // Reset to defaults when player changes
  useEffect(() => {
    setActionType('coast')
    setBurnDirection('prograde')
    setBurnIntensity('standard')
    setActivateScoop(false)
    setSelectedWeapon('laser')
    setSelectedTarget('')
  }, [player.id])

  // Update pending action whenever settings change
  useEffect(() => {
    const weaponFiring: WeaponFiring | undefined =
      selectedTarget && selectedWeapon
        ? { weaponType: selectedWeapon, targetPlayerId: selectedTarget }
        : undefined

    const action: PlayerAction = {
      type: actionType,
      burnDirection: actionType === 'burn' ? burnDirection : undefined,
      burnIntensity: actionType === 'burn' ? burnIntensity : undefined,
      activateScoop: activateScoop && actionType === 'coast',
      weaponFiring,
    }
    onActionSelect(action)
  }, [
    actionType,
    burnDirection,
    burnIntensity,
    activateScoop,
    selectedWeapon,
    selectedTarget,
    onActionSelect,
  ])

  // Validation
  const needsRotation = actionType === 'burn' && ship.facing !== burnDirection
  const burnCost = actionType === 'burn' ? BURN_COSTS[burnIntensity] : { energy: 0, mass: 0, rings: 0 }
  const weapon = WEAPONS[selectedWeapon as keyof typeof WEAPONS]

  // Check if subsystems are powered and available
  const hasRotation = rotationSubsystem?.isPowered && !rotationSubsystem.usedThisTurn
  const hasEnoughEngines = enginesSubsystem && enginesSubsystem.allocatedEnergy >= burnCost.energy
  const hasEnoughMass = ship.reactionMass >= burnCost.mass || actionType === 'coast'
  const canActivateScoop = actionType === 'coast' && scoopSubsystem?.isPowered && !scoopSubsystem.usedThisTurn

  // Check weapon subsystems
  let weaponSubsystem = laserSubsystem
  if (selectedWeapon === 'railgun') weaponSubsystem = railgunSubsystem
  if (selectedWeapon === 'missiles') weaponSubsystem = missilesSubsystem
  const hasEnoughWeaponPower = !selectedTarget || (weaponSubsystem?.isPowered && !weaponSubsystem.usedThisTurn)

  const validationErrors: string[] = []
  if (actionType === 'burn' && !hasEnoughEngines) {
    validationErrors.push(`Need ${burnCost.energy} energy in engines for ${burnIntensity} burn`)
  }
  if (actionType === 'burn' && !hasEnoughMass) {
    validationErrors.push(`Need ${burnCost.mass} reaction mass for ${burnIntensity} burn`)
  }
  if (needsRotation && !hasRotation) {
    validationErrors.push('Need powered maneuvering thrusters (not used this turn) to change direction')
  }
  if (activateScoop && !canActivateScoop) {
    validationErrors.push('Need powered fuel scoop (not used this turn) and must be coasting')
  }
  if (selectedTarget && !hasEnoughWeaponPower) {
    validationErrors.push(`Need powered ${weapon.name} (not used this turn) to fire`)
  }

  const handleExecute = () => {
    const action: PlayerAction = {
      type: actionType,
      burnDirection: actionType === 'burn' ? burnDirection : undefined,
      burnIntensity: actionType === 'burn' ? burnIntensity : undefined,
      activateScoop: activateScoop && actionType === 'coast',
    }
    onActionSelect(action)
    onExecuteTurn()
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Action Selection
      </Typography>

      {/* Action Type */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" gutterBottom>
          Action Type
        </Typography>
        <ButtonGroup fullWidth>
          <Button
            variant={actionType === 'coast' ? 'contained' : 'outlined'}
            onClick={() => setActionType('coast')}
          >
            Coast
          </Button>
          <Button
            variant={actionType === 'burn' ? 'contained' : 'outlined'}
            onClick={() => setActionType('burn')}
          >
            Burn
          </Button>
        </ButtonGroup>
      </Box>

      {/* Burn Options */}
      {actionType === 'burn' && (
        <>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" gutterBottom>
              Direction
            </Typography>
            <ButtonGroup fullWidth>
              <Button
                variant={burnDirection === 'prograde' ? 'contained' : 'outlined'}
                onClick={() => setBurnDirection('prograde')}
              >
                Prograde (Outward)
              </Button>
              <Button
                variant={burnDirection === 'retrograde' ? 'contained' : 'outlined'}
                onClick={() => setBurnDirection('retrograde')}
              >
                Retrograde (Inward)
              </Button>
            </ButtonGroup>
            {needsRotation && (
              <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: 'block' }}>
                Requires rotation (1 energy)
              </Typography>
            )}
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" gutterBottom>
              Burn Intensity
            </Typography>
            <ButtonGroup orientation="vertical" fullWidth>
              <Button
                variant={burnIntensity === 'standard' ? 'contained' : 'outlined'}
                onClick={() => setBurnIntensity('standard')}
              >
                Standard (1E, 1M, 1 ring)
              </Button>
              <Button
                variant={burnIntensity === 'hard' ? 'contained' : 'outlined'}
                onClick={() => setBurnIntensity('hard')}
              >
                Hard (2E, 2M, 2 rings)
              </Button>
              <Button
                variant={burnIntensity === 'extreme' ? 'contained' : 'outlined'}
                onClick={() => setBurnIntensity('extreme')}
              >
                Extreme (3E, 3M, 3 rings)
              </Button>
            </ButtonGroup>
          </Box>
        </>
      )}

      {/* Fuel Scoop */}
      {actionType === 'coast' && (
        <Box sx={{ mb: 2 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={activateScoop}
                onChange={e => setActivateScoop(e.target.checked)}
                disabled={!canActivateScoop}
              />
            }
            label="Activate Fuel Scoop (requires powered scoop)"
          />
        </Box>
      )}

      {/* Weapons Section */}
      <Box sx={{ mb: 2, p: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <Typography variant="body2" fontWeight="bold" gutterBottom>
          Weapons
        </Typography>

        {/* Weapon Selection */}
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Weapon Type</InputLabel>
          <Select
            value={selectedWeapon}
            label="Weapon Type"
            onChange={e => setSelectedWeapon(e.target.value)}
          >
            {Object.entries(WEAPONS).map(([key, weapon]) => (
              <MenuItem key={key} value={key}>
                {weapon.name} ({weapon.rangeInDegrees}°, ±{weapon.ringRange}R)
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Target Selection */}
        <FormControl fullWidth>
          <InputLabel>Target</InputLabel>
          <Select
            value={selectedTarget}
            label="Target"
            onChange={e => setSelectedTarget(e.target.value)}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {allPlayers
              .filter(p => p.id !== player.id && p.ship.hitPoints > 0)
              .map(targetPlayer => {
                const targetRingConfig = getRingConfig(targetPlayer.ship.ring)
                const playerRingConfig = getRingConfig(player.ship.ring)
                if (!targetRingConfig || !playerRingConfig) return null

                const weapon = WEAPONS[selectedWeapon as keyof typeof WEAPONS]
                const targetingInfo = calculateWeaponRange(
                  player.ship.ring,
                  player.ship.sector,
                  playerRingConfig.sectors,
                  player.ship.facing,
                  targetPlayer.ship.ring,
                  targetPlayer.ship.sector,
                  targetRingConfig.sectors,
                  weapon
                )

                return (
                  <MenuItem key={targetPlayer.id} value={targetPlayer.id} disabled={!targetingInfo.inRange}>
                    {targetPlayer.name} - R{targetPlayer.ship.ring}S{targetPlayer.ship.sector} ({Math.round(targetingInfo.angularDistance)}°)
                    {!targetingInfo.inRange && ' - OUT OF RANGE'}
                  </MenuItem>
                )
              })}
          </Select>
        </FormControl>
      </Box>

      {/* Subsystem Status Summary */}
      <Box sx={{ mb: 2, p: 1, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <Typography variant="body2">
          <strong>Subsystem Status:</strong>
        </Typography>
        <Typography variant="caption" component="div">
          Engines: {enginesSubsystem?.allocatedEnergy || 0}E {enginesSubsystem?.isPowered ? '✓' : '✗'}
        </Typography>
        <Typography variant="caption" component="div">
          Maneuvering: {rotationSubsystem?.isPowered ? '✓' : '✗'} {rotationSubsystem?.usedThisTurn && '(used)'}
        </Typography>
        <Typography variant="caption" component="div">
          Scoop: {scoopSubsystem?.isPowered ? '✓' : '✗'} {scoopSubsystem?.usedThisTurn && '(used)'}
        </Typography>
        {actionType === 'burn' && (
          <Typography variant="caption" component="div">
            Reaction Mass: {burnCost.mass} / {ship.reactionMass}
          </Typography>
        )}
      </Box>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {validationErrors.map((error, i) => (
            <div key={i}>{error}</div>
          ))}
        </Alert>
      )}

      {/* Execute Button */}
      <Button
        variant="contained"
        color="primary"
        fullWidth
        size="large"
        onClick={handleExecute}
        disabled={validationErrors.length > 0}
      >
        Execute Turn
      </Button>
    </Paper>
  )
}
