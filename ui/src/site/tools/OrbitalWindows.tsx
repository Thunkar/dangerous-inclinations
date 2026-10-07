/**
 * The orbital windows, at the foot of the route planner: when to travel, read
 * off one number, the station clock.
 *
 * The stations all step together and every planet is laid out the same, so a
 * trip's length depends on little more than where the stations stand when
 * you set off. The section says what the clock is and gives three hints, each
 * the best reading of a table the game's own route planner works out in the
 * browser (`windows.ts`), not a sentence written beside it. The planner above
 * sets the clock (`now`), and every strip marks that reading.
 */
import { useEffect, type ReactNode } from 'react'
import { Box } from '@mui/material'
import {
  PLANETS,
  STATION_INITIAL_SECTOR,
  STATION_RING,
  TANKER_FUEL,
  fill,
} from '@dangerous-inclinations/engine'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { SiteLink } from '../SiteLink'
import { Body, Display, Kicker } from '../poster'
import { SubHead } from '../guide/parts'
import { STATION_DRIFT } from '../turn'
import {
  CIRCUIT,
  CLOCK,
  PLANET_ARRIVE,
  PLANET_LEAVE,
  at,
  bestClocks,
  either,
  highest,
  lowest,
  planetName,
  span,
  useWindowTables,
} from './windows'
import { ClockStrip, Figure, StationClockDiagram } from './windowDiagrams'
import { WINDOWS as T } from '../../text/windows'
import { rich } from '../../utils/rich'

const arcRange = (arc: { startSector: number; length: number }) =>
  span(arc.startSector, arc.startSector + arc.length - 1)

const ROUTES = CIRCUIT.map(([a, b]) => fill(T.route, { from: planetName(a), to: planetName(b) }))

/** The section's head, under the planner: a heavy rule, then the page title's shape a size down. */
function SectionHead() {
  return (
    <Box sx={{ borderTop: `4px solid ${PRESS.ink}`, pt: { xs: 3, sm: 4 }, mb: { xs: 4, sm: 5 } }}>
      <Kicker>{T.kicker}</Kicker>
      <Display component="h2" size={{ xs: '2.2rem', sm: '3rem' }} sx={{ mt: 0.75 }}>
        {T.title}
      </Display>
      <Box sx={{ width: 96, height: 8, bgcolor: PRESS.red, mt: 2, mb: 2 }} />
      <Body size={{ xs: '1rem', sm: '1.08rem' }}>{T.lede}</Body>
    </Box>
  )
}

/** A heading over a part of the section. */
function Part({ children }: { children: ReactNode }) {
  return (
    <Display component="h3" size={{ xs: '1.9rem', sm: '2.4rem' }} sx={{ mb: { xs: 2, sm: 3 } }}>
      {children}
    </Display>
  )
}

/** The words on the left, what to read on the right. */
function Block({ head, text, aside }: { head?: ReactNode; text: ReactNode; aside: ReactNode }) {
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
        {head && <SubHead>{head}</SubHead>}
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

/** A hint's heading: its number in red, then its title. */
function HintHead({ n, children }: { n: number; children: ReactNode }) {
  return (
    <>
      <Box component="span" sx={{ color: PRESS.red, fontWeight: 700, mr: 1.25 }}>
        {String(n).padStart(2, '0')}
      </Box>
      {children}
    </>
  )
}

/** The hint itself: a solid block, the rule in capitals and the reason under it. */
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

/** `<nb>` for a range that must not break at its dash, `<link>` for the route planner. */
const TAGS = {
  nb: (text: ReactNode) => (
    <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
      {text}
    </Box>
  ),
  link: (text: ReactNode) => (
    <SiteLink
      to={{ kind: 'tools', tool: 'route' }}
      sx={{ color: PRESS.redText, textDecoration: 'underline', '&:hover': { color: PRESS.ink } }}
    >
      {text}
    </SiteLink>
  ),
}

function P({ children }: { children: ReactNode }) {
  return <Body size="1rem">{children}</Body>
}

/** Where a link to the windows lands: the route planner's address with this hash. */
export const WINDOWS_ANCHOR = 'windows'

/**
 * The orbital windows section. `now` is the station clock's reading the
 * planner is set to, marked on every strip.
 */
export function OrbitalWindows({ now }: { now: number }) {
  const tables = useWindowTables()

  // A link from elsewhere (the rules dialog) arrives with the hash before the
  // section has rendered, so the browser had nothing to scroll to.
  useEffect(() => {
    if (window.location.hash === `#${WINDOWS_ANCHOR}`) {
      document.getElementById(WINDOWS_ANCHOR)?.scrollIntoView()
    }
  }, [])

  const approachBest = tables ? bestClocks(tables.approach) : []
  const tankerBest = tables ? bestClocks(tables.tanker) : []
  const legBest = tables ? bestClocks(tables.leg) : []
  const tankerOthers = tables
    ? CLOCK.filter(clock => !tankerBest.includes(clock))
        .map(clock => at(tables.tanker, clock))
        .filter((v): v is number => v !== null)
    : []
  const legTurns = tables ? span(lowest(tables.leg), highest(tables.leg)) : '?'

  return (
    <Box
      component="section"
      id={WINDOWS_ANCHOR}
      // Clear of the sticky site bar when a link lands here.
      sx={{ mt: { xs: 5, sm: 7 }, scrollMarginTop: { xs: 64, sm: 72 } }}
    >
      <SectionHead />

      <Part>{T.clock.title}</Part>
      <Block
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
          <Figure>
            <StationClockDiagram />
          </Figure>
        }
      />

      <Part>{T.hints}</Part>
      <Block
        head={<HintHead n={1}>{T.approach.title}</HintHead>}
        text={
          <Thumb rule={tables ? fill(T.approach.rule, { readings: either(approachBest) }) : null}>
            {tables && fill(T.approach.reason, { turns: lowest(tables.approach) })}
          </Thumb>
        }
        aside={<ClockStrip row={tables?.approach ?? null} now={now} label={T.approach.strip} />}
      />

      <Block
        head={<HintHead n={2}>{fill(T.tanker.title, { fuel: TANKER_FUEL })}</HintHead>}
        text={
          <>
            <Thumb
              tone="ink"
              rule={tables ? fill(T.tanker.rule, { readings: either(tankerBest) }) : null}
            >
              {tables &&
                fill(T.tanker.reason, { fuel: TANKER_FUEL, turns: lowest(tables.tanker) }) +
                  (tankerOthers.length
                    ? fill(T.tanker.others, {
                        turns: span(Math.min(...tankerOthers), Math.max(...tankerOthers)),
                      })
                    : '')}
            </Thumb>
            <P>{rich(T.tanker.planner, { fuel: TANKER_FUEL }, TAGS)}</P>
          </>
        }
        aside={
          <>
            <ClockStrip row={tables?.tanker ?? null} now={now} label={T.tanker.plain} tone="ink" />
            <ClockStrip
              row={tables?.tankerCompressed ?? null}
              now={now}
              label={T.tanker.compressed}
              tone="ink"
            />
          </>
        }
      />

      <Block
        head={<HintHead n={3}>{T.leg.title}</HintHead>}
        text={
          <Thumb rule={tables ? fill(T.leg.rule, { readings: either(legBest) }) : null}>
            {tables && fill(T.leg.reason, { routes: either(ROUTES, 'and'), turns: legTurns })}
          </Thumb>
        }
        aside={<ClockStrip row={tables?.leg ?? null} now={now} label={T.leg.strip} />}
      />
    </Box>
  )
}
