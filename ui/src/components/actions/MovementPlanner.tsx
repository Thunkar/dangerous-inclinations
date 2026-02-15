import { useState, useCallback, useMemo, useEffect } from 'react'
import { Box, Typography, Button, styled, Collapse, TextField } from '@mui/material'
import {
  planMovementAlternatives,
  GRAVITY_WELLS,
  MAX_REACTION_MASS,
  SUBSYSTEM_CONFIGS,
  type MovementPlan,
  type MovementAlternatives,
  type GravityWellId,
  type ShipState,
  type PlannerPosition,
  type OrientedPlannerPosition,
} from '@dangerous-inclinations/engine'
import { CustomIcon } from '../CustomIcon'

interface MovementPlannerProps {
  ship: ShipState
  onPlanChange: (plan: MovementPlan | null) => void
  isSelectingDestination: boolean
  onStartSelectingDestination: () => void
  onCancelSelectingDestination: () => void
  selectedDestination: PlannerPosition | null
}

const Container = styled(Box)(({ theme }) => ({
  padding: '12px',
  borderRadius: '8px',
  backgroundColor: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
}))

const AlternativeCard = styled(Box)<{ selected?: boolean }>(({ theme, selected }) => ({
  padding: '8px 12px',
  borderRadius: '6px',
  backgroundColor: selected ? theme.palette.action.selected : theme.palette.action.hover,
  border: `2px solid ${selected ? theme.palette.primary.main : 'transparent'}`,
  cursor: 'pointer',
  marginBottom: '6px',
  transition: 'all 0.15s ease',
  '&:hover': {
    backgroundColor: theme.palette.action.selected,
    borderColor: selected ? theme.palette.primary.main : theme.palette.divider,
  },
}))

const StepItem = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 8px',
  borderRadius: '4px',
  backgroundColor: theme.palette.action.hover,
  marginBottom: '4px',
}))

const ActionIcon = styled(Box)<{ actionType: string }>(({ actionType }) => ({
  width: 20,
  height: 20,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '10px',
  fontWeight: 'bold',
  color: 'white',
  backgroundColor:
    actionType === 'coast'
      ? '#4ade80'
      : actionType.includes('burn')
        ? '#fb923c'
        : actionType === 'well_transfer'
          ? '#a855f7'
          : '#60a5fa',
}))

function getActionLabel(actionType: string, intensity?: string): string {
  switch (actionType) {
    case 'coast':
      return 'Coast'
    case 'burn_prograde':
      return `Burn Pro (${intensity || 'soft'})`
    case 'burn_retrograde':
      return `Burn Retro (${intensity || 'soft'})`
    case 'well_transfer':
      return 'Well Transfer'
    default:
      return actionType
  }
}

function getWellName(wellId: GravityWellId): string {
  const well = GRAVITY_WELLS.find(w => w.id === wellId)
  return well?.name || wellId
}

function getFuelBreakdown(plan: MovementPlan): { spent: number; recovered: number } {
  let spent = 0
  let recovered = 0
  for (const step of plan.steps) {
    if (step.massCost > 0) spent += step.massCost
    else if (step.massCost < 0) recovered += Math.abs(step.massCost)
  }
  return { spent, recovered }
}

