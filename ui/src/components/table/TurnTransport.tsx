/**
 * The transport: every player-turn of the game as ticks, and how fast they play.
 *
 * A table with bots runs several turns between two of yours, and the log says
 * what happened without showing you where it happened. A tick replays one of
 * those turns over the board (the same animation, from the same pair of
 * views, committing nothing) so a volley you missed can be watched again
 * without touching the game. The row scrolls back to the first turn; it stays
 * pinned to the newest one unless you have scrolled away, and a mouse wheel
 * scrolls it sideways.
 *
 * The speed sits here because it is the same question: how fast somebody
 * else's turn should go past. It divides every beat and every mark's life
 * (`AnimationContext`), and it is remembered per browser.
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Box, Tooltip, Typography } from '@mui/material'
import ReplayIcon from '@mui/icons-material/Replay'
import { useGame } from '../../context/GameContext'
import { PLAYBACK_SPEEDS, useAnimation, type PlaybackSpeed } from '../../context/AnimationContext'
import { getPlayerColor } from '../../utils/playerColors'
import { FONT_MONO, TABLE } from '../../theme'
import { FONT_DISPLAY } from '../../design/press'

/** What one tick says when you hover it. */
function tickTitle(name: string, turn: number, lines: number): string {
  return `Replay ${name}'s turn (round ${turn}, ${lines} ${lines === 1 ? 'event' : 'events'})`
}

export function TurnTransport() {
  const { history, replayTurn, isAnimating, view } = useGame()
  const { speed, setSpeed } = useAnimation()
  const rowRef = useRef<HTMLDivElement | null>(null)
  /** Whether the row is scrolled to its newest tick, so a new turn keeps it there. */
  const pinnedRef = useRef(true)
  const empty = history.length === 0

  useLayoutEffect(() => {
    const row = rowRef.current
    if (row && pinnedRef.current) row.scrollLeft = row.scrollWidth
  }, [history.length])

  // A vertical wheel scrolls the row sideways. React's wheel listener is
  // passive, so it cannot stop the page scrolling instead.
  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      if (row.scrollWidth <= row.clientWidth) return
      event.preventDefault()
      row.scrollLeft += event.deltaY
    }
    row.addEventListener('wheel', onWheel, { passive: false })
    return () => row.removeEventListener('wheel', onWheel)
  }, [empty])

  if (empty) return null

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 0.4,
        flexShrink: 0,
        minWidth: 0,
        borderTop: `1px solid ${TABLE.plateEdge}`,
        bgcolor: TABLE.bar,
      }}
    >
      <ReplayIcon sx={{ fontSize: 15, color: TABLE.inkFaint, flexShrink: 0 }} />
      <Typography
        variant="caption"
        sx={{
          fontFamily: FONT_DISPLAY,
          fontSize: '0.8rem',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: TABLE.inkSoft,
          flexShrink: 0,
        }}
      >
        {history.length} {history.length === 1 ? 'turn' : 'turns'}
      </Typography>

      <Box
        ref={rowRef}
        onScroll={event => {
          const row = event.currentTarget
          pinnedRef.current = row.scrollLeft + row.clientWidth >= row.scrollWidth - 8
        }}
        sx={{
          display: 'flex',
          gap: 0.5,
          alignItems: 'center',
          minWidth: 0,
          overflowX: 'auto',
          scrollbarWidth: 'thin',
          py: 0.25,
        }}
      >
        {history.map(record => {
          const index = view.players.findIndex(p => p.id === record.actorId)
          const color = getPlayerColor(index)
          const name = view.players[index]?.name ?? record.actorId
          return (
            <Tooltip key={record.key} title={tickTitle(name, record.turn, record.eventCount)}>
              <Box
                component="button"
                type="button"
                aria-label={tickTitle(name, record.turn, record.eventCount)}
                disabled={isAnimating}
                onClick={() => replayTurn(record.key)}
                sx={{
                  all: 'unset',
                  cursor: isAnimating ? 'default' : 'pointer',
                  opacity: isAnimating ? 0.4 : 1,
                  flexShrink: 0,
                  width: 26,
                  height: 16,
                  border: `1px solid ${color}`,
                  bgcolor: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: FONT_MONO,
                  fontSize: '0.7rem',
                  color,
                  // Hovered, the tick fills with the seat's colour: flat, like the name chips.
                  '&:hover': isAnimating ? {} : { bgcolor: color, color: TABLE.onSelected },
                  '&:focus-visible': { outline: `2px solid ${TABLE.accent}`, outlineOffset: 2 },
                }}
              >
                {record.turn}
              </Box>
            </Tooltip>
          )
        })}
      </Box>

      <Box sx={{ flex: 1 }} />

      <Typography
        variant="caption"
        sx={{
          fontFamily: FONT_DISPLAY,
          fontSize: '0.8rem',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: TABLE.inkSoft,
          flexShrink: 0,
        }}
      >
        Speed
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.25, flexShrink: 0 }}>
        {PLAYBACK_SPEEDS.map((option: PlaybackSpeed) => {
          const on = option === speed
          const title =
            option === 1 ? 'Turns play at reading pace' : `Turns play ${option} times faster`
          return (
            <Tooltip key={option} title={title}>
              <Box
                component="button"
                type="button"
                aria-pressed={on}
                aria-label={title}
                onClick={() => setSpeed(option)}
                sx={{
                  all: 'unset',
                  cursor: 'pointer',
                  px: 0.75,
                  py: 0.1,
                  fontFamily: FONT_MONO,
                  fontSize: '0.75rem',
                  border: `1px solid ${on ? TABLE.selected : TABLE.plateEdge}`,
                  color: on ? TABLE.onSelected : TABLE.inkSoft,
                  bgcolor: on ? TABLE.selected : 'transparent',
                  '&:hover': { borderColor: TABLE.ink },
                  '&:focus-visible': { outline: `2px solid ${TABLE.accent}`, outlineOffset: 2 },
                }}
              >
                {option}x
              </Box>
            </Tooltip>
          )
        })}
      </Box>
    </Box>
  )
}
