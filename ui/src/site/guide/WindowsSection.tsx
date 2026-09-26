/**
 * 09 · Orbital windows: when to travel, read off one number, the station
 * clock.
 *
 * The stations all step together, every planet is laid out the same and the
 * lanes ring the black hole in one order, so a trip's length depends on
 * little more than where the stations stand when you set off. The tables are
 * the game's own route planner asked for every reading (`windows.ts`), and
 * each rule of thumb is the best reading of its table, not a sentence
 * written beside it.
 */
import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import {
  BLACKHOLE_RINGS,
  BLACK_HOLE_OUTER_RING,
  COMPRESSED_JUMP_MASS,
  MAX_REACTION_MASS,
  PLANETS,
  STATION_INITIAL_SECTOR,
  STATION_RING,
  TANKER_FUEL,
  TRANSFER_ARC_LENGTH,
  WELL_TRANSFER_COSTS,
} from '@dangerous-inclinations/engine'
import { FONT_SANS } from '../../theme'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Body, Display } from '../poster'
import { GuideSection, SubHead } from './parts'
import type { Row } from './windows'
import {
  CIRCUIT,
  CIRCUIT_ORDER,
  CLOCK,
  OUTBOUND,
  PLANET_ARRIVE,
  PLANET_LEAVE,
  STATION_STEP,
  at,
  bestClocks,
  either,
  highest,
  lowest,
  nextClock,
  planetName,
  span,
  useWindowTables,
} from './windows'
import {
  CircuitDiagram,
  ClockStrip,
  Figure,
  LaneRingDiagram,
  StationClockDiagram,
} from './windowDiagrams'

const arcRange = (arc: { startSector: number; length: number }) =>
  span(arc.startSector, arc.startSector + arc.length - 1)

const CIRCUIT_NAMES = [...CIRCUIT_ORDER, CIRCUIT_ORDER[0]].map(planetName)
const ROUTES = CIRCUIT.map(([a, b]) => `${planetName(a)} → ${planetName(b)}`)
const DRIFT = BLACKHOLE_RINGS[BLACK_HOLE_OUTER_RING - 1].velocity

/** One hint: the words on the left, what to read on the right. */
function Block({ head, text, aside }: { head: ReactNode; text: ReactNode; aside: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1.05fr)' },
        columnGap: 5,
        rowGap: 3,
        alignItems: 'start',
        mb: { xs: 5, sm: 6 },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <SubHead>{head}</SubHead>
        <Box
          sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, '& b': { fontWeight: 700 } }}
        >
          {text}
        </Box>
      </Box>
      <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2.5, pt: { md: 1 } }}>
        {aside}
      </Box>
    </Box>
  )
}

/** The rule of thumb: a solid block, the rule in capitals and the reason under it. */
function Thumb({
  rule,
  children,
  tone = 'red',
}: {
  rule: ReactNode | null
  children?: ReactNode
  tone?: 'red' | 'ink'
}) {
  if (rule === null) {
    return (
      <Box
        sx={{
          border: `2px solid ${PRESS.inkFaint}`,
          px: 2.25,
          py: 1.75,
          maxWidth: '34ch',
          fontFamily: FONT_DISPLAY,
          fontSize: '1rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: PRESS.inkSoft,
        }}
      >
        Asking the route planner
      </Box>
    )
  }
  return (
    <Box
      sx={{
        bgcolor: tone === 'red' ? PRESS.red : PRESS.ink,
        color: PRESS.paper,
        px: 2.25,
        py: 1.75,
        maxWidth: '34ch',
      }}
    >
      <Display size="1.35rem" color={PRESS.paper} weight={600} sx={{ lineHeight: 1.15 }}>
        {rule}
      </Display>
      <Body size="0.92rem" color={PRESS.paper} sx={{ mt: 0.75 }}>
        {children}
      </Body>
    </Box>
  )
}

/** A range that must not break at its dash. */
function Nb({ children }: { children: ReactNode }) {
  return (
    <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
      {children}
    </Box>
  )
}

function P({ children }: { children: ReactNode }) {
  return <Body size="1rem">{children}</Body>
}

