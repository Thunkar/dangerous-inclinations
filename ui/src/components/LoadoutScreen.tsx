import { useState, useMemo } from 'react'
import {
  Box,
  Paper,
  Typography,
  Button,
  Card,
  CardContent,
  CardActionArea,
  Chip,
  Alert,
  CircularProgress,
} from '@mui/material'
import { useLobby } from '../context/LobbyContext'
import { usePlayer } from '../context/PlayerContext'
import type {
  ShipLoadout,
  SubsystemType,
  DestroyShipMission,
  DeliverCargoMission,
} from '@dangerous-inclinations/engine'
import {
  SUBSYSTEM_CONFIGS,
  DEFAULT_LOADOUT,
  validateLoadout,
  calculateShipStatsFromLoadout,
  DEFAULT_DISSIPATION_CAPACITY,
  STARTING_REACTION_MASS,
} from '@dangerous-inclinations/engine'

// Subsystems available for forward slots
const FORWARD_SUBSYSTEMS: SubsystemType[] = ['scoop', 'railgun', 'sensor_array', 'missiles']
// Subsystems available for side slots
const SIDE_SUBSYSTEMS: SubsystemType[] = ['laser', 'shields', 'radiator', 'fuel_tank', 'missiles']

// Planet display names
const PLANET_NAMES: Record<string, string> = {
  'planet-alpha': 'Alpha',
  'planet-beta': 'Beta',
  'planet-gamma': 'Gamma',
}

function getPlanetName(planetId: string): string {
  return PLANET_NAMES[planetId] || planetId
}

interface SlotSelectorProps {
  slotType: 'forward' | 'side'
  slotIndex: number
  selectedType: SubsystemType | null
  onSelect: (type: SubsystemType | null) => void
  availableTypes: SubsystemType[]
}

function getSubsystemColor(type: SubsystemType): string {
  const config = SUBSYSTEM_CONFIGS[type]
  if (config.weaponStats) return '#f44336' // Red for weapons
  if (config.isPassive) return '#4caf50' // Green for passive
  if (type === 'shields') return '#2196f3' // Blue for shields
  return '#ff9800' // Orange for others
}

