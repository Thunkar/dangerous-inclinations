import { Box, Paper, Typography } from '@mui/material'
import type { Player } from '../types/game'

interface StatusDisplayProps {
  players: Player[]
  activePlayerIndex: number
  turn: number
}

export function StatusDisplay({ players, activePlayerIndex, turn }: StatusDisplayProps) {
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
        return (
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
                border: '2px solid',
                borderColor: isActive ? player.color : 'rgba(255, 255, 255, 0.3)',
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  M
                </Typography>
                <Typography variant="body2" fontWeight="medium">
                  {player.ship.reactionMass}
                </Typography>
              </Box>

              {/* Heat (only show if > 0) */}
              {player.ship.heat.currentHeat > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" color="error.main">
                    🔥
                  </Typography>
                  <Typography variant="body2" fontWeight="medium" color="error.main">
                    {player.ship.heat.currentHeat}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )
      })}
    </Paper>
  )
}
