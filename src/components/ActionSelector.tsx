import {
  Box,
  Typography,
  Paper,
  Button,
  ButtonGroup,
  FormControlLabel,
  Checkbox,
  Alert,
} from '@mui/material'
import { useState, useEffect } from 'react'
import type { PlayerAction, BurnIntensity, Facing, Player } from '../types/game'
import { BURN_COSTS } from '../constants/rings'

interface ActionSelectorProps {
  player: Player
  onActionSelect: (action: PlayerAction) => void
  onExecuteTurn: () => void
}

export function ActionSelector({ player, onActionSelect, onExecuteTurn }: ActionSelectorProps) {
  const [actionType, setActionType] = useState<'coast' | 'burn'>('coast')
  const [burnDirection, setBurnDirection] = useState<Facing>('prograde')
  const [burnIntensity, setBurnIntensity] = useState<BurnIntensity>('standard')
  const [activateScoop, setActivateScoop] = useState(false)

  const { powerAllocation, ship } = player

  // Update pending action whenever settings change
  useEffect(() => {
    const action: PlayerAction = {
      type: actionType,
      burnDirection: actionType === 'burn' ? burnDirection : undefined,
      burnIntensity: actionType === 'burn' ? burnIntensity : undefined,
      activateScoop: activateScoop && actionType === 'coast',
    }
    onActionSelect(action)
  }, [actionType, burnDirection, burnIntensity, activateScoop, onActionSelect])

  // Validation
  const needsRotation = actionType === 'burn' && ship.facing !== burnDirection
  const rotationCost = needsRotation ? 1 : 0
  const burnCost = actionType === 'burn' ? BURN_COSTS[burnIntensity] : { energy: 0, mass: 0 }
  const scoopCost = activateScoop && actionType === 'coast' ? 5 : 0

  const totalEnergyCost = rotationCost + burnCost.energy + scoopCost
  const hasEnoughEnergy = powerAllocation.engines >= burnCost.energy || actionType === 'coast'
  const hasEnoughMass = ship.reactionMass >= burnCost.mass || actionType === 'coast'
  const canActivateScoop = actionType === 'coast' && powerAllocation.scoop >= 5

  const validationErrors: string[] = []
  if (actionType === 'burn' && !hasEnoughEnergy) {
    validationErrors.push(`Need ${burnCost.energy} engine power for ${burnIntensity} burn`)
  }
  if (actionType === 'burn' && !hasEnoughMass) {
    validationErrors.push(`Need ${burnCost.mass} reaction mass for ${burnIntensity} burn`)
  }
  if (needsRotation && powerAllocation.rotation < 1) {
    validationErrors.push('Need 1 rotation power to change direction')
  }
  if (activateScoop && !canActivateScoop) {
    validationErrors.push('Need 5 scoop power and must be coasting')
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
            label="Activate Fuel Scoop (5E)"
          />
        </Box>
      )}

      {/* Cost Summary */}
      <Box sx={{ mb: 2, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
        <Typography variant="body2">
          <strong>Cost Summary:</strong>
        </Typography>
        <Typography variant="caption" component="div">
          Energy: {totalEnergyCost} /{' '}
          {powerAllocation.rotation + powerAllocation.engines + powerAllocation.scoop}
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
