/**
 * 04 · Moving: the drift, the one move a turn, and what each costs.
 *
 * Each move is drawn, with its fuel and energy read off the engine's burn,
 * jump and scoop configs, and phasing is drawn across the two rings a burn
 * goes between. Ring speeds are printed on the board and not repeated here.
 */
import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import {
  BLACKHOLE_RINGS,
  BURN_COSTS,
  COMPRESSED_JUMP_MASS,
  MAX_SECTOR_ADJUSTMENT,
  SUBSYSTEM_CONFIGS,
  WELL_TRANSFER_COSTS,
} from '@dangerous-inclinations/engine'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Body, Display, Slab } from '../poster'
import { phasingStrip } from '../numbers'
import { GuideSection, SubHead } from './parts'
import { BurnDiagram, CoastDiagram, JumpDiagram } from './moveDiagrams'

const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`)

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

/** The phasing example: a soft burn out from the black hole's ring 3 (speed 4) to ring 4. */
const PHASE_FROM = BLACKHOLE_RINGS[2]
const PHASE_TO = PHASE_FROM.ring + BURN_COSTS.soft.rings

/**
 * Phasing, drawn instead of stated. The bottom row is the ring the burn
 * starts on: the ship, and the drift its speed carries it. The top row is the
 * ring it burns to: straight out from the drift is free, and every sector short
 * of it or past it costs a fuel. The window is the engine's
 * (`getAdjustmentRange`, through `phasingStrip`): it never reaches back onto the
 * start, and it runs at most MAX_SECTOR_ADJUSTMENT past the drift.
 */
function PhaseStrip() {
  const strip = phasingStrip(PHASE_FROM.velocity)
  const columns = strip.length + 1
  const cellW = 64
  const step = 70
  const left = 104
  const x = (sector: number) => left + sector * step
  const mid = (sector: number) => x(sector) + cellW / 2
  const top = 8
  const bottom = 118
  const cellH = 60
  const width = x(columns - 1) + cellW + 4
  const label = (y: number, title: string, note?: string) => (
    <>
      <text x={0} y={y} fontFamily={FONT_DISPLAY} fontWeight={700} fontSize={20} fill={PRESS.ink}>
        {title}
      </text>
      {note && (
        <text
          x={0}
          y={y + 20}
          fontFamily={FONT_DISPLAY}
          fontSize={14}
          letterSpacing="0.06em"
          fill={PRESS.ink}
        >
          {note}
        </text>
      )}
    </>
  )
  const drift = PHASE_FROM.velocity
  return (
    <Box>
      <Box sx={{ maxWidth: 680, overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${width} ${bottom + cellH + 4}`}
          role="img"
          aria-label={`A soft burn out from ring ${PHASE_FROM.ring} to ring ${PHASE_TO}: the ship drifts ${drift} sectors, then lands on ring ${PHASE_TO} straight out for free, or up to ${MAX_SECTOR_ADJUSTMENT} sectors either side for 1 fuel each`}
          style={{ width: '100%', minWidth: 520, height: 'auto', display: 'block' }}
        >
          <defs>
            <marker
              id="phase-head"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="3.2"
              markerHeight="3.2"
              orient="auto"
            >
              <path d="M0 0L10 5L0 10z" fill={PRESS.red} />
            </marker>
            <marker
              id="phase-drift"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto"
            >
              <path d="M0 0L10 5L0 10z" fill={PRESS.ink} />
            </marker>
          </defs>

          {label(top + 38, `RING ${PHASE_TO}`)}
          {label(bottom + 30, `RING ${PHASE_FROM.ring}`, `SPEED ${PHASE_FROM.velocity}`)}

          {/* The ring the burn lands on: what each landing sector costs. */}
          {strip.map(({ sector, fuel }) => (
            <g key={sector}>
              <rect
                x={x(sector)}
                y={top}
                width={cellW}
                height={cellH}
                fill={fuel === 0 ? PRESS.ink : PRESS.red}
              />
              <text
                x={mid(sector)}
                y={top + 36}
                textAnchor="middle"
                fontFamily={FONT_DISPLAY}
                fontWeight={700}
                fontSize={28}
                fill={PRESS.paper}
              >
                {fuel}
              </text>
              <text
                x={mid(sector)}
                y={top + 53}
                textAnchor="middle"
                fontFamily={FONT_DISPLAY}
                fontSize={12}
                letterSpacing="0.08em"
                fill={PRESS.paper}
              >
                {fuel === 0 ? 'FREE' : 'FUEL'}
              </text>
            </g>
          ))}

          {/* The ring the burn starts on: the ship and its drift. */}
          {Array.from({ length: columns }, (_, sector) => (
            <rect
              key={sector}
              x={x(sector)}
              y={bottom}
              width={cellW}
              height={cellH}
              fill="none"
              stroke={PRESS.ink}
              strokeWidth={3}
            />
          ))}
          <path
            d={`M${mid(0) + 16} ${bottom + 30}L${mid(0) - 12} ${bottom + 16}V${bottom + 44}z`}
            fill={PRESS.ink}
          />
          <path
            d={`M${mid(0) + 22} ${bottom + 30}H${mid(drift) - 8}`}
            stroke={PRESS.ink}
            strokeWidth={5}
            strokeDasharray="10 6"
            fill="none"
            markerEnd="url(#phase-drift)"
          />
          <text
            x={mid(drift / 2)}
            y={bottom + 54}
            textAnchor="middle"
            fontFamily={FONT_DISPLAY}
            fontSize={13}
            letterSpacing="0.08em"
            fill={PRESS.ink}
          >
            DRIFT {drift}
          </text>

          {/* The burn: out from the drift to the ring above. */}
          <path
            d={`M${mid(drift)} ${bottom - 2}V${top + cellH + 8}`}
            stroke={PRESS.red}
            strokeWidth={8}
            fill="none"
            markerEnd="url(#phase-head)"
          />
          <text
            x={mid(drift) + 12}
            y={(top + cellH + bottom) / 2 + 5}
            fontFamily={FONT_DISPLAY}
            fontWeight={600}
            fontSize={14}
            letterSpacing="0.08em"
            fill={PRESS.redText}
          >
            BURN OUT
          </text>
        </svg>
      </Box>
      <Body size="0.92rem" color={PRESS.inkSoft} sx={{ mt: 1 }}>
        A soft burn out from ring {PHASE_FROM.ring}. Each sector short or long is 1 fuel, up to{' '}
        {MAX_SECTOR_ADJUSTMENT} long and never back onto your start.
      </Body>
    </Box>
  )
}

const soft = BURN_COSTS.soft
const hard = BURN_COSTS.hard
const scoopEnergy = SUBSYSTEM_CONFIGS.scoop.minEnergy

export function MoveSection() {
  return (
    <GuideSection
      id="move"
      n={4}
      kicker="Getting somewhere"
      title="Coast, burn or jump"
      lede="Every turn your ring carries you forward. Your one move is what you do about it."
    >
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
        <SubHead>Phasing: land short or long (example)</SubHead>
        <PhaseStrip />
        <Body size="0.92rem" color={PRESS.inkSoft} sx={{ mt: 0.5 }}>
          A jump can land on any sector of the arrival arc, 1 fuel for each away from the matching
          one.
        </Body>
      </Box>

      <Box>
        <Slab to={{ kind: 'tools', tool: 'route' }} tone="ink">
          Plot a route on the board &rarr;
        </Slab>
      </Box>
    </GuideSection>
  )
}
