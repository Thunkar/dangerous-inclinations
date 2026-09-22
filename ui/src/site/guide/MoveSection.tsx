/**
 * 04 · Moving: the drift, the one move a turn, and what each costs.
 *
 * The ring ladder is the board's speeds read off the engine's ring configs,
 * with the rings the rules single out named under them, so a player learns
 * the map's landmarks along with its numbers.
 */
import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import type { RingConfig } from '@dangerous-inclinations/engine'
import {
  BLACKHOLE_RINGS,
  BLACK_HOLE_OUTER_RING,
  BURN_COSTS,
  COMPRESSED_JUMP_MASS,
  HOME_RINGS,
  MAX_SECTOR_ADJUSTMENT,
  PLANET_OUTER_RING,
  PLANET_RINGS,
  STATION_RING,
  SUBSYSTEM_CONFIGS,
  SURVEY_RING,
  WELL_TRANSFER_COSTS,
} from '@dangerous-inclinations/engine'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Body, Display, Slab } from '../poster'
import { STATION_DRIFT } from '../turn'
import { phasingStrip } from '../numbers'
import { GuideSection, Points, SubHead } from './parts'
import { BurnDiagram, CoastDiagram, JumpDiagram } from './moveDiagrams'

const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`)

function landmarks(well: 'hole' | 'planet', ring: number): string | null {
  if (well === 'hole') {
    if (ring === SURVEY_RING) return 'Survey'
    if ((HOME_RINGS as readonly number[]).includes(ring)) return 'Home'
    if (ring === BLACK_HOLE_OUTER_RING) return 'Lanes'
    return null
  }
  if (ring === STATION_RING) return 'Station'
  if (ring === STATION_RING - 1) return 'Catch it'
  if (ring === PLANET_OUTER_RING) return 'Lanes'
  return null
}

function Ladder({
  title,
  rings,
  well,
}: {
  title: string
  rings: RingConfig[]
  well: 'hole' | 'planet'
}) {
  return (
    <Box>
      <Box
        sx={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          fontSize: '0.95rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          mb: 0.75,
        }}
      >
        {title}
      </Box>
      <Box sx={{ display: 'flex', gap: '4px' }}>
        {rings.map(ring => {
          const mark = landmarks(well, ring.ring)
          return (
            <Box key={ring.ring} sx={{ width: 62, flexShrink: 0 }}>
              <Box
                sx={{
                  height: 62,
                  bgcolor: PRESS.ink,
                  color: PRESS.paper,
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Box
                  component="span"
                  sx={{
                    position: 'absolute',
                    top: 4,
                    left: 6,
                    fontFamily: FONT_DISPLAY,
                    fontSize: '0.75rem',
                    letterSpacing: '0.08em',
                    color: PRESS.paperSoft,
                  }}
                >
                  R{ring.ring}
                </Box>
                <Box
                  component="span"
                  sx={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 700,
                    fontSize: '2rem',
                    lineHeight: 1,
                    mt: 1,
                  }}
                >
                  {ring.velocity}
                </Box>
              </Box>
              <Box
                sx={{
                  minHeight: 20,
                  mt: 0.5,
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 600,
                  fontSize: '0.78rem',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: PRESS.redText,
                  textAlign: 'center',
                }}
              >
                {mark}
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

/** What a move costs, as two stamped figures. */
function Cost({ fuel, energy }: { fuel: string; energy: string }) {
  const cell = (label: string, value: string, red: boolean) => (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 0.75,
        px: 1.25,
        py: 0.5,
        bgcolor: red ? PRESS.red : PRESS.ink,
        color: PRESS.paper,
        fontFamily: FONT_DISPLAY,
        textTransform: 'uppercase',
      }}
    >
      <Box component="span" sx={{ fontSize: '0.78rem', letterSpacing: '0.1em', fontWeight: 500 }}>
        {label}
      </Box>
      <Box component="span" sx={{ fontSize: '1.3rem', fontWeight: 700 }}>
        {value}
      </Box>
    </Box>
  )
  return (
    <Box sx={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {cell('fuel', fuel, false)}
      {cell('energy', energy, true)}
    </Box>
  )
}

function Move({
  title,
  diagram,
  fuel,
  energy,
  children,
}: {
  title: string
  diagram: ReactNode
  fuel: string
  energy: string
  children: ReactNode
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
      <Box sx={{ border: `4px solid ${PRESS.ink}`, p: 1.5, bgcolor: PRESS.paper }}>{diagram}</Box>
      <Display size="2rem" component="h3">
        {title}
      </Display>
      <Cost fuel={fuel} energy={energy} />
      <Body size="0.96rem">{children}</Body>
    </Box>
  )
}

/** The ring a phasing example is drawn on: the black hole's ring 3, whose speed is 4. */
const PHASE_EXAMPLE = BLACKHOLE_RINGS[2]

/**
 * Phasing, drawn instead of stated: the sectors a burn can land on, counted
 * from where the ship started, with the fuel each one costs. The formula in
 * the rules is exactly this strip.
 */
function PhaseStrip() {
  const strip = phasingStrip(PHASE_EXAMPLE.velocity)
  const cellSx = {
    height: 64,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0.25,
    fontFamily: FONT_DISPLAY,
    textTransform: 'uppercase',
  } as const
  return (
    <Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${strip.length + 1}, minmax(0, 1fr))`,
          gap: '4px',
          maxWidth: 620,
        }}
      >
        <Box sx={{ ...cellSx, border: `3px dashed ${PRESS.ink}` }}>
          <svg width={26} height={20} viewBox="0 0 26 20" aria-hidden focusable="false">
            <path d="M26 10L0 0v20z" fill={PRESS.ink} />
          </svg>
          <Box component="span" sx={{ fontSize: '0.72rem', letterSpacing: '0.08em' }}>
            start
          </Box>
        </Box>
        {strip.map(({ sector, fuel }) => (
          <Box
            key={sector}
            sx={{
              ...cellSx,
              bgcolor: fuel === 0 ? PRESS.ink : PRESS.red,
              color: PRESS.paper,
            }}
          >
            <Box component="span" sx={{ fontSize: '1.6rem', fontWeight: 700, lineHeight: 1 }}>
              {fuel}
            </Box>
            <Box component="span" sx={{ fontSize: '0.7rem', letterSpacing: '0.08em' }}>
              {fuel === 0 ? 'drift' : 'fuel'}
            </Box>
          </Box>
        ))}
      </Box>
      <Body size="0.92rem" color={PRESS.inkSoft} sx={{ mt: 1 }}>
        A burn on a ring of speed {PHASE_EXAMPLE.velocity}. The drift is free; each sector short or
        long is 1 fuel, up to {MAX_SECTOR_ADJUSTMENT} long and never back onto your start.
      </Body>
    </Box>
  )
}

