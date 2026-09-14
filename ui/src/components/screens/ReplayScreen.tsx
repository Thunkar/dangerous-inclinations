/**
 * Replay of a finished game.
 *
 * A recording holds the full states (the game is over, so nothing is secret
 * any more), and the screen renders it through `viewFor` for whichever seat
 * you pick — including "spectator", which shows only what the table knew.
 */
import { useEffect, useState } from 'react'
import { Box, Button, CircularProgress, IconButton, MenuItem, Paper, Select, Slider, Typography } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import FastRewindIcon from '@mui/icons-material/FastRewind'
import FastForwardIcon from '@mui/icons-material/FastForward'
import type { GameRecording } from '@dangerous-inclinations/engine'
import { fetchRecording } from '../../api/recordings'
import { ReplayGameProvider } from '../../context/GameContext'
import { TableRoot } from '../table/TableRoot'
import { ForkFromReplay } from '../ForkFromReplay'
import { TABLE } from '../../theme'

const SPECTATOR = '__spectator__'

export function ReplayScreen({ recordingId, onExit }: { recordingId: string; onExit: () => void }) {
  const [recording, setRecording] = useState<GameRecording | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [turnIndex, setTurnIndex] = useState(-1)
  const [perspective, setPerspective] = useState<string>(SPECTATOR)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(900)

  useEffect(() => {
    let cancelled = false
    fetchRecording(recordingId)
      .then((r) => !cancelled && setRecording(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [recordingId])

  const turnCount = recording?.turns.length ?? 0

  useEffect(() => {
    if (!playing || turnIndex >= turnCount - 1) return
    const timer = setTimeout(() => setTurnIndex((i) => Math.min(turnCount - 1, i + 1)), speed)
    return () => clearTimeout(timer)
  }, [playing, turnIndex, turnCount, speed])

  useEffect(() => {
    if (turnIndex >= turnCount - 1) setPlaying(false)
  }, [turnIndex, turnCount])

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
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <CircularProgress size={22} />
        <Typography sx={{ color: TABLE.ink }}>Loading recording…</Typography>
      </Box>
    )
  }

  const seats = recording.initialState.players

  return (
    <Box sx={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <ReplayGameProvider
        recording={recording}
        turnIndex={turnIndex}
        perspectiveId={perspective === SPECTATOR ? null : perspective}
      >
        <TableRoot
          headerRight={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ color: TABLE.inkSoft }}>
                seat
              </Typography>
              <Select
                size="small"
                value={perspective}
                onChange={(e) => setPerspective(e.target.value)}
                sx={{ fontSize: '0.8rem', color: TABLE.ink, '& .MuiSelect-select': { py: 0.35 } }}
              >
                <MenuItem value={SPECTATOR} sx={{ fontSize: '0.75rem' }}>
                  Spectator (public only)
                </MenuItem>
                {seats.map((player) => (
                  <MenuItem key={player.id} value={player.id} sx={{ fontSize: '0.75rem' }}>
                    {player.name}
                  </MenuItem>
                ))}
              </Select>
              <ForkFromReplay recording={recording} turnIndex={turnIndex} />
              <Button size="small" variant="outlined" onClick={onExit}>
                Back
              </Button>
            </Box>
          }
          footer={
            <Paper square sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
              <IconButton size="small" onClick={() => setTurnIndex(-1)} title="Back to the start">
                <FastRewindIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => setTurnIndex((i) => Math.max(-1, i - 1))} title="Previous turn">
                <SkipPreviousIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                color="primary"
                onClick={() => setPlaying((p) => !p)}
                title={playing ? 'Pause' : 'Play'}
              >
                {playing ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
              </IconButton>
              <IconButton
                size="small"
                onClick={() => setTurnIndex((i) => Math.min(turnCount - 1, i + 1))}
                title="Next turn"
              >
                <SkipNextIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => setTurnIndex(turnCount - 1)} title="Jump to the end">
                <FastForwardIcon fontSize="small" />
              </IconButton>

              <Typography variant="caption" sx={{ minWidth: 120, color: TABLE.inkSoft }}>
                {turnIndex < 0
                  ? 'Before the first turn'
                  : `Step ${turnIndex + 1} of ${turnCount} · turn ${recording.turns[turnIndex]?.turnNumber ?? '?'}`}
              </Typography>

              <Slider
                size="small"
                value={turnIndex}
                min={-1}
                max={Math.max(0, turnCount - 1)}
                step={1}
                onChange={(_, v) => setTurnIndex(Array.isArray(v) ? v[0] : v)}
                sx={{ flex: 1 }}
              />

              <Typography variant="caption" sx={{ color: TABLE.inkSoft, minWidth: 40 }}>
                {speed}ms
              </Typography>
              <Slider
                size="small"
                value={speed}
                min={200}
                max={2200}
                step={100}
                onChange={(_, v) => setSpeed(Array.isArray(v) ? v[0] : v)}
                sx={{ width: 110 }}
              />
            </Paper>
          }
        />
      </ReplayGameProvider>
    </Box>
  )
}
