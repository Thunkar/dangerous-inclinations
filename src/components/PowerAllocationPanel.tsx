import { Box, Typography, Slider, Paper } from '@mui/material'
import type { PowerAllocation } from '../types/game'
import { ENERGY_PER_TURN } from '../constants/rings'

interface PowerAllocationPanelProps {
  allocation: PowerAllocation
  onChange: (allocation: PowerAllocation) => void
}

export function PowerAllocationPanel({ allocation, onChange }: PowerAllocationPanelProps) {
  const totalAllocated =
    allocation.rotation +
    allocation.engines +
    allocation.scoop +
    allocation.weapons +
    allocation.defense

  const remaining = ENERGY_PER_TURN - totalAllocated

  const handleChange = (system: keyof PowerAllocation, value: number) => {
    const currentWithoutSystem = totalAllocated - allocation[system]
    const maxAllowable = ENERGY_PER_TURN - currentWithoutSystem

    onChange({
      ...allocation,
      [system]: Math.min(value, maxAllowable),
    })
  }

  const systems: { key: keyof PowerAllocation; label: string; max: number }[] = [
    { key: 'rotation', label: 'Rotation Thrusters', max: 1 },
    { key: 'engines', label: 'Engines', max: 3 },
    { key: 'scoop', label: 'Fuel Scoop', max: 5 },
    { key: 'weapons', label: 'Weapons', max: ENERGY_PER_TURN },
    { key: 'defense', label: 'Defense', max: ENERGY_PER_TURN },
  ]

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Power Allocation
      </Typography>

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color={remaining < 0 ? 'error' : 'text.secondary'}>
          Energy Remaining: {remaining} / {ENERGY_PER_TURN}
        </Typography>
      </Box>

      {systems.map(({ key, label, max }) => (
        <Box key={key} sx={{ mb: 2 }}>
          <Typography variant="body2" gutterBottom>
            {label}: {allocation[key]}
          </Typography>
          <Slider
            value={allocation[key]}
            onChange={(_, value) => handleChange(key, value as number)}
            min={0}
            max={max}
            step={1}
            marks
            valueLabelDisplay="auto"
            disabled={remaining < 0 && allocation[key] === 0}
          />
        </Box>
      ))}
    </Paper>
  )
}
