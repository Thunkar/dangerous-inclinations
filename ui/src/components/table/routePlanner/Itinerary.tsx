import { Box, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import RotateRightIcon from '@mui/icons-material/RotateRight'
import type { MovementPlan } from '@dangerous-inclinations/engine'
import { fill } from '@dangerous-inclinations/engine'
import { placeLabel, routeLegs } from '../../../utils/route'
import { SectionLabel } from '../../common/Panel'
import { FONT_MONO } from '../../../theme'
import { TABLE } from '../../../design/tokens'
import { ROUTE, ROUTE_FAINT, T } from './style'

/** Turns of a route shown before the list folds into "+n more". */
const ITINERARY_LIMIT = 6

/**
 * The chosen route, turn by turn, on a dotted rail that repeats the one drawn
 * across the board. The first turn is lit; everything after it is a later
 * turn, and dimmed to say so.
 */
export function Itinerary({ route, taken }: { route: MovementPlan; taken: boolean }) {
  const legs = routeLegs(route.steps)
  const shown = legs.slice(0, ITINERARY_LIMIT)
  const hidden = legs.length - shown.length

  return (
    <Box sx={{ minWidth: 0 }}>
      <SectionLabel sx={{ lineHeight: 1.3, pl: 0.6 }}>{T.itinerary}</SectionLabel>
      <Box sx={{ position: 'relative', pl: 0.6, minWidth: 0 }}>
        {/* the rail: the board's dotted track, stood on end */}
        <Box
          sx={{
            position: 'absolute',
            left: 12,
            top: 9,
            bottom: 9,
            borderLeft: `1px solid ${ROUTE_FAINT}`,
          }}
        />
        {shown.map((leg, i) => (
          <LegRow
            key={i}
            index={i + 1}
            text={leg.text}
            rotate={leg.rotate}
            now={i === 0}
            taken={taken && i === 0}
          />
        ))}
        {hidden > 0 && (
          <LegRow
            index={null}
            text={fill(hidden > 1 ? T.hidden.many : T.hidden.one, { count: hidden })}
            now={false}
          />
        )}
        <LegRow
          index={T.mark}
          text={fill(T.arrive, { place: placeLabel(route.destination) })}
          now={false}
          arrival
        />
      </Box>
    </Box>
  )
}

function LegRow({
  index,
  text,
  rotate,
  now,
  taken,
  arrival,
}: {
  index: number | string | null
  text: string
  rotate?: boolean
  now: boolean
  taken?: boolean
  arrival?: boolean
}) {
  const colour = arrival ? ROUTE : now ? TABLE.ink : TABLE.inkFaint
  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 0.45,
        minWidth: 0,
        py: 0.18,
        pr: 0.5,
      }}
    >
      <Box
        sx={{
          width: 16,
          height: 16,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border:
            index === null || arrival ? 'none' : `1px solid ${now ? TABLE.accent : ROUTE_FAINT}`,
          bgcolor: taken ? TABLE.selected : arrival ? 'transparent' : TABLE.plateSunk,
          color: taken ? TABLE.onSelected : now ? TABLE.accent : arrival ? ROUTE : TABLE.inkFaint,
          fontFamily: FONT_MONO,
          fontSize: arrival ? '0.85rem' : '0.72rem',
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {taken ? <CheckIcon sx={{ fontSize: 12 }} /> : index}
      </Box>
      {rotate && (
        <RotateRightIcon
          titleAccess={T.rotateFirst}
          sx={{ fontSize: 13, color: colour, flexShrink: 0, opacity: now ? 1 : 0.8 }}
        />
      )}
      <Typography
        sx={{
          fontFamily: FONT_MONO,
          fontSize: '0.74rem',
          fontWeight: now ? 700 : 400,
          color: colour,
          lineHeight: 1.35,
          flex: 1,
          minWidth: 0,
        }}
        noWrap
      >
        {text}
      </Typography>
      {now && (
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontSize: '0.72rem',
            letterSpacing: '0.08em',
            color: TABLE.accent,
            flexShrink: 0,
            ml: 0.5,
            opacity: 0.85,
          }}
        >
          {T.thisTurn}
        </Typography>
      )}
    </Box>
  )
}
