/**
 * Replay of a finished game.
 *
 * A recording holds the full states (the game is over, so nothing is secret
 * any more), and the screen renders it through `viewFor` for whichever seat
 * you pick — including "spectator", which shows only what the table knew.
 *
 * The table and its transport live in `RecordingTable`; this screen only
 * fetches the recording and adds the fork and back buttons to its header.
 */
import { useEffect, useState } from 'react'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import type { GameRecording } from '@dangerous-inclinations/engine'
import { fetchRecording } from '../../api/recordings'
import { ForkFromReplay } from '../ForkFromReplay'
import { TABLE } from '../../theme'
import { RecordingTable } from './RecordingTable'

export function ReplayScreen({ recordingId, onExit }: { recordingId: string; onExit: () => void }) {
  const [recording, setRecording] = useState<GameRecording | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchRecording(recordingId)
      .then(r => !cancelled && setRecording(r))
      .catch(e => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [recordingId])

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">Failed to load recording: {error}</Typography>
        <Button onClick={onExit} sx={{ mt: 2 }} variant="outlined">
          Back
        </Button>
      </Box>
    )
  }

  if (!recording) {
    return (
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <CircularProgress size={22} />
        <Typography sx={{ color: TABLE.ink }}>Loading recording…</Typography>
      </Box>
    )
  }

  return (
    <RecordingTable
      recording={recording}
      headerExtras={({ turnIndex }) => (
        <>
          <ForkFromReplay recording={recording} turnIndex={turnIndex} />
          <Button size="small" variant="outlined" onClick={onExit}>
            Back
          </Button>
        </>
      )}
    />
  )
}