export function MovementPlanner({
  ship,
  onPlanChange,
  isSelectingDestination,
  onStartSelectingDestination,
  onCancelSelectingDestination,
  selectedDestination,
}: MovementPlannerProps) {
  const [selectedAlternativeIndex, setSelectedAlternativeIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [fuelReserve, setFuelReserve] = useState(0)

  const hasFuelScoop = useMemo(() => ship.subsystems.some(s => s.type === 'scoop'), [ship.subsystems])
  const maxFuelCapacity = useMemo(() => {
    const fuelTankCount = ship.subsystems.filter(s => s.type === 'fuel_tank').length
    const fuelTankBonus = SUBSYSTEM_CONFIGS.fuel_tank.passiveEffect?.reactionMassBonus ?? 0
    return MAX_REACTION_MASS + fuelTankCount * fuelTankBonus
  }, [ship.subsystems])

  // Calculate all route alternatives
  const alternatives: MovementAlternatives | null = useMemo(() => {
    if (!selectedDestination) return null

    const origin: OrientedPlannerPosition = {
      wellId: ship.wellId,
      ring: ship.ring,
      sector: ship.sector,
      facing: ship.facing,
    }

    const effectiveMass = Math.max(0, ship.reactionMass - fuelReserve)

    return planMovementAlternatives(origin, selectedDestination, {
      availableMass: effectiveMass,
      currentFacing: ship.facing,
      allowWellTransfers: true,
      maxTurns: 20,
      hasFuelScoop,
      fuelReserve,
      maxFuelCapacity,
    })
  }, [ship, selectedDestination, fuelReserve, hasFuelScoop, maxFuelCapacity])

  // Get the currently selected plan
  const plan = useMemo(() => {
    if (!alternatives || alternatives.alternatives.length === 0) return null
    // Clamp index to valid range
    const index = Math.min(selectedAlternativeIndex, alternatives.alternatives.length - 1)
    return alternatives.alternatives[index]
  }, [alternatives, selectedAlternativeIndex])

  // Reset selection when destination changes
  useEffect(() => {
    setSelectedAlternativeIndex(0)
  }, [selectedDestination])

  // Update parent when plan changes
  useEffect(() => {
    onPlanChange(plan)
  }, [plan, onPlanChange])

  // Handle alternative selection
  const handleSelectAlternative = useCallback((index: number) => {
    setSelectedAlternativeIndex(index)
  }, [])

  const handleClear = useCallback(() => {
    onCancelSelectingDestination()
    onPlanChange(null)
  }, [onCancelSelectingDestination, onPlanChange])

  return (
    <Container>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CustomIcon icon="energy" size={16} />
          <Typography variant="body2" fontWeight="bold">
            Route Planner
          </Typography>
        </Box>
        <Button size="small" onClick={() => setExpanded(!expanded)} sx={{ minWidth: 0, p: 0.5 }}>
          {expanded ? '−' : '+'}
        </Button>
      </Box>

      <Collapse in={expanded}>
        {/* Destination selection */}
        <Box sx={{ mb: 1 }}>
          {isSelectingDestination ? (
            <Button
              variant="outlined"
              color="warning"
              fullWidth
              size="small"
              onClick={onCancelSelectingDestination}
            >
              Cancel Selection
            </Button>
          ) : selectedDestination ? (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                fullWidth
                size="small"
                onClick={onStartSelectingDestination}
              >
                Change Dest
              </Button>
              <Button
                variant="outlined"
                color="error"
                size="small"
                onClick={handleClear}
                sx={{ minWidth: 60 }}
              >
                Clear
              </Button>
            </Box>
          ) : (
            <Button
              variant="contained"
              color="primary"
              fullWidth
              size="small"
              onClick={onStartSelectingDestination}
            >
              Select Destination
            </Button>
          )}
        </Box>

        {/* Current destination */}
        {selectedDestination && (
          <Box sx={{ mb: 1, p: 1, bgcolor: 'action.selected', borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Destination:
            </Typography>
            <Typography variant="body2" fontWeight="bold">
              {getWellName(selectedDestination.wellId as GravityWellId)} R{selectedDestination.ring} S
              {selectedDestination.sector}
            </Typography>
          </Box>
        )}

        {/* Fuel reserve */}
        {selectedDestination && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              Fuel reserve:
            </Typography>
            <TextField
              type="number"
              size="small"
              value={fuelReserve}
              onChange={(e) => setFuelReserve(Math.max(0, Math.min(ship.reactionMass, parseInt(e.target.value) || 0)))}
              inputProps={{ min: 0, max: ship.reactionMass, style: { padding: '4px 8px', width: '40px' } }}
              sx={{ '& .MuiOutlinedInput-root': { height: '28px' } }}
            />
            <Typography variant="caption" color="text.secondary">
              / {ship.reactionMass} RM
            </Typography>
            {hasFuelScoop && (
              <Typography variant="caption" color="success.main">
                Scoop
              </Typography>
            )}
          </Box>
        )}

        {/* Route alternatives */}
        {alternatives && alternatives.alternatives.length > 1 && (
          <Box sx={{ mt: 1, mb: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Route options:
            </Typography>
            {alternatives.alternatives.map((alt, index) => (
              <AlternativeCard
                key={index}
                selected={index === selectedAlternativeIndex}
                onClick={() => handleSelectAlternative(index)}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" fontWeight="bold" sx={{ fontSize: '0.8rem' }}>
                    {alt.label || `Route ${index + 1}`}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary">
                      {alt.totalTurns}T
                    </Typography>
                    <Typography variant="caption" color="warning.main">
                      -{getFuelBreakdown(alt).spent}M
                    </Typography>
                    {getFuelBreakdown(alt).recovered > 0 && (
                      <Typography variant="caption" color="success.main">
                        +{getFuelBreakdown(alt).recovered}M
                      </Typography>
                    )}
                    <Typography variant="caption" fontWeight="bold" color={alt.totalMassCost <= 0 ? 'success.main' : 'warning.main'}>
                      ={alt.totalMassCost}M
                    </Typography>
                  </Box>
                </Box>
              </AlternativeCard>
            ))}
          </Box>
        )}

        {/* Plan summary */}
        {plan && (
          <Box sx={{ mt: 1 }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                p: 1,
                bgcolor: 'success.dark',
                borderRadius: 1,
                mb: 1,
              }}
            >
              <Typography variant="caption" fontWeight="bold">
                {plan.totalTurns} turn{plan.totalTurns !== 1 ? 's' : ''}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Typography variant="caption" fontWeight="bold" color="warning.main">
                  -{getFuelBreakdown(plan).spent}M
                </Typography>
                {getFuelBreakdown(plan).recovered > 0 && (
                  <Typography variant="caption" fontWeight="bold" color="success.main">
                    +{getFuelBreakdown(plan).recovered}M
                  </Typography>
                )}
                <Typography variant="caption" fontWeight="bold">
                  (net {plan.totalMassCost}M)
                </Typography>
              </Box>
            </Box>

            {/* Step list */}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Turn-by-turn:
            </Typography>
            <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
              {plan.steps.map((step, i) => (
                <StepItem key={i}>
                  <ActionIcon actionType={step.actionType}>
                    {i + 1}
                  </ActionIcon>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="caption" fontWeight="bold">
                        {getActionLabel(step.actionType, step.burnIntensity)}
                      </Typography>
                      {step.sectorAdjustment !== 0 && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: '#60a5fa',
                            bgcolor: 'rgba(96, 165, 250, 0.15)',
                            px: 0.5,
                            borderRadius: 0.5,
                            fontSize: '0.65rem',
                          }}
                        >
                          {step.sectorAdjustment > 0 ? '+' : ''}{step.sectorAdjustment} adj
                        </Typography>
                      )}
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      → {getWellName(step.to.wellId as GravityWellId)} R{step.to.ring} S{step.to.sector}
                    </Typography>
                  </Box>
                  {step.massCost > 0 && (
                    <Typography variant="caption" color="warning.main">
                      -{step.massCost}M
                    </Typography>
                  )}
                  {step.massCost < 0 && (
                    <Typography variant="caption" color="success.main">
                      +{Math.abs(step.massCost)}M
                    </Typography>
                  )}
                </StepItem>
              ))}
            </Box>

            {plan.crossesWells && (
              <Typography
                variant="caption"
                color="secondary.main"
                sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}
              >
                ⚠ Route crosses gravity wells
              </Typography>
            )}
          </Box>
        )}

        {/* No path found */}
        {selectedDestination && !plan && (
          <Box sx={{ p: 1, bgcolor: 'error.dark', borderRadius: 1, mt: 1 }}>
            <Typography variant="caption" fontWeight="bold">
              No path found within 20 turns
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Try a closer destination or ensure you have enough fuel
            </Typography>
          </Box>
        )}
      </Collapse>

      {/* Collapsed summary */}
      {!expanded && selectedDestination && plan && (
        <Typography variant="caption" color="text.secondary">
          {getWellName(selectedDestination.wellId as GravityWellId)} R{selectedDestination.ring}S
          {selectedDestination.sector} • {plan.totalTurns}T / -{getFuelBreakdown(plan).spent}M{getFuelBreakdown(plan).recovered > 0 ? ` +${getFuelBreakdown(plan).recovered}M` : ''} (net {plan.totalMassCost}M)
          {alternatives && alternatives.alternatives.length > 1 && plan.label && ` (${plan.label})`}
        </Typography>
      )}
      {!expanded && !selectedDestination && (
        <Typography variant="caption" color="text.secondary">
          Click + to plan a route
        </Typography>
      )}
    </Container>
  )
}
