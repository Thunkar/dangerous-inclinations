/**
 * The turn log, kept at the left edge of the table like a score pad. Every
 * line is an engine event run through `describeEvent` — the same text the
 * simulator and the replay use.
 *
 * It sits at the foot of the left column and takes whatever height is left
 * over, scrolling inside itself; the table never has to be scrolled to read
 * it.
 */
import { useEffect, useMemo, useRef } from 'react'
import { Box, Typography } from '@mui/material'
import type { GameEvent } from '@dangerous-inclinations/engine'
import { describeEvent } from '@dangerous-inclinations/engine'
import { useGame } from '../../context/GameContext'
import { getPlayerColor } from '../../utils/playerColors'
import { TABLE } from '../../theme'
import { Panel } from '../common/Panel'

/** Whose line is this? Used only to colour the bullet. */
function actorOf(event: GameEvent): string | undefined {
  if ('playerId' in event) return event.playerId
  if ('attackerId' in event) return event.attackerId
  if ('ownerId' in event) return event.ownerId
  if ('scannerId' in event) return event.scannerId
  if ('victimId' in event) return event.victimId
  if ('winnerId' in event) return event.winnerId
  return undefined
}

export function EventLog() {
  const { log, view, nameOf } = useGame()
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const colorOf = useMemo(() => {
    const index = new Map(view.players.map((p, i) => [p.id, i]))
    return (playerId?: string) => (playerId ? getPlayerColor(index.get(playerId) ?? -1) : TABLE.inkSoft)
  }, [view.players])

  // Stick to the newest line. Scrolling the pad itself, rather than calling
  // scrollIntoView, keeps the table from ever being scrolled.
  useEffect(() => {
    const pad = scrollRef.current
    if (pad) pad.scrollTop = pad.scrollHeight
  }, [log.length])

  let lastTurn = -1

  return (
    <Panel title="Turn log" dense sx={{ flex: '1 1 0', minHeight: 120, minWidth: 0 }}>
      <Box ref={scrollRef} data-testid="turn-log" sx={{ height: '100%', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pr: 0.5 }}>
        {log.length === 0 && (
          <Typography variant="caption" sx={{ color: TABLE.inkFaint }}>
            Nothing has happened yet.
          </Typography>
        )}
        {log.map((event, i) => {
          const showTurn = event.turn !== lastTurn
          lastTurn = event.turn
          const actor = actorOf(event)
          return (
            <Box key={`${event.turn}-${i}`} sx={{ minWidth: 0 }}>
              {showTurn && (
                <Typography
                  variant="overline"
                  sx={{ color: TABLE.accent, display: 'block', mt: i === 0 ? 0 : 0.75, lineHeight: 1.7 }}
                >
                  Turn {event.turn}
                </Typography>
              )}
              <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start', minWidth: 0 }}>
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: colorOf(actor),
                    mt: '5px',
                    flexShrink: 0,
                  }}
                />
                <Typography
                  sx={{ fontSize: '0.8rem', color: TABLE.inkSoft, lineHeight: 1.35, minWidth: 0, overflowWrap: 'anywhere' }}
                >
                  {describeEvent(event, nameOf)}
                </Typography>
              </Box>
            </Box>
          )
        })}
      </Box>
    </Panel>
  )
}
