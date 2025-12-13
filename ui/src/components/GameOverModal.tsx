import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
} from '@mui/material'
import type { GameStatus } from '@dangerous-inclinations/engine'

interface GameOverModalProps {
  status: GameStatus
  winnerName?: string
  onRestart: () => void
}

export function GameOverModal({ status, winnerName, onRestart }: GameOverModalProps) {
  const open = status !== 'active'

  if (!open) return null

  const isVictory = status === 'victory'

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: isVictory ? 'success.dark' : 'error.dark',
          backgroundImage: 'none',
        },
      }}
    >
      <DialogTitle
        sx={{
          textAlign: 'center',
          fontSize: '2rem',
          fontWeight: 'bold',
          color: 'white',
        }}
      >
        {isVictory ? '🎉 VICTORY! 🎉' : '💀 DEFEAT 💀'}
      </DialogTitle>

      <DialogContent>
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <Typography variant="h6" color="white" gutterBottom>
            {isVictory ? 'You have destroyed all enemy ships!' : 'Your ship has been destroyed!'}
          </Typography>

          {winnerName && (
            <Typography variant="body1" color="white" sx={{ mt: 2 }}>
              Winner: <strong>{winnerName}</strong>
            </Typography>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
        <Button
          variant="contained"
          size="large"
          onClick={onRestart}
          sx={{
            bgcolor: 'white',
            color: isVictory ? 'success.dark' : 'error.dark',
            '&:hover': {
              bgcolor: 'grey.200',
            },
            fontWeight: 'bold',
            px: 4,
          }}
        >
          Play Again
        </Button>
      </DialogActions>
    </Dialog>
  )
}
