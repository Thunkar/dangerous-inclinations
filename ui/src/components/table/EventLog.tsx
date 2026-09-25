/**
 * The turn log, kept at the left edge of the table like a score pad. Every
 * line is an engine event run through `describeEvent`: the same text the
 * simulator and the replay use.
 *
 * It sits at the foot of the left column and takes whatever height is left
 * over, scrolling inside itself; the table never has to be scrolled to read
 * it.
 */
import { memo, useEffect, useMemo, useRef } from 'react'
import { Box, Typography } from '@mui/material'

import { describeEvent, type GameEvent } from '@dangerous-inclinations/engine'
import { useGame } from '../../context/GameContext'
import { actorOf, concerns } from './eventLogModel'
import { getPlayerColor } from '../../utils/playerColors'
import { TABLE } from '../../theme'
import { Panel } from '../common/Panel'

export function EventLog() {
  const { log, view, nameOf } = useGame()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const mine = view.me?.id
  const lines = log

  const colorOf = useMemo(() => {
    const index = new Map(view.players.map((p, i) => [p.id, i]))
    return (playerId?: string) =>
      playerId ? getPlayerColor(index.get(playerId) ?? -1) : TABLE.inkSoft
  }, [view.players])

  // Stick to the newest line. Scrolling the pad itself, rather than calling
  // scrollIntoView, keeps the table from ever being scrolled.
  useEffect(() => {
    const pad = scrollRef.current
    if (pad) pad.scrollTop = pad.scrollHeight
  }, [lines.length])

  /*
   * `nameOf` is rebuilt with every view, and names do not change with the view:
   * a line keyed on the function would re-render the whole log on every commit.
   * Keyed on the names themselves, it re-renders when one does.
   */
  const names = view.players.map(p => `${p.id}:${p.name}`).join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableNameOf = useMemo(() => nameOf, [names])

  let lastTurn = -1

  return (
    <Panel
      title="Turn log"
      dense
      collapseId="turn-log"
      summary={`${lines.length}`}
      sx={{ flex: '1 1 0', minHeight: 120, minWidth: 0 }}
    >
      <Box
        ref={scrollRef}
        data-testid="turn-log"
        sx={{ height: '100%', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pr: 0.5 }}
      >
        {lines.length === 0 && (
          <Typography variant="caption" sx={{ color: TABLE.inkFaint }}>
            Nothing has happened yet.
          </Typography>
        )}
        {lines.map((event, i) => {
          const showTurn = event.turn !== lastTurn
          lastTurn = event.turn
          const mineLine = concerns(event, mine)
          return (
            <LogLine
              key={`${event.turn}-${i}`}
              event={event}
              first={i === 0}
              showTurn={showTurn}
              mineColor={mineLine ? colorOf(mine) : null}
              actorColor={colorOf(actorOf(event))}
              nameOf={stableNameOf}
            />
          )
        })}
      </Box>
    </Panel>
  )
}

/**
 * One line of the log. Memoised on plain values: the log holds every event of
 * the game, and the table re-renders it on every view it commits, so a line
 * that has not changed must cost nothing to pass over.
 */
const LogLine = memo(function LogLine({
  event,
  first,
  showTurn,
  mineColor,
  actorColor,
  nameOf,
}: {
  event: GameEvent
  first: boolean
  showTurn: boolean
  /** The seat's colour when the line is about you, else null. */
  mineColor: string | null
  actorColor: string
  nameOf: (playerId: string) => string
}) {
  const mineLine = mineColor !== null
  return (
    <Box
      sx={{
        minWidth: 0,
        ...(mineLine
          ? {
              borderLeft: `2px solid ${mineColor}`,
              pl: 0.5,
              ml: '-2px',
              bgcolor: TABLE.hover,
            }
          : {}),
      }}
    >
      {showTurn && (
        <Typography
          variant="overline"
          sx={{ color: TABLE.accent, display: 'block', mt: first ? 0 : 0.75, lineHeight: 1.7 }}
        >
          Turn {event.turn}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start', minWidth: 0 }}>
        <Box
          sx={{
            width: 7,
            height: 7,
            bgcolor: actorColor,
            mt: '7px',
            flexShrink: 0,
          }}
        />
        <Typography
          sx={{
            fontSize: '0.875rem',
            color: mineLine ? TABLE.ink : TABLE.inkSoft,
            fontWeight: mineLine ? 600 : 400,
            lineHeight: 1.35,
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {describeEvent(event, nameOf)}
        </Typography>
      </Box>
    </Box>
  )
})