function SubsystemCard({
  type,
  isSelected,
  onClick,
}: {
  type: SubsystemType | null
  isSelected: boolean
  onClick: () => void
}) {
  if (type === null) {
    return (
      <Card
        sx={{
          opacity: isSelected ? 1 : 0.6,
          border: isSelected ? '2px solid #3a7bd5' : '2px solid transparent',
          transition: 'all 0.2s',
        }}
      >
        <CardActionArea onClick={onClick}>
          <CardContent sx={{ textAlign: 'center', py: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Empty Slot
            </Typography>
          </CardContent>
        </CardActionArea>
      </Card>
    )
  }

  const config = SUBSYSTEM_CONFIGS[type]
  const color = getSubsystemColor(type)

  return (
    <Card
      sx={{
        opacity: isSelected ? 1 : 0.7,
        border: isSelected ? `2px solid ${color}` : '2px solid transparent',
        transition: 'all 0.2s',
        '&:hover': {
          opacity: 1,
        },
      }}
    >
      <CardActionArea onClick={onClick}>
        <CardContent sx={{ py: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: color,
              }}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {config.name}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {getSubsystemDescription(type)}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {config.minEnergy > 0 && (
              <Chip
                label={`${config.minEnergy}-${config.maxEnergy} Energy`}
                size="small"
                sx={{ fontSize: '0.65rem', height: 18 }}
              />
            )}
            {config.isPassive && (
              <Chip label="Passive" size="small" color="success" sx={{ fontSize: '0.65rem', height: 18 }} />
            )}
            {config.weaponStats && (
              <Chip
                label={`${config.weaponStats.damage} Dmg`}
                size="small"
                color="error"
                sx={{ fontSize: '0.65rem', height: 18 }}
              />
            )}
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}

function getSubsystemDescription(type: SubsystemType): string {
  switch (type) {
    case 'scoop':
      return 'Collect reaction mass from inner rings'
    case 'railgun':
      return 'High damage spinal weapon with recoil'
    case 'sensor_array':
      return '+20% critical hit chance when powered'
    case 'laser':
      return 'Broadside weapon, targets adjacent rings'
    case 'shields':
      return 'Convert damage to heat'
    case 'radiator':
      return '+2 heat dissipation capacity'
    case 'fuel_tank':
      return '+6 starting reaction mass'
    case 'missiles':
      return 'Guided projectiles, flexible targeting'
    default:
      return ''
  }
}

function SlotSelector({ slotType, slotIndex, selectedType, onSelect, availableTypes }: SlotSelectorProps) {
  const slotLabel = slotType === 'forward' ? `Forward Slot ${slotIndex + 1}` : `Side Slot ${slotIndex + 1}`

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        {slotLabel}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ flex: '0 0 calc(33.33% - 8px)', minWidth: 150 }}>
          <SubsystemCard type={null} isSelected={selectedType === null} onClick={() => onSelect(null)} />
        </Box>
        {availableTypes.map((type) => (
          <Box key={type} sx={{ flex: '0 0 calc(33.33% - 8px)', minWidth: 150 }}>
            <SubsystemCard type={type} isSelected={selectedType === type} onClick={() => onSelect(type)} />
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export function LoadoutScreen() {
  const { gameState, submitLoadout } = useLobby()
  const { playerId } = usePlayer()
  const [loadout, setLoadout] = useState<ShipLoadout>(DEFAULT_LOADOUT)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Find current player
  const currentPlayer = gameState?.players.find((p) => p.id === playerId)

  // Calculate stats from current loadout
  const stats = useMemo(() => calculateShipStatsFromLoadout(loadout), [loadout])

  // Validate loadout
  const validation = useMemo(() => validateLoadout(loadout), [loadout])

  const handleForwardSlotChange = (index: number, type: SubsystemType | null) => {
    setLoadout((prev) => {
      const newForward = [...prev.forwardSlots] as [SubsystemType | null, SubsystemType | null]
      newForward[index] = type
      return { ...prev, forwardSlots: newForward }
    })
    setError(null)
  }

  const handleSideSlotChange = (index: number, type: SubsystemType | null) => {
    setLoadout((prev) => {
      const newSide = [...prev.sideSlots] as [
        SubsystemType | null,
        SubsystemType | null,
        SubsystemType | null,
        SubsystemType | null
      ]
      newSide[index] = type
      return { ...prev, sideSlots: newSide }
    })
    setError(null)
  }

  const handleSubmit = async () => {
    if (!validation.valid) {
      setError(validation.errors.join(', '))
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await submitLoadout(loadout)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit loadout')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUseDefault = () => {
    setLoadout(DEFAULT_LOADOUT)
    setError(null)
  }

  if (!gameState || !currentPlayer) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }

  // Get all players for mission target lookup
  const allPlayers = gameState.players

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0f 100%)',
        p: 3,
        overflow: 'auto',
      }}
    >
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        {/* Header */}
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            mb: 1,
            textAlign: 'center',
            background: 'linear-gradient(135deg, #3a7bd5 0%, #7c4dff 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Ship Loadout
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', mb: 4 }}>
          Choose your subsystems before deployment
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {/* Left side - Missions */}
          <Box sx={{ flex: '1 1 300px', maxWidth: { xs: '100%', md: '33%' } }}>
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Your Missions
              </Typography>
              {currentPlayer.missions.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No missions assigned
                </Typography>
              ) : (
                currentPlayer.missions.map((mission, index) => {
                  if (mission.type === 'destroy_ship') {
                    const destroyMission = mission as DestroyShipMission
                    const targetPlayer = allPlayers.find((p) => p.id === destroyMission.targetPlayerId)
                    return (
                      <Box
                        key={index}
                        sx={{ mb: 1, p: 1, bgcolor: 'background.default', borderRadius: 1 }}
                      >
                        <Typography variant="subtitle2" sx={{ color: '#f44336' }}>
                          Destroy Ship
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Target: {targetPlayer?.name || 'Unknown'}
                        </Typography>
                      </Box>
                    )
                  } else if (mission.type === 'deliver_cargo') {
                    const cargoMission = mission as DeliverCargoMission
                    return (
                      <Box
                        key={index}
                        sx={{ mb: 1, p: 1, bgcolor: 'background.default', borderRadius: 1 }}
                      >
                        <Typography variant="subtitle2" sx={{ color: '#2196f3' }}>
                          Deliver Cargo
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {getPlanetName(cargoMission.pickupPlanetId)} → {getPlanetName(cargoMission.deliveryPlanetId)}
                        </Typography>
                      </Box>
                    )
                  }
                  return null
                })
              )}
            </Paper>

            {/* Ship Stats Preview */}
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Ship Stats
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    Dissipation Capacity:
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: stats.dissipationCapacity > DEFAULT_DISSIPATION_CAPACITY ? 'success.main' : 'text.primary',
                      fontWeight: 600,
                    }}
                  >
                    {stats.dissipationCapacity} heat/turn
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    Reaction Mass:
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: stats.reactionMass > STARTING_REACTION_MASS ? 'success.main' : 'text.primary',
                      fontWeight: 600,
                    }}
                  >
                    {stats.reactionMass} units
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    Critical Chance:
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {stats.criticalChance}% (base)
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Note: Sensor array bonus (+20%) only applies when powered during combat
                </Typography>
              </Box>
            </Paper>
          </Box>

          {/* Right side - Loadout Selection */}
          <Box sx={{ flex: '2 1 600px' }}>
            <Paper sx={{ p: 2 }}>
              {/* Fixed subsystems notice */}
              <Alert severity="info" sx={{ mb: 3 }}>
                <Typography variant="body2">
                  <strong>Engines</strong> and <strong>Maneuvering Thrusters</strong> are always installed
                </Typography>
              </Alert>

              {/* Forward Slots */}
              <Typography variant="h6" sx={{ mb: 2 }}>
                Forward Slots (2)
              </Typography>
              <Box sx={{ mb: 3 }}>
                {[0, 1].map((index) => (
                  <SlotSelector
                    key={`forward-${index}`}
                    slotType="forward"
                    slotIndex={index}
                    selectedType={loadout.forwardSlots[index]}
                    onSelect={(type) => handleForwardSlotChange(index, type)}
                    availableTypes={FORWARD_SUBSYSTEMS}
                  />
                ))}
              </Box>

              {/* Side Slots */}
              <Typography variant="h6" sx={{ mb: 2 }}>
                Side Slots (4)
              </Typography>
              <Box sx={{ mb: 3 }}>
                {[0, 1, 2, 3].map((index) => (
                  <SlotSelector
                    key={`side-${index}`}
                    slotType="side"
                    slotIndex={index}
                    selectedType={loadout.sideSlots[index]}
                    onSelect={(type) => handleSideSlotChange(index, type)}
                    availableTypes={SIDE_SUBSYSTEMS}
                  />
                ))}
              </Box>

              {/* Error display */}
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              {/* Validation errors */}
              {!validation.valid && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  {validation.errors.map((err, i) => (
                    <Typography key={i} variant="body2">
                      {err}
                    </Typography>
                  ))}
                </Alert>
              )}

              {/* Actions */}
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                <Button variant="outlined" onClick={handleUseDefault}>
                  Use Default Loadout
                </Button>
                <Button
                  variant="contained"
                  onClick={handleSubmit}
                  disabled={!validation.valid || isSubmitting}
                  sx={{ minWidth: 150 }}
                >
                  {isSubmitting ? <CircularProgress size={24} /> : 'Confirm Loadout'}
                </Button>
              </Box>
            </Paper>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
