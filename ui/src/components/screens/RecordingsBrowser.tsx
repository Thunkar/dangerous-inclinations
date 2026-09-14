/**
 * Finished games the server kept. Open one to watch it back from any seat.
 *
 * Recordings are identified on the wire by ids; nothing here shows one. A
 * game is named by what it was — a table game or a run of the simulator —
 * when it was played, and how it ended.
 */
import { useEffect, useState } from 'react'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import { listRecordings, type RecordingSummary } from '../../api/recordings'
import { Panel } from '../common/Panel'
import { TABLE } from '../../theme'

/** Live recordings are labelled with their game id; only a simulator label is worth printing. */
function titleOf(recording: RecordingSummary): string {
  if (recording.source === 'sim') return recording.label ?? 'Simulated game'
  return 'Table game'
}

function playedOn(createdAt: string): string {
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}

function endingOf(recording: RecordingSummary): string {
  const turns = `${recording.turnCount} turn${recording.turnCount === 1 ? '' : 's'}`
  return recording.winnerId
    ? `${turns} · three missions completed`
    : `${turns} · nobody reached three missions`
}

export function RecordingsBrowser({
  onOpen,
  onExit,
}: {
  onOpen: (recordingId: string) => void
  onExit: () => void
}) {
  const [items, setItems] = useState<RecordingSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listRecordings()
      .then((r) => !cancelled && setItems(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Box sx={{ minHeight: '100vh', p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <Typography variant="h4" sx={{ color: TABLE.ink, mt: 2 }}>
        Watch a finished game
      </Typography>

      <Panel
        title="Games played to the end"
        sx={{ width: '100%', maxWidth: 720 }}
        action={
          <Button size="small" variant="outlined" onClick={onExit}>
            Back
          </Button>
        }
      >
        {error && <Typography color="error">{error}</Typography>}
        {!items && !error && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2">Looking through the shelf…</Typography>
          </Box>
        )}
        {items && items.length === 0 && (
          <Typography variant="body2" sx={{ color: TABLE.inkSoft, py: 2 }}>
            Nothing recorded yet. Play a game to the end, or run the simulator.
          </Typography>
        )}
        {items && items.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 1 }}>
            {items.map((recording) => (
              <Box
                key={recording.recordingId}
                onClick={() => onOpen(recording.recordingId)}
                title="Watch this game back, from any seat"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.25,
                  py: 0.85,
                  borderRadius: 1,
                  cursor: 'pointer',
                  border: `1px solid ${TABLE.plateEdge}`,
                  bgcolor: 'rgba(126,165,205,0.04)',
                  '&:hover': { bgcolor: 'rgba(126,165,205,0.10)' },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, color: TABLE.ink }} noWrap>
                    {titleOf(recording)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: TABLE.inkSoft }}>
                    {playedOn(recording.createdAt)}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1 }} />
                <Typography variant="caption" sx={{ color: TABLE.inkSoft, textAlign: 'right' }}>
                  {endingOf(recording)}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Panel>
    </Box>
  )
}
