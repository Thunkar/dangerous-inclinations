/**
 * Rewind UI for the active game. Lives in the turn-history header.
 *
 * Clicking the button opens a dialog with a slider over the recorded
 * turn-history entries. Submitting issues a POST `/api/games/:id/rewind`
 * which replaces the live state with the chosen snapshot, truncates the
 * recording, and rebroadcasts so all connected clients re-render. Bots
 * pick up automatically — the server kicks the bot loop after the
 * rewind so a bot-active state advances without waiting for input
 * nobody will give.
 *
 * Notes:
 *   • The slider value is an index into the recording's `turns[]` array,
 *     not the engine's round counter. Multiple recorded entries can share
 *     a `turnNumber` (one per player per round), so the user is rewinding
 *     to a specific *step* in playthrough order.
 *   • Index `-1` means "back to the post-deployment initial state".
 */

import { useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Slider,
  Tooltip,
  Typography,
} from '@mui/material'
import HistoryIcon from '@mui/icons-material/History'
import { useGame } from '../context/GameContext'
import { rewindGame } from '../api/game'

export function RewindControls() {
  const { gameId, gameState, turnHistory } = useGame()
  const [open, setOpen] = useState(false)
  // Default the slider to the latest entry — most rewinds are short hops
  // backwards, so starting at "now" minus a step is the cheapest motion.
  const [targetIndex, setTargetIndex] = useState<number>(turnHistory.length - 1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lastIndex = turnHistory.length - 1
  const canRewind = turnHistory.length > 0

  const openDialog = () => {
    setTargetIndex(Math.max(0, lastIndex - 1))
    setError(null)
    setOpen(true)
  }

  const closeDialog = () => {
    if (submitting) return
    setOpen(false)
  }

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await rewindGame(gameId, targetIndex)
      // The server broadcasts TURN_EXECUTED with the restored state, which
      // GameContext applies via its existing turn pipeline. We just close
      // and let the rest of the UI re-render naturally.
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  // Describe the chosen target so the user knows what they're rewinding to.
  const describeTarget = (idx: number): string => {
    if (idx === -1) return 'Initial state (post-deployment)'
    const entry = turnHistory[idx]
    if (!entry) return `Step ${idx}`
    const playerName =
      gameState.players.find((p) => p.id === entry.playerId)?.name ?? entry.playerId
    return `Round ${entry.turn} — ${playerName}'s turn (step ${idx + 1} of ${turnHistory.length})`
  }

  return (
    <>
      <Tooltip title={canRewind ? 'Rewind to an earlier turn' : 'No history yet'}>
        {/* Tooltip's child must accept refs even when disabled — wrap. */}
        <span>
          <IconButton
            size="small"
            onClick={openDialog}
            disabled={!canRewind}
            sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
          >
            <HistoryIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Dialog open={open} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Rewind game</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Pick an earlier turn to restore. Everything after the chosen
            step is dropped from the recording, and the game continues
            from there. Bots will start acting again automatically if it's
            their turn.
          </Typography>
          <Box sx={{ px: 1 }}>
            <Slider
              min={-1}
              max={lastIndex}
              step={1}
              value={targetIndex}
              onChange={(_, v) => setTargetIndex(typeof v === 'number' ? v : v[0])}
              valueLabelDisplay="auto"
              valueLabelFormat={(idx) => (idx === -1 ? 'Start' : `#${idx + 1}`)}
              marks={[
                { value: -1, label: 'Start' },
                { value: lastIndex, label: `#${lastIndex + 1}` },
              ]}
              disabled={submitting}
            />
            <Typography variant="body2" sx={{ mt: 2, fontWeight: 'medium' }}>
              {describeTarget(targetIndex)}
            </Typography>
          </Box>
          {error && (
            <Typography variant="body2" color="error" sx={{ mt: 2 }}>
              {error}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            variant="contained"
            color="warning"
            disabled={submitting}
          >
            {submitting ? 'Rewinding…' : 'Rewind'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