const soft = BURN_COSTS.soft
const hard = BURN_COSTS.hard
const scoopEnergy = SUBSYSTEM_CONFIGS.scoop.minEnergy
const rotateEnergy = SUBSYSTEM_CONFIGS.rotation.minEnergy
const [catchUp, station] = [PLANET_RINGS[STATION_RING - 2], PLANET_RINGS[STATION_RING - 1]]

export function MoveSection() {
  return (
    <GuideSection
      id="move"
      n={4}
      kicker="Getting somewhere"
      title="Drift first, then burn"
      lede="Every turn your ring carries you forward. Your one move is what you do about it."
    >
      <Box
        sx={{
          display: 'grid',
          gap: { xs: 3, md: 5 },
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          mb: 5,
          alignItems: 'start',
        }}
      >
        <Points
          items={[
            <>
              Every ship <b>drifts</b> forward by its ring&rsquo;s speed. Inner rings are faster.
            </>,
            <>
              <b>One move</b> a turn: coast, burn or jump. No move is a coast.
            </>,
            <>
              <b>Rotate</b> to flip your facing: {rotateEnergy} energy, and it is not your move.
            </>,
          ]}
        />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, overflowX: 'auto' }}>
          <Ladder title="Black hole · ring speeds" rings={BLACKHOLE_RINGS} well="hole" />
          <Ladder title="Each planet · ring speeds" rings={PLANET_RINGS} well="planet" />
        </Box>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: { xs: 4, md: 3.5 },
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          mb: 5,
        }}
      >
        <Move title="Coast" diagram={<CoastDiagram />} fuel="0" energy="0">
          Drift only. Run the <b>scoop</b> ({scoopEnergy} energy) to gain fuel equal to your
          ring&rsquo;s speed.
        </Move>
        <Move
          title="Burn"
          diagram={<BurnDiagram />}
          fuel={range(soft.mass, hard.mass)}
          energy={range(soft.energy, hard.energy)}
        >
          Drift, then cross {range(soft.rings, hard.rings)} rings, 1 fuel and 1 energy each.
          Prograde burns out, retrograde in.
        </Move>
        <Move
          title="Jump"
          diagram={<JumpDiagram />}
          fuel={`${WELL_TRANSFER_COSTS.mass} / ${COMPRESSED_JUMP_MASS}`}
          energy={`${WELL_TRANSFER_COSTS.energy}`}
        >
          From a lane&rsquo;s departure arc to the same sector of its arrival arc, with no drift.
          Lanes run <b>one way</b>. {COMPRESSED_JUMP_MASS} fuel with a compressor.
        </Move>
      </Box>

      <Box sx={{ mb: 5 }}>
        <SubHead>Phasing: land short or long</SubHead>
        <PhaseStrip />
        <Body size="0.92rem" color={PRESS.inkSoft} sx={{ mt: 0.5 }}>
          A jump can land on any sector of the arrival arc, 1 fuel for each away from the matching
          one.
        </Body>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' },
          alignItems: 'end',
        }}
      >
        <Box>
          <SubHead color={PRESS.red}>Catching a station</SubHead>
          <Body>
            Stations ride planet ring {STATION_RING}, {STATION_DRIFT} sectors a round. Ring{' '}
            {catchUp.ring} is faster ({catchUp.velocity} against {station.velocity}): dive, catch
            up, burn out onto it. Docking happens when you <b>arrive</b>.
          </Body>
        </Box>
        <Box>
          <Slab to={{ kind: 'tools', tool: 'route' }} tone="ink">
            Plot a route on the board &rarr;
          </Slab>
        </Box>
      </Box>
    </GuideSection>
  )
}