/** Which planet each ring-5 jump arc reaches, and its lane mouth. */
function LaneTable() {
  const head = {
    fontFamily: FONT_DISPLAY,
    fontWeight: 600,
    fontSize: '0.8rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: PRESS.inkSoft,
    pb: 0.75,
    borderBottom: `3px solid ${PRESS.ink}`,
  } as const
  const cell = {
    py: 0.75,
    borderBottom: `1px solid ${PRESS.inkFaint}`,
    fontFamily: FONT_SANS,
    fontSize: '0.98rem',
  } as const
  const num = { ...cell, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: '1.1rem' } as const
  return (
    <Box
      role="table"
      sx={{
        display: 'grid',
        gridTemplateColumns: 'auto auto auto',
        columnGap: 3,
        justifyContent: 'start',
        mt: 0.5,
      }}
    >
      <Box role="row" sx={{ display: 'contents' }}>
        <Box role="columnheader" sx={head}>
          To reach
        </Box>
        <Box role="columnheader" sx={head}>
          Jump from ring {BLACK_HOLE_OUTER_RING}
        </Box>
        <Box role="columnheader" sx={head}>
          Lane mouth
        </Box>
      </Box>
      {OUTBOUND.map(lane => (
        <Box role="row" key={lane.id} sx={{ display: 'contents' }}>
          <Box role="cell" sx={cell}>
            {planetName(lane.planetId)}
          </Box>
          <Box role="cell" sx={num}>
            {arcRange(lane.blackHoleArc)}
          </Box>
          <Box role="cell" sx={num}>
            {lane.blackHoleArc.startSector}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

/** "A round late the clock reads 8 and it takes 4; on 16 it takes 5." */
function lateness(row: Row, best: number): string {
  const next = nextClock(best)
  const worst = CLOCK.filter(clock => at(row, clock) === highest(row))
  const late = at(row, next)
  if (late === lowest(row)) return ''
  const tail =
    worst.includes(next) || worst.length === CLOCK.length
      ? ''
      : `; on ${either(worst)} it takes ${highest(row)}`
  return `A round late the clock reads ${next} and it takes ${late}${tail}.`
}

/** The clocks a compressor is quicker on, and by how much. */
function compressorSaves(plain: Row, compressed: Row): string {
  const quicker = CLOCK.filter(
    clock => (at(compressed, clock) ?? Infinity) < (at(plain, clock) ?? Infinity)
  )
  if (quicker.length === 0) return 'A fuel compressor changes nothing here.'
  const saved = quicker.map(clock => (at(plain, clock) ?? 0) - (at(compressed, clock) ?? 0))
  const by = saved.every(s => s === 1) ? 'saves a turn' : 'saves turns'
  return `A fuel compressor ${by} on ${either(quicker, 'and')}.`
}

export function WindowsSection() {
  const tables = useWindowTables()

  const approachBest = tables ? bestClocks(tables.approach) : []
  const tankerBest = tables ? bestClocks(tables.tanker) : []
  const legBest = tables ? bestClocks(tables.leg) : []
  const legCompressedBest = tables ? bestClocks(tables.legCompressed) : []
  const tankerOthers = tables
    ? CLOCK.filter(clock => !tankerBest.includes(clock)).map(clock => at(tables.tanker, clock))
    : []
  const othersNumbers = tankerOthers.filter((v): v is number => v !== null)
  const legTurns = tables ? span(lowest(tables.leg), highest(tables.leg)) : '?'

  return (
    <GuideSection
      id="windows"
      n={9}
      kicker="When to travel"
      title="Orbital windows"
      lede={
        <>
          The stations, the lanes and the rings all turn at fixed speeds, so some turns are simply
          better for a trip than others. All of it is read off one number: the station clock.
        </>
      }
    >
      <Block
        head="The station clock"
        text={
          <>
            <P>
              Every station starts on sector {STATION_INITIAL_SECTOR} of its planet&rsquo;s ring{' '}
              {STATION_RING} and steps <b>{STATION_STEP} sectors clockwise</b> at the end of every
              round. All three step together, so <b>every station is always on the same sector</b>.
            </P>
            <P>
              That sector is the clock. It only ever reads <b>{either(CLOCK)}</b>, and it comes
              round every {CLOCK.length} rounds.
            </P>
            <P>
              Every planet is laid out the same: you arrive from the black hole on ring{' '}
              {PLANET_ARRIVE.ring} at sectors <Nb>{arcRange(PLANET_ARRIVE)}</Nb>, and leave for it
              from ring {PLANET_LEAVE.ring} at sectors <Nb>{arcRange(PLANET_LEAVE)}</Nb>. So the
              same windows hold for{' '}
              {either(
                PLANETS.map(p => p.name),
                'and'
              )}
              .
            </P>
          </>
        }
        aside={
          <Figure
            caption={`Any planet from above, sector 0 at the top and clockwise the way ships drift. The red squares are the only ${CLOCK.length} places a station can be.`}
          >
            <StationClockDiagram />
          </Figure>
        }
      />

      <Block
        head={`Black hole ring ${BLACK_HOLE_OUTER_RING}`}
        text={
          <>
            <P>
              The black hole&rsquo;s outer ring is all lanes, one way, {TRANSFER_ARC_LENGTH} sectors
              each. Solid arcs are where you <b>jump out</b> to a planet; open arcs are where you{' '}
              <b>land</b> coming back.
            </P>
            <P>
              Every landing arc is followed clockwise by the next planet&rsquo;s jump arc, so the
              short way round the map is <b>{CIRCUIT_NAMES.join(' → ')}</b> (the red hops). Going
              the other way means crossing most of the ring, and the Deliver deck prints only the{' '}
              {CIRCUIT.length} routes that ride the circuit.
            </P>
            <LaneTable />
          </>
        }
        aside={
          <Figure caption="Sector 0 at the top, clockwise. The lane mouth is the first sector of a jump arc: the timings below count from reaching it.">
            <LaneRingDiagram />
          </Figure>
        }
      />

      <Block
        head="Hint 1 · Getting to a station"
        text={
          <>
            <Thumb
              rule={
                tables ? `Reach the lane mouth when the clock shows ${either(approachBest)}` : null
              }
            >
              {tables &&
                `Docked ${lowest(tables.approach)} turns later. ${lateness(tables.approach, approachBest[0])}`}
            </Thumb>
            <P>
              You drift through a jump arc at {DRIFT} sector{DRIFT === 1 ? '' : 's'} a turn, so you
              have a few turns on it to wait for a better clock before you jump.
            </P>
          </>
        }
        aside={
          <ClockStrip
            row={tables?.approach ?? null}
            label="Clock when you reach the lane mouth → turns until docked"
          />
        }
      />

      <Block
        head={`Hint 2 · Tanker: arrive with ${TANKER_FUEL}`}
        text={
          <>
            <Thumb
              tone="ink"
              rule={
                tables
                  ? `Leave the black hole with a full tank, reach the mouth on ${either(tankerBest)}`
                  : null
              }
            >
              {tables &&
                `You dock with ${TANKER_FUEL} aboard in ${lowest(tables.tanker)} turns.` +
                  (othersNumbers.length
                    ? ` On the other clocks it takes ${span(Math.min(...othersNumbers), Math.max(...othersNumbers))}.`
                    : '')}
            </Thumb>
            <P>
              Keeping {TANKER_FUEL} aboard costs turns: a full tank has only{' '}
              {MAX_REACTION_MASS - TANKER_FUEL} to spare, and a jump alone is{' '}
              {WELL_TRANSFER_COSTS.mass} fuel ({COMPRESSED_JUMP_MASS} with a compressor), so the
              routes that spend freely are out. The route planner finds the rest: set{' '}
              <b>Arrive with {TANKER_FUEL}</b>.
            </P>
            {tables && <P>{compressorSaves(tables.tanker, tables.tankerCompressed)}</P>}
          </>
        }
        aside={
          <>
            <ClockStrip row={tables?.tanker ?? null} label="Without a compressor" tone="ink" />
            <ClockStrip
              row={tables?.tankerCompressed ?? null}
              label="With a compressor"
              tone="ink"
            />
          </>
        }
      />

      <Block
        head="Hint 3 · Delivery: the second leg"
        text={
          <>
            <Thumb
              rule={
                tables
                  ? `Ride the circuit, and leave the pickup station on ${either(legBest)}`
                  : null
              }
            >
              {tables &&
                `${either(ROUTES, 'and')}: ${legTurns} turns, station to station, whenever you leave.`}
            </Thumb>
            <P>
              Moored, you ride the station round, so waiting for the clock costs nothing but turns.
              {tables &&
                ` With a compressor, leaving on ${either(legCompressedBest)} cuts the leg to ${lowest(tables.legCompressed)} turns.`}
            </P>
            <Figure
              caption={`The Deliver deck's ${CIRCUIT.length} routes: each one leg of the circuit.`}
            >
              <CircuitDiagram legTurns={legTurns} />
            </Figure>
          </>
        }
        aside={
          <>
            <ClockStrip
              row={tables?.leg ?? null}
              label="Clock when you leave → turns to the next station"
            />
            <ClockStrip row={tables?.legCompressed ?? null} label="With a compressor" />
          </>
        }
      />

      <Body size="0.88rem" color={PRESS.inkSoft} sx={{ maxWidth: '76ch' }}>
        Worked out on this page by the game&rsquo;s own route planner: the fewest turns from a full
        tank of {MAX_REACTION_MASS} with a working scoop, the stations stepping once a round. Hints
        1 and 2 count from reaching a lane mouth on black hole ring {BLACK_HOLE_OUTER_RING}; hint 3
        from moored at the pickup station. Only turns are kept down, not fuel. Every planet is built
        the same and the three circuit legs are one leg turned round, so {planetName(PLANETS[0].id)}{' '}
        and {ROUTES[0]} are worked out and hold for all of them.
      </Body>
    </GuideSection>
  )
}
