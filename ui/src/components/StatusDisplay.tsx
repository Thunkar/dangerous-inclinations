import { Box, Paper, Typography } from '@mui/material'
import type { Player } from '@dangerous-inclinations/engine'
import type { HeatState } from '@dangerous-inclinations/engine'
import { getPlayerColor } from '@/utils/playerColors'
import { AbandonGameButton } from './AbandonGameButton'

interface StatusDisplayProps {
  players: Player[]
  activePlayerIndex: number
  turn: number
  pendingHeat?: HeatState
}

export function StatusDisplay({
  players,
  activePlayerIndex,
  turn,
}: StatusDisplayProps) {
  return (
    <Paper
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 1.5,
        py: 0.75,
        borderRadius: 0,
      }}
    >
      {/* Turn indicator */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          pr: 1.5,
          borderRight: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
          Turn
        </Typography>
        <Typography variant="body2" fontWeight="bold">
          {turn}
        </Typography>
      </Box>

      {/* Player status - compact */}
      {players.map((player, index) => {
        const isActive = index === activePlayerIndex
        const hp = player.ship.hitPoints
        const maxHp = player.ship.maxHitPoints

        return (
          <Box
            key={player.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1,
              py: 0.25,
              borderRadius: 1,
              bgcolor: isActive ? `${getPlayerColor(index)}20` : 'transparent',
              border: isActive ? `1px solid ${getPlayerColor(index)}` : '1px solid transparent',
            }}
          >
            {/* Ship color indicator */}
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: getPlayerColor(index),
                boxShadow: isActive ? `0 0 6px ${getPlayerColor(index)}` : 'none',
              }}
            />

            {/* Player name */}
            <Typography
              variant="caption"
              fontWeight={isActive ? 'bold' : 'normal'}
              sx={{ fontSize: '0.75rem', minWidth: 60 }}
            >
              {player.name}
            </Typography>

            {/* Hull bar - compact */}
            <Box sx={{ display: 'flex', gap: '2px', height: 8, minWidth: 60 }}>
              {Array.from({ length: maxHp }).map((_, i) => (
                <Box
                  key={i}
                  sx={{
                    flex: 1,
                    height: '100%',
                    bgcolor:
                      i < hp
                        ? hp <= 3
                          ? '#f44336'
                          : hp <= 5
                            ? '#ff9800'
                            : '#4caf50'
                        : 'rgba(255,255,255,0.15)',
                    borderRadius: 0.5,
                  }}
                />
              ))}
            </Box>

            {/* HP text - very compact */}
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.6rem',
                color: hp <= 3 ? 'error.main' : 'text.secondary',
                minWidth: 24,
              }}
            >
              {hp}/{maxHp}
            </Typography>
          </Box>
        )
      })}

      {/* Spacer to push abandon button to right */}
      <Box sx={{ flex: 1 }} />

      {/* Abandon game button */}
      <AbandonGameButton size="small" />
    </Paper>
  )
}
