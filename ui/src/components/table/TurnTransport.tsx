/**
 * The transport: the last few player-turns as ticks, and how fast they play.
 *
 * A table with bots runs several turns between two of yours, and the log says
 * what happened without showing you where it happened. A tick replays one of
 * those turns over the board — the same animation, from the same pair of
 * views, committing nothing — so a volley you missed can be watched again
 * without touching the game.
 *
 * The speed sits here because it is the same question: how fast somebody
 * else's turn should go past. It divides every beat and every mark's life
 * (`AnimationContext`), and it is remembered per browser.
 */
import { Box, Tooltip, Typography } from '@mui/material'
import ReplayIcon from '@mui/icons-material/Replay'
import { useGame } from '../../context/GameContext'
import { PLAYBACK_SPEEDS, useAnimation, type PlaybackSpeed } from '../../context/AnimationContext'
import { getPlayerColor } from '../../utils/playerColors'
import { FONT_MONO, TABLE } from '../../theme'

/** What one tick says when you hover it. */
function tickTitle(name: string, turn: number, lines: number): string {
  return `Replay ${name}'s turn (round ${turn}, ${lines} ${lines === 1 ? 'event' : 'events'})`
}

export function TurnTransport() {
  const { history, replayTurn, isAnimating, view } = useGame()
  const { speed, setSpeed } = useAnimation()

  if (history.length === 0) return null

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
        borderTop: `1px solid ${TABLE.line}`,
        background: `linear-gradient(0deg, ${TABLE.feltLight} 0%, rgba(0,0,0,0) 100%)`,
      }}
    >
      <ReplayIcon sx={{ fontSize: 15, color: TABLE.inkFaint, flexShrink: 0 }} />
      <Typography
        variant="caption"
        sx={{
          fontFamily: FONT_MONO,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: TABLE.inkFaint,
          flexShrink: 0,
        }}
      >
        Last {history.length}
      </Typography>

      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', minWidth: 0, overflowX: 'auto' }}>
        {history.map(record => {
          const index = view.players.findIndex(p => p.id === record.actorId)
          const color = getPlayerColor(index)
          const name = view.players[index]?.name ?? record.actorId
          return (
            <Tooltip key={record.id} title={tickTitle(name, record.turn, record.events.length)}>
              <Box
                component="button"
                type="button"
                aria-label={tickTitle(name, record.turn, record.events.length)}
                disabled={isAnimating}
                onClick={() => replayTurn(record.id)}
                sx={{
                  all: 'unset',
                  cursor: isAnimating ? 'default' : 'pointer',
                  opacity: isAnimating ? 0.4 : 1,
                  flexShrink: 0,
                  width: 26,
                  height: 16,
                  borderRadius: 0.5,
                  border: `1px solid ${color}`,
                  bgcolor: `${color}22`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: FONT_MONO,
                  fontSize: '0.62rem',
                  color,
                  '&:hover': isAnimating ? {} : { bgcolor: `${color}55`, boxShadow: `0 0 8px ${color}55` },
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
          fontFamily: FONT_MONO,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: TABLE.inkFaint,
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
                  borderRadius: 0.5,
                  fontFamily: FONT_MONO,
                  fontSize: '0.7rem',
                  border: `1px solid ${on ? TABLE.accent : TABLE.plateEdge}`,
                  color: on ? TABLE.accent : TABLE.inkSoft,
                  bgcolor: on ? '#ddaa7814' : 'transparent',
                  '&:hover': { borderColor: TABLE.accent },
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
