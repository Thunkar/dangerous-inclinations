import { Typography, Paper } from '@mui/material'
import type { Player } from '../types/game'

interface TurnIndicatorProps {
  activePlayer: Player
  turn: number
}

export function TurnIndicator({ activePlayer, turn }: TurnIndicatorProps) {
  return (
    <Paper
      sx={{
        p: 2,
        mb: 3,
        backgroundColor: activePlayer.color,
        color: '#fff',
        textAlign: 'center',
      }}
      elevation={3}
    >
      <Typography variant="h5" component="div" fontWeight="bold">
        Turn {turn} - {activePlayer.name}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.9 }}>
        Ring {activePlayer.ship.ring}, Sector {activePlayer.ship.sector} • Facing{' '}
        {activePlayer.ship.facing}
      </Typography>
    </Paper>
  )
}
