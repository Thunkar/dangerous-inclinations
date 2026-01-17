import { useState, useMemo, useCallback } from 'react'
import { Box, Paper, Typography, Button, Alert, CircularProgress, Chip } from '@mui/material'
import { useLobby } from '../context/LobbyContext'
import { usePlayer } from '../context/PlayerContext'
import { AbandonGameButton } from './AbandonGameButton'
import type {
  ShipLoadout,
  SubsystemType,
  DestroyShipMission,
  DeliverCargoMission,
} from '@dangerous-inclinations/engine'
import {
  DEFAULT_LOADOUT,
  validateLoadout,
  calculateShipStatsFromLoadout,
  DEFAULT_DISSIPATION_CAPACITY,
  STARTING_REACTION_MASS,
} from '@dangerous-inclinations/engine'
import { ShipDisplay } from './ship'
import { LoadoutSlot, ComponentPalette } from './loadout'
import type { SlotType } from './loadout'

// Forward-only subsystems
const FORWARD_SUBSYSTEMS: SubsystemType[] = ['scoop', 'railgun', 'sensor_array']
// Side-only subsystems
const SIDE_SUBSYSTEMS: SubsystemType[] = ['laser', 'shields', 'radiator', 'fuel_tank']
// Either slot subsystems (can go in forward OR side)
const EITHER_SUBSYSTEMS: SubsystemType[] = ['missiles']

// Helper to check if a component can go in a slot type
const canGoInForward = (type: SubsystemType) => FORWARD_SUBSYSTEMS.includes(type) || EITHER_SUBSYSTEMS.includes(type)
const canGoInSide = (type: SubsystemType) => SIDE_SUBSYSTEMS.includes(type) || EITHER_SUBSYSTEMS.includes(type)

const PLANET_NAMES: Record<string, string> = {
  'planet-alpha': 'Alpha',
  'planet-beta': 'Beta',
  'planet-gamma': 'Gamma',
}

function getPlanetName(planetId: string): string {
  return PLANET_NAMES[planetId] || planetId
}

