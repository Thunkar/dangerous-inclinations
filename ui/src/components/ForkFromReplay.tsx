/**
 * "Fork from here" UI for ReplayScreen.
 *
 * Opens a dialog with a list of players in the recording's snapshot at
 * the current scrub position. The user picks one to step into (or
 * "spectate" to leave everyone as bots), submits, and gets redirected
 * into the new live game's URL.
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
import CallSplitIcon from '@mui/icons-material/CallSplit'
import type { GameRecording } from '@dangerous-inclinations/engine'
import { forkRecording } from '../api/game.ts'

interface ForkFromReplayProps {
  recording: GameRecording
  /**
   * Current scrub position. `-1` means "before any turn has been played"
   * (i.e. the post-deployment initial state). Otherwise it's an index
   * into `recording.turns[]`.
   */
  turnIndex: number
}

const SPECTATE_VALUE = '__spectate__'

export function ForkFromReplay({ recording, turnIndex }: ForkFromReplayProps) {
  const [open, setOpen] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(SPECTATE_VALUE)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pull the snapshot for the chosen turn so we can show the player
  // roster *and* gate the fork action on the snapshot's phase. The
  // server only accepts snapshots in `active` or `ended` phase — see
  // forkGameFromRecording — so a mid-deployment scrub position has no
  // valid fork target.
  const snapshot = useMemo(() => {
    return turnIndex === -1
      ? recording.initialState
      : recording.turns[turnIndex]?.resultingStateSnapshot ?? recording.initialState
  }, [recording, turnIndex])

  const playersAtTurn = useMemo(() => {
    return snapshot.players.map((p) => ({
      id: p.id,
      name: p.name,
      hp: p.ship.hitPoints,
      missionsDone: p.completedMissionCount,
    }))
  }, [snapshot])

  // Phase guard: server-side validation will reject anything that isn't
  // `active`/`ended`, but disabling the button here gives an immediate
  // affordance and a tooltip explaining the limitation.
  const canFork =
    snapshot.phase === 'active' || snapshot.phase === 'ended'
  const blockReason = canFork
    ? null
    : `Forking requires an "active" or "ended" snapshot — this one is "${snapshot.phase}". Scrub past the deployment phase first.`

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const result = await forkRecording({
        recordingId: recording.recordingId,
        turnIndex,
        impersonateOriginalPlayerId:
          selectedPlayerId === SPECTATE_VALUE ? undefined : selectedPlayerId,
      })
      // Hand off to the App's URL routing — the `?fork=<gameId>` flag is
      // recognised in App.tsx and mounts the live game tree directly,
      // bypassing the lobby flow.
      window.location.assign(`?fork=${encodeURIComponent(result.gameId)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  return (
    <>
      <Tooltip title={blockReason ?? 'Fork this recording into a new live game'}>
        {/* Tooltip's child needs to accept refs; wrap to support disabled. */}
        <span>
          <Button
            startIcon={<CallSplitIcon />}
            variant="outlined"
            size="small"
            disabled={!canFork}
            onClick={() => {
              setError(null)
              setOpen(true)
            }}
          >
            Fork from here
          </Button>
        </span>
      </Tooltip>

      <Dialog
        open={open}
        onClose={() => !submitting && setOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Fork into a live game</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            A new live game will start from{' '}
            {turnIndex === -1
              ? 'the recording\'s initial state'
              : `turn ${recording.turns[turnIndex].turnNumber} (step ${turnIndex + 1} of ${recording.turns.length})`}
            . Pick a ship to take over, or spectate to watch the bots play
            it out from there.
          </Typography>

          <FormControl component="fieldset" sx={{ width: '100%' }}>
            <RadioGroup
              value={selectedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
            >
              <FormControlLabel
                value={SPECTATE_VALUE}
                control={<Radio />}
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                      Spectate
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      All ships continue as bots — you watch them play.
                    </Typography>
                  </Box>
                }
              />
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {playersAtTurn.map((p) => (
                  <FormControlLabel
                    key={p.id}
                    value={p.id}
                    control={<Radio />}
                    label={
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                          Take over {p.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          HP {p.hp} · {p.missionsDone}/3 missions complete
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
          <Button onClick={submit} variant="contained" disabled={submitting}>
            {submitting ? 'Forking…' : 'Fork'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
