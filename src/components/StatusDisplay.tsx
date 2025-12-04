import { Box, Paper, Typography } from '@mui/material'
import type { Player } from '../types/game'
import type { HeatState } from '../types/subsystems'
import { STARTING_REACTION_MASS } from '../constants/rings'

interface StatusDisplayProps {
  players: Player[]
  activePlayerIndex: number
  turn: number
  pendingHeat?: HeatState
}

export function StatusDisplay({ players, activePlayerIndex, turn, pendingHeat }: StatusDisplayProps) {
  return (
    <Paper
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2,
        py: 1,
        borderRadius: 0,
      }}
    >
      {/* Turn indicator */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          borderRight: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Turn
        </Typography>
        <Typography variant="h6" fontWeight="bold">
          {turn}
        </Typography>
      </Box>

      {/* Player status cards */}
      {players.map((player, index) => {
        const isActive = index === activePlayerIndex
        // For active player, show pending heat, for others show committed heat
        const heat = isActive && pendingHeat ? pendingHeat : player.ship.heat
        const displayHeat = heat.currentHeat

        return (
          <>
            {index > 0 && (
              <Box
                key={`divider-${player.id}`}
                sx={{
                  width: '1px',
                  height: 40,
                  bgcolor: 'divider',
                  opacity: 0.3,
                }}
              />
            )}
            <Box
              key={player.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 2,
                py: 0.5,
                borderRadius: 1,
                bgcolor: isActive ? `${player.color}30` : 'transparent',
                border: isActive ? `2px solid ${player.color}` : '2px solid transparent',
                transition: 'all 0.2s',
              }}
            >
              {/* Ship indicator */}
              <Box
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  bgcolor: player.color,
                  border: isActive ? `2px solid ${player.color}` : 'none',
                  boxShadow: isActive ? `0 0 8px ${player.color}` : 'none',
                }}
              />

            {/* Ship name */}
            <Typography
              variant="body2"
              fontWeight={isActive ? 'bold' : 'normal'}
              sx={{ minWidth: 80 }}
            >
              {player.name}
            </Typography>

            {/* Stats */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              {/* Hull */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  HP
                </Typography>
                <Typography
                  variant="body2"
                  fontWeight="medium"
                  color={player.ship.hitPoints <= 3 ? 'error.main' : 'inherit'}
                >
                  {player.ship.hitPoints}/{player.ship.maxHitPoints}
                </Typography>
              </Box>

              {/* Energy */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  E
                </Typography>
                <Typography variant="body2" fontWeight="medium">
                  {player.ship.reactor.availableEnergy}/{player.ship.reactor.totalCapacity}
                </Typography>
              </Box>

              {/* Reaction Mass */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 120 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    REACTION MASS
                  </Typography>
                  <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.7rem' }}>
                    {player.ship.reactionMass}/{STARTING_REACTION_MASS}
                  </Typography>
                </Box>
                <Box sx={{ position: 'relative', height: 8, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 1, overflow: 'hidden' }}>
                  {/* Reaction mass level bar */}
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${(player.ship.reactionMass / STARTING_REACTION_MASS) * 100}%`,
                      bgcolor: player.ship.reactionMass <= 2
                        ? 'error.main'
                        : player.ship.reactionMass <= 5
                        ? 'warning.main'
                        : '#00ff00',
                      transition: 'all 0.3s',
                      boxShadow: player.ship.reactionMass <= 2
                        ? '0 0 8px rgba(255,0,0,0.6)'
                        : 'none',
                    }}
                  />
                </Box>
              </Box>

              {/* Heat (only show if > 0) */}
              {displayHeat > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" color="error.main">
                    🔥
                  </Typography>
                  <Typography variant="body2" fontWeight="medium" color="error.main">
                    {displayHeat}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </>
        )
      })}
    </Paper>
  )
}