export function LoadoutScreen() {
  const { gameState, submitLoadout } = useLobby()
  const { playerId } = usePlayer()
  const [loadout, setLoadout] = useState<ShipLoadout>(DEFAULT_LOADOUT)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedComponent, setSelectedComponent] = useState<{ type: SubsystemType; slotType: SlotType } | null>(null)
  const [draggingComponent, setDraggingComponent] = useState<SubsystemType | null>(null)

  const currentPlayer = gameState?.players.find(p => p.id === playerId)
  const stats = useMemo(() => calculateShipStatsFromLoadout(loadout), [loadout])
  const validation = useMemo(() => validateLoadout(loadout), [loadout])

  const handleForwardSlotChange = useCallback((index: number, type: SubsystemType | null) => {
    setLoadout(prev => {
      const newForward = [...prev.forwardSlots] as [SubsystemType | null, SubsystemType | null]
      newForward[index] = type
      return { ...prev, forwardSlots: newForward }
    })
    setError(null)
    setSelectedComponent(null)
  }, [])

  const handleSideSlotChange = useCallback((index: number, type: SubsystemType | null) => {
    setLoadout(prev => {
      const newSide = [...prev.sideSlots] as [
        SubsystemType | null,
        SubsystemType | null,
        SubsystemType | null,
        SubsystemType | null,
      ]
      newSide[index] = type
      return { ...prev, sideSlots: newSide }
    })
    setError(null)
    setSelectedComponent(null)
  }, [])

  const handleSlotClick = useCallback(
    (slotType: 'forward' | 'side', index: number) => {
      if (!selectedComponent) return

      // Check if selected component can go in this slot type
      const canPlace =
        selectedComponent.slotType === slotType ||
        (selectedComponent.slotType === 'either' && (slotType === 'forward' || slotType === 'side'))

      if (canPlace) {
        if (slotType === 'forward') {
          handleForwardSlotChange(index, selectedComponent.type)
        } else {
          handleSideSlotChange(index, selectedComponent.type)
        }
      }
    },
    [selectedComponent, handleForwardSlotChange, handleSideSlotChange]
  )

  const handleComponentSelect = useCallback((type: SubsystemType, slotType: SlotType) => {
    setSelectedComponent(prev => (prev?.type === type && prev?.slotType === slotType ? null : { type, slotType }))
  }, [])

  const handleDragStart = useCallback((type: SubsystemType) => {
    setDraggingComponent(type)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggingComponent(null)
  }, [])

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
    setSelectedComponent(null)
  }

  if (!gameState || !currentPlayer) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }

  const allPlayers = gameState.players

  const isForwardDragValid = draggingComponent
    ? canGoInForward(draggingComponent)
    : selectedComponent?.slotType === 'forward' || selectedComponent?.slotType === 'either'
  const isSideDragValid = draggingComponent
    ? canGoInSide(draggingComponent)
    : selectedComponent?.slotType === 'side' || selectedComponent?.slotType === 'either'

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
      <Box sx={{ maxWidth: 900, mx: 'auto' }}>
        {/* Header with title and abandon button */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Box sx={{ flex: 1 }} />
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              textAlign: 'center',
              background: 'linear-gradient(135deg, #3a7bd5 0%, #7c4dff 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Ship Loadout
          </Typography>
          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <AbandonGameButton />
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 3 }}>
          Drag components to slots or click to select
        </Typography>

        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {/* Left Panel - Ship Display */}
          <Box sx={{ flex: '1 1 400px' }}>
            <Paper sx={{ p: 2, mb: 2 }}>
              <ShipDisplay
                shipImageSrc="/assets/ship.svg"
                slots={{
                  forward: [
                    <LoadoutSlot
                      key="f0"
                      slotType="forward"
                      component={loadout.forwardSlots[0]}
                      onDrop={type => handleForwardSlotChange(0, type)}
                      onClick={() => handleSlotClick('forward', 0)}
                      isHighlighted={isForwardDragValid}
                      isSelected={selectedComponent?.slotType === 'forward' || selectedComponent?.slotType === 'either'}
                      acceptingDrag={!!draggingComponent && canGoInForward(draggingComponent)}
                    />,
                    <LoadoutSlot
                      key="f1"
                      slotType="forward"
                      component={loadout.forwardSlots[1]}
                      onDrop={type => handleForwardSlotChange(1, type)}
                      onClick={() => handleSlotClick('forward', 1)}
                      isHighlighted={isForwardDragValid}
                      isSelected={selectedComponent?.slotType === 'forward' || selectedComponent?.slotType === 'either'}
                      acceptingDrag={!!draggingComponent && canGoInForward(draggingComponent)}
                    />,
                  ],
                  side: [
                    <LoadoutSlot
                      key="s0"
                      slotType="side"
                      component={loadout.sideSlots[0]}
                      onDrop={type => handleSideSlotChange(0, type)}
                      onClick={() => handleSlotClick('side', 0)}
                      isHighlighted={isSideDragValid}
                      isSelected={selectedComponent?.slotType === 'side' || selectedComponent?.slotType === 'either'}
                      acceptingDrag={!!draggingComponent && canGoInSide(draggingComponent)}
                    />,
                    <LoadoutSlot
                      key="s1"
                      slotType="side"
                      component={loadout.sideSlots[1]}
                      onDrop={type => handleSideSlotChange(1, type)}
                      onClick={() => handleSlotClick('side', 1)}
                      isHighlighted={isSideDragValid}
                      isSelected={selectedComponent?.slotType === 'side' || selectedComponent?.slotType === 'either'}
                      acceptingDrag={!!draggingComponent && canGoInSide(draggingComponent)}
                    />,
                    <LoadoutSlot
                      key="s2"
                      slotType="side"
                      component={loadout.sideSlots[2]}
                      onDrop={type => handleSideSlotChange(2, type)}
                      onClick={() => handleSlotClick('side', 2)}
                      isHighlighted={isSideDragValid}
                      isSelected={selectedComponent?.slotType === 'side' || selectedComponent?.slotType === 'either'}
                      acceptingDrag={!!draggingComponent && canGoInSide(draggingComponent)}
                    />,
                    <LoadoutSlot
                      key="s3"
                      slotType="side"
                      component={loadout.sideSlots[3]}
                      onDrop={type => handleSideSlotChange(3, type)}
                      onClick={() => handleSlotClick('side', 3)}
                      isHighlighted={isSideDragValid}
                      isSelected={selectedComponent?.slotType === 'side' || selectedComponent?.slotType === 'either'}
                      acceptingDrag={!!draggingComponent && canGoInSide(draggingComponent)}
                    />,
                  ],
                }}
              />
            </Paper>

            {/* Stats and Missions Row */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Paper sx={{ p: 1.5, flex: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Ship Stats
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">
                      Dissipation:
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: stats.dissipationCapacity > DEFAULT_DISSIPATION_CAPACITY ? 'success.main' : 'text.primary',
                        fontWeight: 600,
                      }}
                    >
                      {stats.dissipationCapacity}/turn
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">
                      Reaction Mass:
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: stats.reactionMass > STARTING_REACTION_MASS ? 'success.main' : 'text.primary',
                        fontWeight: 600,
                      }}
                    >
                      {stats.reactionMass}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">
                      Crit Chance:
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {stats.criticalChance}%
                    </Typography>
                  </Box>
                </Box>
              </Paper>

              <Paper sx={{ p: 1.5, flex: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Missions
                </Typography>
                {currentPlayer.missions.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    No missions
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {currentPlayer.missions.map((mission, index) => {
                      if (mission.type === 'destroy_ship') {
                        const destroyMission = mission as DestroyShipMission
                        const targetPlayer = allPlayers.find(p => p.id === destroyMission.targetPlayerId)
                        return (
                          <Chip
                            key={index}
                            label={`Kill ${targetPlayer?.name || '?'}`}
                            size="small"
                            color="error"
                            sx={{ fontSize: '0.65rem', height: 20 }}
                          />
                        )
                      } else if (mission.type === 'deliver_cargo') {
                        const cargoMission = mission as DeliverCargoMission
                        return (
                          <Chip
                            key={index}
                            label={`${getPlanetName(cargoMission.pickupPlanetId)} → ${getPlanetName(cargoMission.deliveryPlanetId)}`}
                            size="small"
                            color="info"
                            sx={{ fontSize: '0.65rem', height: 20 }}
                          />
                        )
                      }
                      return null
                    })}
                  </Box>
                )}
              </Paper>
            </Box>
          </Box>

          {/* Right Panel - Component Palette */}
          <Box sx={{ flex: '0 0 280px' }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 2, textAlign: 'center' }}>
                Available Components
              </Typography>

              <Alert severity="info" sx={{ mb: 2, py: 0 }}>
                <Typography variant="caption">Engines & Thrusters are always installed</Typography>
              </Alert>

              <ComponentPalette
                onComponentSelect={handleComponentSelect}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                selectedComponent={selectedComponent?.type || null}
                installedForward={loadout.forwardSlots}
                installedSide={loadout.sideSlots}
              />

              {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {error}
                </Alert>
              )}

              {!validation.valid && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {validation.errors.map((err, i) => (
                    <Typography key={i} variant="caption" display="block">
                      {err}
                    </Typography>
                  ))}
                </Alert>
              )}

              <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                <Button variant="outlined" size="small" onClick={handleUseDefault} sx={{ flex: 1 }}>
                  Default
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleSubmit}
                  disabled={!validation.valid || isSubmitting}
                  sx={{ flex: 1 }}
                >
                  {isSubmitting ? <CircularProgress size={20} /> : 'Confirm'}
                </Button>
              </Box>
            </Paper>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
