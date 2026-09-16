/**
 * `?showcase=1` — the board with a full game on it, and no server in sight.
 *
 * A dev page: it runs a seeded bot game in the browser and hands the
 * recording to the same table a replay uses, so the board can be looked at,
 * stepped through and screenshotted without a lobby, a socket or a seat. It
 * is the fixture the 3D renderer is tuned and compared against; `?board=3d`
 * switches which renderer draws it, like everywhere else.
 *
 *   ?showcase=1&seed=6&turns=40&seat=0&turn=23
 *
 * `seat` is an index into the table (or `spectator`), `turn` the step the
 * transport opens on. The defaults are chosen for a busy board — see
 * `showcaseGame.ts`.
 */
import { useEffect, useMemo, useState } from 'react'
import { Box, Chip, CircularProgress, Typography } from '@mui/material'
import type { GameRecording } from '@dangerous-inclinations/engine'
import { RecordingTable } from '../components/screens/RecordingTable'
import { FONT_MONO, TABLE } from '../theme'
import { SHOWCASE_DEFAULTS, buildShowcaseRecording } from './showcaseGame'

interface ShowcaseParams {
  seed: number
  turns: number
  bots: number
  /** Index into the table, or null for a spectator. */
  seat: number | null
  turnIndex: number
}

function intParam(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key)
  if (raw === null) return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? Math.trunc(value) : fallback
}

function parseParams(search: string): ShowcaseParams {
  const params = new URLSearchParams(search)
  const seat = params.get('seat')
  return {
    seed: intParam(params, 'seed', SHOWCASE_DEFAULTS.seed),
    turns: intParam(params, 'turns', SHOWCASE_DEFAULTS.turns),
    bots: intParam(params, 'bots', SHOWCASE_DEFAULTS.bots),
    seat: seat === 'spectator' ? null : seat === null ? 0 : Number(seat) || 0,
    turnIndex: intParam(params, 'turn', SHOWCASE_DEFAULTS.turnIndex),
  }
}

function Plate({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ height: '100vh', display: 'grid', placeItems: 'center', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>{children}</Box>
    </Box>
  )
}

export function ShowcaseScreen() {
  const params = useMemo(() => parseParams(window.location.search), [])
  const [recording, setRecording] = useState<GameRecording | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // A 40-turn game takes a moment: let the plate paint before it runs.
    const timer = setTimeout(() => {
      if (cancelled) return
      try {
        setRecording(buildShowcaseRecording(params))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [params])

  if (error) {
    return (
      <Plate>
        <Typography color="error">Could not build the showcase game: {error}</Typography>
      </Plate>
    )
  }

  if (!recording) {
    return (
      <Plate>
        <CircularProgress size={22} />
        <Typography sx={{ color: TABLE.ink }}>
          Playing {params.turns} turns of seed {params.seed}…
        </Typography>
      </Plate>
    )
  }

  const seats = recording.initialState.players
  const perspectiveId = params.seat === null ? null : (seats[params.seat]?.id ?? null)
  const lastIndex = recording.turns.length - 1
  const turnIndex = Math.max(-1, Math.min(lastIndex, params.turnIndex))

  return (
    <RecordingTable
      recording={recording}
      initialPerspectiveId={perspectiveId}
      initialTurnIndex={turnIndex}
      headerExtras={() => (
        <Chip
          size="small"
          label={`showcase · seed ${params.seed}`}
          sx={{
            bgcolor: 'transparent',
            border: `1px solid ${TABLE.plateEdge}`,
            color: TABLE.inkSoft,
            fontFamily: FONT_MONO,
          }}
        />
      )}
    />
  )
}
