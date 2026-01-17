import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material'
import ExitToAppIcon from '@mui/icons-material/ExitToApp'
import { useLobby } from '../context/LobbyContext'

interface AbandonGameButtonProps {
  variant?: 'text' | 'outlined' | 'contained'
  size?: 'small' | 'medium' | 'large'
}

export function AbandonGameButton({ variant = 'outlined', size = 'small' }: AbandonGameButtonProps) {
  const { returnToLobby } = useLobby()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleAbandon = () => {
    setConfirmOpen(false)
    returnToLobby()
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        color="error"
        startIcon={<ExitToAppIcon />}
        onClick={() => setConfirmOpen(true)}
      >
        Abandon Game
      </Button>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Abandon Game?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to abandon this game? You will return to the lobby browser and
            cannot rejoin this game.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleAbandon} color="error" variant="contained">
            Abandon
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
