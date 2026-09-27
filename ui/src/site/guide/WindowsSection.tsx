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
  fill,
} from '@dangerous-inclinations/engine'
import { FONT_SANS } from '../../theme'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Body, Display } from '../poster'
import { GuideSection, SubHead } from './parts'
import type { Row } from './windows'
import { STATION_DRIFT } from '../turn'
import {
  CIRCUIT,
  CIRCUIT_ORDER,
  CLOCK,
  OUTBOUND,
  PLANET_ARRIVE,
  PLANET_LEAVE,
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
import { CHEATSHEET } from '../../text/cheatsheet'
import { rich } from '../../utils/rich'

const T = CHEATSHEET.windows

const arcRange = (arc: { startSector: number; length: number }) =>
  span(arc.startSector, arc.startSector + arc.length - 1)

const CIRCUIT_NAMES = [...CIRCUIT_ORDER, CIRCUIT_ORDER[0]].map(planetName)
const ROUTES = CIRCUIT.map(([a, b]) => fill(T.route, { from: planetName(a), to: planetName(b) }))
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
        {T.working}
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

/** The cheatsheet's tags, and `<nb>` for a range that must not break. */
const TAGS = { nb: (text: ReactNode) => <Nb>{text}</Nb> }

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
          {T.lanes.table.planet}
        </Box>
        <Box role="columnheader" sx={head}>
          {rich(T.lanes.table.arc, { ring: BLACK_HOLE_OUTER_RING })}
        </Box>
        <Box role="columnheader" sx={head}>
          {T.lanes.table.mouth}
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
      : fill(T.lateWorst, { readings: either(worst), turns: highest(row) })
  return fill(T.late, { reading: next, turns: late, worst: tail })
}

/** The clocks a compressor is quicker on, and by how much. */
function compressorSaves(plain: Row, compressed: Row): string {
  const quicker = CLOCK.filter(
    clock => (at(compressed, clock) ?? Infinity) < (at(plain, clock) ?? Infinity)
  )
  if (quicker.length === 0) return T.compressor.nothing
  const saved = quicker.map(clock => (at(plain, clock) ?? 0) - (at(compressed, clock) ?? 0))
  const by = saved.every(s => s === 1) ? T.compressor.aTurn : T.compressor.turns
  return fill(T.compressor.saves, { by, readings: either(quicker, 'and') })
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
    <GuideSection id="windows" n={9} kicker={T.kicker} title={T.title} lede={T.lede}>
      <Block
        head={T.clock.title}
        text={
          <>
            <P>
              {rich(T.clock.steps, {
                sector: STATION_INITIAL_SECTOR,
                ring: STATION_RING,
                drift: STATION_DRIFT,
              })}
            </P>
            <P>{rich(T.clock.reads, { readings: either(CLOCK), rounds: CLOCK.length })}</P>
            <P>
              {rich(
                T.clock.planets,
                {
                  arriveRing: PLANET_ARRIVE.ring,
                  arriveSectors: arcRange(PLANET_ARRIVE),
                  leaveRing: PLANET_LEAVE.ring,
                  leaveSectors: arcRange(PLANET_LEAVE),
                  planets: either(
                    PLANETS.map(p => p.name),
                    'and'
                  ),
                },
                TAGS
              )}
            </P>
          </>
        }
        aside={
          <Figure caption={fill(T.clock.caption, { places: CLOCK.length })}>
            <StationClockDiagram />
          </Figure>
        }
      />

      <Block
        head={fill(T.lanes.title, { ring: BLACK_HOLE_OUTER_RING })}
        text={
          <>
            <P>{rich(T.lanes.arcs, { sectors: TRANSFER_ARC_LENGTH })}</P>
            <P>
              {rich(T.lanes.circuit, {
                circuit: CIRCUIT_NAMES.join(' → '),
                routes: CIRCUIT.length,
              })}
            </P>
            <LaneTable />
          </>
        }
        aside={
          <Figure caption={T.lanes.caption}>
            <LaneRingDiagram />
          </Figure>
        }
      />

      <Block
        head={T.approach.title}
        text={
          <>
            <Thumb rule={tables ? fill(T.approach.rule, { readings: either(approachBest) }) : null}>
              {tables &&
                fill(T.approach.reason, {
                  turns: lowest(tables.approach),
                  late: lateness(tables.approach, approachBest[0]),
                })}
            </Thumb>
            <P>
              {rich(T.approach.drift, {
                sectors: DRIFT,
                plural: DRIFT === 1 ? '' : T.approach.plural,
              })}
            </P>
          </>
        }
        aside={<ClockStrip row={tables?.approach ?? null} label={T.approach.strip} />}
      />

      <Block
        head={fill(T.tanker.title, { fuel: TANKER_FUEL })}
        text={
          <>
            <Thumb
              tone="ink"
              rule={tables ? fill(T.tanker.rule, { readings: either(tankerBest) }) : null}
            >
              {tables &&
                fill(T.tanker.reason, { fuel: TANKER_FUEL, turns: lowest(tables.tanker) }) +
                  (othersNumbers.length
                    ? fill(T.tanker.others, {
                        turns: span(Math.min(...othersNumbers), Math.max(...othersNumbers)),
                      })
                    : '')}
            </Thumb>
            <P>
              {rich(T.tanker.cost, {
                fuel: TANKER_FUEL,
                spare: MAX_REACTION_MASS - TANKER_FUEL,
                jump: WELL_TRANSFER_COSTS.mass,
                compressed: COMPRESSED_JUMP_MASS,
              })}
            </P>
            {tables && <P>{compressorSaves(tables.tanker, tables.tankerCompressed)}</P>}
          </>
        }
        aside={
          <>
            <ClockStrip row={tables?.tanker ?? null} label={T.tanker.plain} tone="ink" />
            <ClockStrip
              row={tables?.tankerCompressed ?? null}
              label={T.tanker.compressed}
              tone="ink"
            />
          </>
        }
      />

      <Block
        head={T.leg.title}
        text={
          <>
            <Thumb rule={tables ? fill(T.leg.rule, { readings: either(legBest) }) : null}>
              {tables && fill(T.leg.reason, { routes: either(ROUTES, 'and'), turns: legTurns })}
            </Thumb>
            <P>
              {T.leg.moored}
              {tables &&
                fill(T.leg.compressed, {
                  readings: either(legCompressedBest),
                  turns: lowest(tables.legCompressed),
                })}
            </P>
            <Figure caption={fill(T.leg.caption, { routes: CIRCUIT.length })}>
              <CircuitDiagram legTurns={legTurns} />
            </Figure>
          </>
        }
        aside={
          <>
            <ClockStrip row={tables?.leg ?? null} label={T.leg.strip} />
            <ClockStrip row={tables?.legCompressed ?? null} label={T.leg.stripCompressed} />
          </>
        }
      />

      <Body size="0.88rem" color={PRESS.inkSoft} sx={{ maxWidth: '76ch' }}>
        {rich(T.foot, {
          fullTank: MAX_REACTION_MASS,
          ring: BLACK_HOLE_OUTER_RING,
          planet: planetName(PLANETS[0].id),
          route: ROUTES[0],
        })}
      </Body>
    </GuideSection>
  )
}
