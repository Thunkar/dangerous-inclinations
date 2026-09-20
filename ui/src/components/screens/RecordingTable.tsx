/**
 * A recording on the table, with the transport that walks it.
 *
 * The seat picker, the turn slider and the speed control are the same
 * whatever produced the recording: `ReplayScreen` fetches one from the server
 * and renders it here through `ReplayGameProvider` — so a change to the
 * transport is made once. Anything a caller needs next to the seat picker
 * (fork, back) comes in through `headerExtras`, which is handed the turn
 * being shown.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Box, IconButton, MenuItem, Paper, Select, Slider, Typography } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import FastRewindIcon from '@mui/icons-material/FastRewind'
import FastForwardIcon from '@mui/icons-material/FastForward'
import type { GameRecording } from '@dangerous-inclinations/engine'
import { ReplayGameProvider } from '../../context/GameContext'
import { TableRoot } from '../table/TableRoot'
import { TABLE } from '../../theme'

export const SPECTATOR = '__spectator__'

interface RecordingTableProps {
  recording: GameRecording
  /** Whose seat to open from; null (the default) watches as a spectator. */
  initialPerspectiveId?: string | null
  /** Where the transport starts: -1 is before the first turn. */
  initialTurnIndex?: number
  /** Extra header controls, given the turn currently on the table. */
  headerExtras?: (state: { turnIndex: number }) => ReactNode
}

export function RecordingTable({
  recording,
  initialPerspectiveId = null,
  initialTurnIndex = -1,
  headerExtras,
}: RecordingTableProps) {
  const [turnIndex, setTurnIndex] = useState(initialTurnIndex)
  const [perspective, setPerspective] = useState<string>(initialPerspectiveId ?? SPECTATOR)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(900)

  const turnCount = recording.turns.length

  useEffect(() => {
    if (!playing || turnIndex >= turnCount - 1) return
    const timer = setTimeout(() => setTurnIndex(i => Math.min(turnCount - 1, i + 1)), speed)
    return () => clearTimeout(timer)
  }, [playing, turnIndex, turnCount, speed])

  useEffect(() => {
    if (turnIndex >= turnCount - 1) setPlaying(false)
  }, [turnIndex, turnCount])

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
                onChange={e => setPerspective(e.target.value)}
                sx={{ fontSize: '0.8rem', color: TABLE.ink, '& .MuiSelect-select': { py: 0.35 } }}
              >
                <MenuItem value={SPECTATOR} sx={{ fontSize: '0.75rem' }}>
                  Spectator (public only)
                </MenuItem>
                {seats.map(player => (
                  <MenuItem key={player.id} value={player.id} sx={{ fontSize: '0.75rem' }}>
                    {player.name}
                  </MenuItem>
                ))}
              </Select>
              {headerExtras?.({ turnIndex })}
            </Box>
          }
          footer={
            <Paper
              square
              sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}
            >
              <IconButton size="small" onClick={() => setTurnIndex(-1)} title="Back to the start">
                <FastRewindIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => setTurnIndex(i => Math.max(-1, i - 1))}
                title="Previous turn"
              >
                <SkipPreviousIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                color="primary"
                onClick={() => setPlaying(p => !p)}
                title={playing ? 'Pause' : 'Play'}
              >
                {playing ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
              </IconButton>
              <IconButton
                size="small"
                onClick={() => setTurnIndex(i => Math.min(turnCount - 1, i + 1))}
                title="Next turn"
              >
                <SkipNextIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => setTurnIndex(turnCount - 1)}
                title="Jump to the end"
              >
                <FastForwardIcon fontSize="small" />
              </IconButton>

              <Typography variant="caption" sx={{ minWidth: 120, color: TABLE.inkSoft }}>
                {turnIndex < 0
                  ? 'Before the first turn'
                  : `Step ${turnIndex + 1} of ${turnCount} · turn ${
                      recording.turns[turnIndex]?.turnNumber ?? '?'
                    }`}
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
