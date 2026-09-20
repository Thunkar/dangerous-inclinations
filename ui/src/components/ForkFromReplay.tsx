/**
 * "Play on from here" for the replay screen.
 *
 * Picks a ship in the game you are watching and starts a fresh live game from
 * this turn with you in that seat; everyone else carries on as bots. Only a
 * bot's seat or your own can be taken: another player's seat would hand you
 * their missions, cargo and everything their scans found.
 */

import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline'
import { DEFAULT_POINTS_TO_WIN } from '@dangerous-inclinations/engine'
import type { GameRecording } from '@dangerous-inclinations/engine'
import { getStoredPlayerId } from '../api/client.ts'
import { forkRecording } from '../api/game.ts'

interface ForkFromReplayProps {
  recording: GameRecording
  /**
   * Where the replay is scrubbed to. `-1` is the table as it stood before the
   * first turn; otherwise it is an index into `recording.turns[]`.
   */
  turnIndex: number
}

export function ForkFromReplay({ recording, turnIndex }: ForkFromReplayProps) {
  const [open, setOpen] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The table as it stood at this point: who was still flying, and how they stood.
  const snapshot = useMemo(() => {
    return turnIndex === -1
      ? recording.initialState
      : (recording.turns[turnIndex]?.resultingStateSnapshot ?? recording.initialState)
  }, [recording, turnIndex])

  const myPlayerId = getStoredPlayerId()

  const seats = useMemo(() => {
    const kinds = new Map(recording.metadata.playerKinds.map((k) => [k.playerId, k.kind]))
    return snapshot.players
      .map((p) => ({
        id: p.id,
        name: p.name,
        // A recording from before the points target was written into the
        // snapshot was played to the default.
        pointsToWin: snapshot.pointsToWin ?? DEFAULT_POINTS_TO_WIN,
        isBot: kinds.get(p.id) !== 'human',
        isMine: p.id === myPlayerId,
        hull: p.ship.hitPoints,
        maxHull: p.ship.maxHitPoints,
        pointsScored: p.completedMissionCount,
      }))
      // Another human's seat would expose their hand; the server refuses it too.
      .filter((p) => p.isBot || p.isMine)
  }, [snapshot, recording.metadata.playerKinds, myPlayerId])

  // Only a turn that was actually played can be continued: before deployment
  // is over there is no game to carry on with.
  const isPlayable = snapshot.phase === 'active' || snapshot.phase === 'ended'
  const blockReason = !isPlayable
    ? 'The game had not started here. Scrub forward to a turn that was played.'
    : seats.length === 0
      ? 'Every ship in this game was played by someone else, so there is no seat to take.'
      : null

  const turnLabel =
    turnIndex === -1
      ? 'the table as it was set up'
      : `turn ${recording.turns[turnIndex]?.turnNumber ?? turnIndex + 1}`

  const submit = async () => {
    if (!selectedPlayerId) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await forkRecording({
        recordingId: recording.recordingId,
        turnIndex,
        impersonateOriginalPlayerId: selectedPlayerId,
      })
      // App routes `?game=<id>` straight to the live table.
      window.location.assign(`?game=${encodeURIComponent(result.gameId)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  return (
    <>
      <Tooltip title={blockReason ?? 'Take a ship and play the rest of this game yourself'}>
        {/* Tooltip's child needs to accept refs; wrap to support disabled. */}
        <span>
          <Button
            startIcon={<PlayCircleOutlineIcon />}
            variant="outlined"
            size="small"
            disabled={blockReason !== null}
            onClick={() => {
              setError(null)
              setSelectedPlayerId(seats[0]?.id ?? '')
              setOpen(true)
            }}
          >
            Play on from here
          </Button>
        </span>
      </Tooltip>

      <Dialog open={open} onClose={() => !submitting && setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Play on from {turnLabel}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            A new game starts from {turnLabel}, with the board, the cards and the damage exactly as they
            are here. Take one of the ships; the rest play on as bots.
          </Typography>

          <FormControl component="fieldset" sx={{ width: '100%' }}>
            <RadioGroup value={selectedPlayerId} onChange={(e) => setSelectedPlayerId(e.target.value)}>
              <Stack spacing={0.5}>
                {seats.map((seat) => (
                  <FormControlLabel
                    key={seat.id}
                    value={seat.id}
                    control={<Radio />}
                    label={
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                          Play from this turn as {seat.name}
                          {seat.isMine ? ' (your seat)' : ''}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Hull {seat.hull}/{seat.maxHull} · {seat.pointsScored} of{' '}
                          {seat.pointsToWin} points
                        </Typography>
                      </Box>
                    }
                  />
                ))}
              </Stack>
            </RadioGroup>
          </FormControl>

          {error && (
            <Typography variant="body2" color="error" sx={{ mt: 2 }}>
              {error}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} variant="contained" disabled={submitting || !selectedPlayerId}>
            {submitting ? 'Setting up…' : 'Take this ship'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
