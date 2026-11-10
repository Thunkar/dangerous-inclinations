/**
 * The explainer film's overlay (`/dev-explainer.html`), photographed frame by
 * frame by `cad/scripts/table/film.mjs`. Two kinds of moment:
 *
 * - a slide: the whole frame, a rule taught by a diagram that builds up a
 *   piece at a time, set as the cheatsheet sets it (the poster's paper, ink
 *   and red, the game's own mission cards, subsystem marks and move
 *   diagrams, the heat ledger, the d10 strip);
 * - a demonstration: transparent over the render of the printed table, one
 *   caption at a time in the lower third, a ring on the piece it is about and
 *   the path that piece takes drawn on the board.
 *
 * The film computes everything (which moment, how far in, where a piece is
 * on screen) and calls `window.__frame(frame)`; this page only draws it.
 * Words in `text/explainer.ts`. Dev only: Vite builds `index.html`, so this
 * page never reaches production.
 */
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useState, type ReactNode } from 'react'
import { Box, CssBaseline, ThemeProvider } from '@mui/material'
import type { Mission, SubsystemType } from '@dangerous-inclinations/engine'
import {
  BLACKHOLE_RINGS,
  BURN_COSTS,
  COMPRESSED_JUMP_MASS,
  DEFAULT_DISSIPATION_CAPACITY,
  DEFAULT_POINTS_TO_WIN,
  INTERCEPT_HEAT,
  MAX_HEAT,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MISSION_POINTS,
  PRIMARIES_PER_PLAYER,
  PRIMARY_OFFERS_PER_PLAYER,
  SECONDARIES_PER_PLAYER,
  SECONDARY_OFFERS_PER_PLAYER,
  SUBSYSTEM_CONFIGS,
  WELL_TRANSFER_COSTS,
  fill,
  getMissileStats,
  heatAfterCheck,
} from '@dangerous-inclinations/engine'
import './index.css'
import { theme } from './theme'
import { FONT_BODY, FONT_DISPLAY, PRESS } from './design/press'
import { Display, Kicker, Numeral } from './site/poster'
import { Ledger } from './site/guide/parts'
import { BurnDiagram, CoastDiagram, JumpDiagram } from './site/guide/moveDiagrams'
import { MissileFlight } from './site/guide/missileDiagram'
import {
  BASE_CRIT,
  D10,
  FIXED_TILES,
  FORWARD_TILES,
  MISS_TOP,
  RADIATOR_DISSIPATION,
  SIDE_TILES,
  INTERCEPT_ON,
  energyLabel,
  faceResult,
  phasingStrip,
  tileName,
} from './site/numbers'
import { STATION_DRIFT } from './site/turn'
import { TileIcon } from './art/glyphs'
import { MissionCard } from './components/common/MissionCard'
import { CHEATSHEET } from './text/cheatsheet'
import { EXPLAINER } from './text/explainer'

const X = EXPLAINER
const S = X.slides
type Vars = Record<string, string | number>
const POINTS = DEFAULT_POINTS_TO_WIN

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u))
/** In from below at `at` seconds into the moment. */
const show = (t: number, at: number, d = 0.45) => ({
  opacity: smooth((t - at) / d),
  transform: `translateY(${(1 - smooth((t - at) / d)) * 22}px)`,
})

// ---- The slides' furniture --------------------------------------------------

type Tone = 'paper' | 'deep' | 'ink'
const TONE: Record<Tone, { bg: string; fg: string; soft: string; kicker: string }> = {
  paper: { bg: PRESS.paper, fg: PRESS.ink, soft: PRESS.inkSoft, kicker: PRESS.redText },
  deep: { bg: PRESS.paperDeep, fg: PRESS.ink, soft: PRESS.inkSoft, kicker: PRESS.redText },
  ink: { bg: PRESS.ink, fg: PRESS.paper, soft: PRESS.paperSoft, kicker: PRESS.paperSoft },
}

/** A whole frame: the topic's number, kicker and title at the top, its diagram under them. */
function Slide({
  tone = 'paper',
  n,
  kicker,
  title,
  lede,
  t,
  out,
  zoom = 1,
  children,
}: {
  zoom?: number
  tone?: Tone
  n: string
  kicker: string
  title: string
  lede?: ReactNode
  t: number
  out: number
  children: ReactNode
}) {
  const c = TONE[tone]
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        bgcolor: c.bg,
        color: c.fg,
        px: '120px',
        pt: '84px',
        opacity: smooth(Math.min(t / 0.35, out)),
      }}
    >
      <Box sx={{ display: 'flex', gap: '40px', alignItems: 'flex-start', ...show(t, 0.1) }}>
        <Numeral size="8rem" color={PRESS.red}>
          {n}
        </Numeral>
        <Box sx={{ pt: '14px' }}>
          <Kicker color={c.kicker}>{kicker}</Kicker>
          <Display component="h1" size="4.6rem" color={c.fg} sx={{ mt: 1, lineHeight: 1 }}>
            {title}
          </Display>
          {lede && (
            <Box
              sx={{
                fontFamily: FONT_BODY,
                fontSize: '1.9rem',
                color: c.soft,
                mt: 1.5,
                ...show(t, 0.5),
              }}
            >
              {lede}
            </Box>
          )}
        </Box>
      </Box>
      <Box sx={{ mt: '48px', zoom }}>{children}</Box>
    </Box>
  )
}

/** A heading inside a slide: capitals on a heavy rule. */
function Head({ children, color = PRESS.ink }: { children: ReactNode; color?: string }) {
  return (
    <Box
      sx={{
        borderTop: `6px solid ${color}`,
        pt: 1.25,
        mb: 2,
        fontFamily: FONT_DISPLAY,
        fontWeight: 600,
        fontSize: '2.1rem',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        lineHeight: 1.05,
        color,
      }}
    >
      {children}
    </Box>
  )
}

/** A sentence on a slide. */
function Line({
  children,
  size = '2rem',
  color,
  sx,
}: {
  children: ReactNode
  size?: string
  color?: string
  sx?: object
}) {
  return (
    <Box sx={{ fontFamily: FONT_BODY, fontSize: size, lineHeight: 1.35, color, ...sx }}>
      {children}
    </Box>
  )
}

/** A red square bullet before a line. */
function Bullet({ children, t, at }: { children: ReactNode; t: number; at: number }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '22px 1fr',
        gap: 2.5,
        alignItems: 'start',
        ...show(t, at),
      }}
    >
      <Box sx={{ width: 18, height: 18, bgcolor: PRESS.red, mt: '0.55em' }} />
      <Line>{children}</Line>
    </Box>
  )
}

// ---- 01 The goal ------------------------------------------------------------

const RIVALS: Record<string, string> = CHEATSHEET.goal.rivals
const nameOf = (id: string) => RIVALS[id] ?? id
const PRIMARIES: Mission[] = [
  { id: 'x-destroy', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'left-2' },
  {
    id: 'x-deliver',
    type: 'deliver_cargo',
    isCompleted: false,
    pickupPlanetId: 'planet-alpha',
    deliveryPlanetId: 'planet-gamma',
    cargoId: 'x-crate',
  },
  {
    id: 'x-intercept',
    type: 'intercept_transmission',
    isCompleted: false,
    targetPlayerId: 'left-1',
    deliveryPlanetId: 'planet-beta',
    dataCargoId: 'x-data',
  },
] as Mission[]
const SECONDARIES: Mission[] = [
  { id: 'x-survey', type: 'survey', isCompleted: false, dataCargoId: 'x-survey-data' },
  { id: 'x-piracy', type: 'piracy', isCompleted: false, cargoId: 'x-loot' },
  { id: 'x-tanker', type: 'tanker', isCompleted: false },
  { id: 'x-escort', type: 'escort', isCompleted: false, markedPlayerId: null },
  { id: 'x-salvage', type: 'salvage', isCompleted: false, cargoId: 'x-box' },
] as Mission[]

function Cards({ missions, t, at }: { missions: Mission[]; t: number; at: number }) {
  return (
    <Box sx={{ display: 'flex', gap: '20px', zoom: 1.12 }}>
      {missions.map((m, i) => (
        <Box key={m.id} sx={{ width: 168, ...show(t, at + i * 0.25) }}>
          <MissionCard mission={m} nameOf={nameOf} cargo={[]} />
        </Box>
      ))}
    </Box>
  )
}

function GoalSlide({ t, out }: { t: number; out: number }) {
  const G = S.goal
  const held =
    PRIMARIES_PER_PLAYER * MISSION_POINTS.destroy_ship +
    SECONDARIES_PER_PLAYER * MISSION_POINTS.survey
  return (
    <Slide
      n={G.n}
      kicker={G.kicker}
      title={fill(G.title, { points: POINTS })}
      t={t}
      out={out}
      zoom={1.02}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: '300px 1fr', columnGap: 5, rowGap: 4 }}>
        <Box sx={show(t, 0.8)}>
          <Head>{fill(G.primaries, { points: MISSION_POINTS.destroy_ship })}</Head>
          <Line size="1.7rem">
            {fill(G.primariesDeal, {
              dealt: PRIMARY_OFFERS_PER_PLAYER,
              kept: PRIMARIES_PER_PLAYER,
            })}
          </Line>
        </Box>
        <Cards missions={PRIMARIES} t={t} at={1.0} />
        <Box sx={show(t, 2.2)}>
          <Head>{fill(G.secondaries, { points: MISSION_POINTS.survey })}</Head>
          <Line size="1.7rem">
            {fill(G.secondariesDeal, {
              dealt: SECONDARY_OFFERS_PER_PLAYER,
              kept: SECONDARIES_PER_PLAYER,
            })}
          </Line>
        </Box>
        <Cards missions={SECONDARIES} t={t} at={2.4} />
      </Box>
      <Box sx={{ mt: 4, ml: '340px', width: 900 }}>
        <Box
          sx={{
            bgcolor: PRESS.ink,
            color: PRESS.paper,
            p: 3.5,
            borderTop: `10px solid ${PRESS.red}`,
            ...show(t, 4.4),
          }}
        >
          <Display size="2.6rem" color={PRESS.paper}>
            {fill(G.sum, { held, points: POINTS })}
          </Display>
          <Line size="1.6rem" color={PRESS.paperSoft} sx={{ mt: 1.5, ...show(t, 5.6) }}>
            {fill(G.end, { points: POINTS })}
          </Line>
        </Box>
      </Box>
    </Slide>
  )
}

// ---- 02 Build your ship -----------------------------------------------------

/** One slot on the loadout: face-down until a subsystem is set in it. */
function SlotBox({
  label,
  type,
  size,
  lit,
}: {
  label: string
  type?: SubsystemType
  size: number
  lit?: number
}) {
  const u = smooth(lit ?? 0)
  return (
    <Box sx={{ position: 'relative', width: size, height: size }}>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          bgcolor: PRESS.ink,
          color: PRESS.paper,
          display: 'flex',
          alignItems: 'flex-end',
          p: 1,
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          fontSize: '1.2rem',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </Box>
      {type && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            bgcolor: PRESS.paper,
            border: `5px solid ${PRESS.red}`,
            color: PRESS.ink,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: u,
            transform: `scale(${0.7 + 0.3 * u})`,
          }}
        >
          <TileIcon type={type} size={size * 0.62} title={null} />
        </Box>
      )}
    </Box>
  )
}

/** What a slot may hold: each subsystem's mark and name. */
function Options({
  types,
  t,
  at,
  pick,
}: {
  types: readonly SubsystemType[]
  t: number
  at: number
  pick?: SubsystemType[]
}) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '10px 22px', mt: 2.5 }}>
      {types.map((type, i) => {
        const on = pick?.includes(type)
        return (
          <Box
            key={type}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              fontFamily: FONT_BODY,
              fontSize: '1.45rem',
              color: on ? PRESS.redText : PRESS.ink,
              fontWeight: on ? 700 : 400,
              ...show(t, at + i * 0.12),
            }}
          >
            <TileIcon type={type} size={30} title={null} />
            {tileName(type)}
          </Box>
        )
      })}
    </Box>
  )
}

/** The example ship (the film's own player): what it set in each slot. */
const EXAMPLE: { forward: SubsystemType; sides: SubsystemType[] } = {
  forward: 'fuel_compressor',
  sides: ['ballistic_rack', 'ballistic_rack', 'shields', 'radiator'],
}

function BuildSlide({ t, out }: { t: number; out: number }) {
  const B = S.build
  const fillAt = 7.4
  return (
    <Slide tone="deep" n={B.n} kicker={B.kicker} title={B.title} t={t} out={out}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1.45fr 0.9fr', gap: 6 }}>
        <Box sx={show(t, 0.8)}>
          <Head>{B.forward}</Head>
          <SlotBox label="FWD" size={150} type={EXAMPLE.forward} lit={(t - fillAt) / 0.5} />
          <Options
            types={FORWARD_TILES}
            t={t}
            at={1.1}
            pick={t > fillAt ? [EXAMPLE.forward] : []}
          />
        </Box>
        <Box sx={show(t, 2.2)}>
          <Head>{B.side}</Head>
          <Box sx={{ display: 'flex', gap: 2 }}>
            {EXAMPLE.sides.map((type, i) => (
              <SlotBox
                key={i}
                label={`S${i + 1}`}
                size={118}
                type={type}
                lit={(t - fillAt - 0.3 - i * 0.25) / 0.5}
              />
            ))}
          </Box>
          <Options types={SIDE_TILES} t={t} at={2.5} pick={t > fillAt ? EXAMPLE.sides : []} />
        </Box>
        <Box sx={show(t, 3.6)}>
          <Head>{B.fixed}</Head>
          <Box sx={{ display: 'flex', gap: 2 }}>
            {FIXED_TILES.map(type => (
              <Box
                key={type}
                sx={{
                  width: 96,
                  height: 96,
                  border: `5px solid ${PRESS.ink}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TileIcon type={type} size={60} title={null} />
              </Box>
            ))}
          </Box>
          <Options types={FIXED_TILES} t={t} at={3.8} />
        </Box>
      </Box>
      <Box sx={{ mt: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <Box sx={show(t, 5.0)}>
          <Head color={PRESS.redText}>{B.missions}</Head>
          {B.needs.map((need, i) => (
            <Bullet key={need} t={t} at={5.4 + i * 0.6}>
              {need}
            </Bullet>
          ))}
        </Box>
        <Box
          sx={{
            bgcolor: PRESS.ink,
            color: PRESS.paper,
            p: 3.5,
            alignSelf: 'start',
            ...show(t, 9.0),
          }}
        >
          <Line size="2rem" color={PRESS.paper}>
            {B.hidden}
          </Line>
        </Box>
      </Box>
    </Slide>
  )
}

// ---- 03 The turn ------------------------------------------------------------

function TurnSlide({ t, out }: { t: number; out: number }) {
  const T = S.turn
  return (
    <Slide
      tone="ink"
      n={T.n}
      kicker={T.kicker}
      title={T.title}
      lede={T.lede}
      t={t}
      out={out}
      zoom={1.2}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
        {T.steps.map((step, i) => {
          const actions = i === 1
          return (
            <Box
              key={step.title}
              sx={{
                bgcolor: actions ? PRESS.red : PRESS.paper,
                color: PRESS.ink,
                p: 3,
                minHeight: 300,
                ...show(t, 1.1 + i * 0.55),
              }}
            >
              <Numeral size="5rem" color={actions ? PRESS.ink : PRESS.red}>
                {i + 1}
              </Numeral>
              <Display size="2.2rem" color={actions ? PRESS.paper : PRESS.ink} sx={{ mt: 1 }}>
                {step.title}
              </Display>
              <Line size="1.55rem" color={actions ? PRESS.paper : PRESS.inkSoft} sx={{ mt: 1.5 }}>
                {step.text}
              </Line>
            </Box>
          )
        })}
      </Box>
      <Box sx={{ mt: 5, borderTop: `6px solid ${PRESS.paperSoft}`, pt: 2, ...show(t, 5.0) }}>
        <Line size="2rem" color={PRESS.paper}>
          {T.round}
        </Line>
      </Box>
    </Slide>
  )
}

// ---- 04 Moving --------------------------------------------------------------

/** The black hole's rings, turning: each ship drifts its ring's speed a turn. */
function OrbitsSlide({ t, out }: { t: number; out: number }) {
  const O = S.orbits
  const R = [150, 210, 270, 330, 390]
  const cx = 1180
  const cy = 520
  // One turn: each ship drifts its ring's speed.
  const turns = smooth((t - 2.0) / 2.4)
  const angleOf = (_ring: number, sector: number) => ((-90 + (sector + 0.5) * 15) * Math.PI) / 180
  return (
    <Slide n={O.n} kicker={O.kicker} title={O.title} lede={O.lede} t={t} out={out}>
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0 }}>
        <circle cx={cx} cy={cy} r={95} fill={PRESS.ink} />
        {R.map((r, i) => (
          <g key={r} opacity={smooth((t - 0.6 - i * 0.15) / 0.4)}>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={PRESS.ink}
              strokeWidth={34}
              opacity={0.9}
            />
            {Array.from({ length: 24 }, (_, s) => {
              const a = angleOf(i + 1, s) - (7.5 * Math.PI) / 180
              return (
                <line
                  key={s}
                  x1={cx + (r - 17) * Math.cos(a)}
                  y1={cy + (r - 17) * Math.sin(a)}
                  x2={cx + (r + 17) * Math.cos(a)}
                  y2={cy + (r + 17) * Math.sin(a)}
                  stroke={PRESS.paper}
                  strokeWidth={2}
                  opacity={0.5}
                />
              )
            })}
          </g>
        ))}
        {BLACKHOLE_RINGS.map((ring, i) => {
          const a = angleOf(ring.ring, 0 + ring.velocity * turns)
          const r = R[i]
          return (
            <g key={ring.ring} opacity={smooth((t - 1.2) / 0.4)}>
              <path
                d={`M ${cx + r * Math.cos(angleOf(0, 0))} ${cy + r * Math.sin(angleOf(0, 0))} A ${r} ${r} 0 ${ring.velocity * turns * 15 > 180 ? 1 : 0} 1 ${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`}
                fill="none"
                stroke={PRESS.red}
                strokeWidth={8}
                opacity={turns > 0.02 ? 0.85 : 0}
              />
              <circle
                cx={cx + r * Math.cos(a)}
                cy={cy + r * Math.sin(a)}
                r={16}
                fill={PRESS.red}
                stroke={PRESS.paper}
                strokeWidth={4}
              />
            </g>
          )
        })}
      </svg>
      <Box
        sx={{
          position: 'absolute',
          left: 120,
          top: 400,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        {BLACKHOLE_RINGS.map((ring, i) => (
          <Box
            key={ring.ring}
            sx={{ display: 'flex', alignItems: 'baseline', gap: 2, ...show(t, 1.0 + i * 0.2) }}
          >
            <Display size="2.2rem">{fill(O.ring, { ring: ring.ring })}</Display>
            <Box
              sx={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: '2.2rem',
                color: PRESS.redText,
                textTransform: 'uppercase',
              }}
            >
              {fill(O.speed, { speed: ring.velocity })}
            </Box>
          </Box>
        ))}
      </Box>
    </Slide>
  )
}

/** Phasing, as the cheatsheet draws it: where a burn from the black hole's ring 3 can land, and what each landing costs. */
function Phasing({ t, at }: { t: number; at: number }) {
  const P = S.moves.phasing
  const speed = BLACKHOLE_RINGS[2].velocity
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 5, mt: 3, ...show(t, at) }}>
      <Box sx={{ width: 480 }}>
        <Display size="3.2rem">{P.title}</Display>
        <Line size="1.8rem" sx={{ mt: 1 }}>
          {P.text}
        </Line>
      </Box>
      <Box sx={{ display: 'flex', gap: '6px' }}>
        {phasingStrip(speed).map((cell, i) => {
          const free = cell.fuel === 0
          return (
            <Box
              key={cell.sector}
              sx={{
                width: 104,
                height: 104,
                bgcolor: free ? PRESS.ink : PRESS.paper,
                border: `5px solid ${PRESS.ink}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                ...show(t, at + 0.4 + i * 0.12),
              }}
            >
              <Box
                sx={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: '2rem',
                  textTransform: 'uppercase',
                  color: free ? PRESS.paper : PRESS.redText,
                }}
              >
                {free ? P.free : `+${cell.fuel}`}
              </Box>
              {!free && (
                <Box
                  sx={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: '1.2rem',
                    color: PRESS.inkSoft,
                    textTransform: 'uppercase',
                  }}
                >
                  {P.fuel}
                </Box>
              )}
              {free && (
                <Box
                  sx={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: '1.2rem',
                    color: PRESS.paperSoft,
                    textTransform: 'uppercase',
                  }}
                >
                  {fill(P.drift, { speed })}
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

function MovesSlide({ t, out }: { t: number; out: number }) {
  const M = S.moves
  const panels = [
    { k: M.coast, diagram: <CoastDiagram />, cost: M.coast.cost },
    { k: M.burn, diagram: <BurnDiagram />, cost: M.burn.cost },
    {
      k: M.jump,
      diagram: <JumpDiagram />,
      cost: fill(M.jump.cost, { fuel: WELL_TRANSFER_COSTS.mass, compressed: COMPRESSED_JUMP_MASS }),
    },
  ]
  void BURN_COSTS
  return (
    <Slide n={M.n} kicker={M.kicker} title={M.title} t={t} out={out} zoom={1.12}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
        {panels.map((p, i) => (
          <Box key={p.k.title} sx={show(t, 0.8 + i * 1.8)}>
            <Box sx={{ border: `5px solid ${PRESS.ink}`, bgcolor: PRESS.paper, p: 2, zoom: 1.15 }}>
              {p.diagram}
            </Box>
            <Display size="3.2rem" sx={{ mt: 2 }}>
              {p.k.title}
            </Display>
            <Box
              sx={{
                display: 'inline-block',
                bgcolor: PRESS.red,
                color: PRESS.paper,
                px: 1.5,
                py: 0.5,
                mt: 1,
                fontFamily: FONT_DISPLAY,
                fontWeight: 600,
                fontSize: '1.5rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {p.cost}
            </Box>
            <Line size="1.8rem" sx={{ mt: 1.5 }}>
              {p.k.text}
            </Line>
          </Box>
        ))}
      </Box>
      <Phasing t={t} at={6.4} />
    </Slide>
  )
}

// ---- 05 Energy and heat -----------------------------------------------------

const ENERGY: Array<{ type: SubsystemType; label: string; value: string }> = [
  { type: 'rotation', label: 'Rotate', value: String(SUBSYSTEM_CONFIGS.rotation.minEnergy) },
  { type: 'engines', label: 'Burn', value: `${BURN_COSTS.soft.energy}–${BURN_COSTS.hard.energy}` },
  { type: 'engines', label: 'Jump', value: String(WELL_TRANSFER_COSTS.energy) },
  { type: 'scoop', label: 'Scoop', value: energyLabel('scoop') },
  { type: 'railgun', label: 'Railgun', value: energyLabel('railgun') },
  { type: 'laser', label: 'Laser', value: energyLabel('laser') },
  { type: 'ballistic_rack', label: 'Rack', value: energyLabel('ballistic_rack') },
  { type: 'shields', label: 'Shields', value: energyLabel('shields') },
]

function HeatSlide({ t, out }: { t: number; out: number }) {
  const H = S.heat
  return (
    <Slide
      tone="deep"
      n={H.n}
      kicker={H.kicker}
      title={H.title}
      lede={H.lede}
      t={t}
      out={out}
      zoom={1.15}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5, width: 1100 }}>
        {ENERGY.map((cell, i) => (
          <Box
            key={cell.label}
            sx={{ border: `4px solid ${PRESS.ink}`, ...show(t, 1.0 + i * 0.18) }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 1,
                fontFamily: FONT_DISPLAY,
                fontWeight: 600,
                fontSize: '1.4rem',
                textTransform: 'uppercase',
              }}
            >
              <TileIcon type={cell.type} size={28} title={null} />
              {cell.label}
            </Box>
            <Box sx={{ bgcolor: PRESS.ink, textAlign: 'right', px: 1.5, py: 0.5 }}>
              <Numeral size="2.6rem" color={PRESS.paper}>
                {cell.value}
              </Numeral>
            </Box>
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 5, display: 'flex', flexDirection: 'column', gap: 2.5, width: 1300 }}>
        <Bullet t={t} at={3.0}>
          {H.stays}
        </Bullet>
        <Bullet t={t} at={4.0}>
          <b>{H.check}</b>
        </Bullet>
      </Box>
    </Slide>
  )
}

function HeatCheckSlide({ t, out }: { t: number; out: number }) {
  const H = S.heatCheck
  const L = CHEATSHEET.heat.ledger
  const carried = 3
  const spent =
    SUBSYSTEM_CONFIGS.railgun.minEnergy +
    BURN_COSTS.hard.energy +
    SUBSYSTEM_CONFIGS.shields.maxEnergy
  const atCheck = carried + spent
  const rows = [
    { value: `${carried}`, label: L.carried },
    {
      value: `+${spent}`,
      label: fill(L.spent, {
        railgun: SUBSYSTEM_CONFIGS.railgun.minEnergy,
        hardBurn: BURN_COSTS.hard.energy,
        shields: SUBSYSTEM_CONFIGS.shields.maxEnergy,
      }),
    },
    { value: `${atCheck}`, label: L.atCheck, rule: true },
    {
      value: `−${Math.max(0, atCheck - MAX_HEAT)}`,
      label: fill(L.hull, { maxHeat: MAX_HEAT }),
      tone: 'red' as const,
    },
    { value: `${MAX_HEAT}`, label: L.stops },
    { value: `−${DEFAULT_DISSIPATION_CAPACITY}`, label: L.dissipate },
    {
      value: `${heatAfterCheck(atCheck, DEFAULT_DISSIPATION_CAPACITY)}`,
      label: L.carries,
      tone: 'ink' as const,
    },
  ]
  const ledgerAt = 0.9
  const shown = Math.max(0, Math.min(rows.length, Math.floor((t - ledgerAt) / 0.5) + 1))
  return (
    <Slide tone="deep" n={H.n} kicker={H.kicker} title={H.title} lede={H.lede} t={t} out={out}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '560px 1fr', gap: 7, alignItems: 'start' }}>
        <Box
          sx={{
            border: `6px solid ${PRESS.ink}`,
            bgcolor: PRESS.paper,
            p: 3,
            zoom: 1.45,
            width: 380,
            ...show(t, ledgerAt - 0.3),
          }}
        >
          <Ledger rows={rows.slice(0, shown)} />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Bullet t={t} at={3.0}>
            {fill(H.dissipate, {
              dissipation: DEFAULT_DISSIPATION_CAPACITY,
              radiator: RADIATOR_DISSIPATION,
            })}
          </Bullet>
          <Bullet t={t} at={4.0}>
            <b>{fill(H.over, { maxHeat: MAX_HEAT })}</b>
          </Bullet>
          <Bullet t={t} at={5.4}>
            {H.absorbed}
          </Bullet>
          <Bullet t={t} at={6.6}>
            {fill(H.rack, { heat: INTERCEPT_HEAT })}
          </Bullet>
        </Box>
      </Box>
    </Slide>
  )
}

// ---- 06 Fighting ------------------------------------------------------------

function Strip({ t, at, face }: { t: number; at: number; face?: number }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '6px' }}>
      {D10.map((f, i) => {
        const r = faceResult(f)
        const on = f === face
        return (
          <Box
            key={f}
            sx={{
              aspectRatio: '1',
              bgcolor: r === 'critical' ? PRESS.red : r === 'hit' ? PRESS.ink : 'transparent',
              border: `5px solid ${r === 'critical' ? PRESS.red : PRESS.ink}`,
              outline: on ? `7px solid ${PRESS.red}` : 'none',
              outlineOffset: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              ...show(t, at + i * 0.1),
            }}
          >
            <Numeral size="3.4rem" color={r === 'miss' ? PRESS.ink : PRESS.paper}>
              {f}
            </Numeral>
          </Box>
        )
      })}
    </Box>
  )
}

function FightSlide({ t, out }: { t: number; out: number }) {
  const F = S.fight
  const groups = [
    fill(F.faces[0], { top: MISS_TOP }),
    fill(F.faces[1], { from: MISS_TOP + 1, to: BASE_CRIT - 1 }),
    fill(F.faces[2], { face: BASE_CRIT }),
  ]
  return (
    <Slide n={F.n} kicker={F.kicker} title={F.title} lede={F.lede} t={t} out={out} zoom={1.2}>
      <Box sx={{ width: 1200 }}>
        <Strip t={t} at={1.0} />
        <Box sx={{ display: 'flex', gap: 2, mt: 2.5 }}>
          {groups.map((g, i) => (
            <Box
              key={g}
              sx={{
                bgcolor: i === 2 ? PRESS.red : i === 1 ? PRESS.ink : 'transparent',
                color: i === 0 ? PRESS.ink : PRESS.paper,
                border: `4px solid ${i === 2 ? PRESS.red : PRESS.ink}`,
                px: 2,
                py: 0.75,
                fontFamily: FONT_DISPLAY,
                fontWeight: 600,
                fontSize: '1.9rem',
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                ...show(t, 2.4 + i * 0.6),
              }}
            >
              {g}
            </Box>
          ))}
        </Box>
      </Box>
      <Box sx={{ mt: 6, display: 'flex', flexDirection: 'column', gap: 2.5, width: 1300 }}>
        <Bullet t={t} at={4.0}>
          <b>{F.critical}</b>
        </Bullet>
        <Bullet t={t} at={4.6}>
          {F.shields}
        </Bullet>
        <Bullet t={t} at={5.4}>
          <b>{F.zero}</b>
        </Bullet>
      </Box>
    </Slide>
  )
}

// ---- 06 Missiles -----------------------------------------------------------

const MISSILE = getMissileStats()

function MissilesSlide({ t, out }: { t: number; out: number }) {
  const R = S.missiles
  const vars = {
    steps: MISSILE.stepsPerMove,
    damage: MISSILE.damage,
    turns: MISSILE.maxMoves,
    on: INTERCEPT_ON,
    heat: INTERCEPT_HEAT,
  }
  return (
    <Slide n={R.n} kicker={R.kicker} title={R.title} t={t} out={out}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '720px 1fr', gap: 7, alignItems: 'start' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {R.rows.map((row, i) => (
            <Bullet key={row} t={t} at={0.9 + i * 1.6}>
              {fill(row, vars)}
            </Bullet>
          ))}
        </Box>
        <Box
          sx={{
            border: `6px solid ${PRESS.ink}`,
            bgcolor: PRESS.paper,
            p: 2.5,
            zoom: 1.2,
            // The cheatsheet's paragraph under the drawing: the bullets say it here.
            '& > div > :last-child': { display: 'none' },
            ...show(t, 1.4),
          }}
        >
          <MissileFlight />
        </Box>
      </Box>
    </Slide>
  )
}

// ---- 07 Secrets -------------------------------------------------------------

const REVEAL_ICONS: SubsystemType[][] = [
  ['railgun', 'laser', 'ballistic_rack', 'missiles'],
  ['shields'],
  ['radiator'],
  ['fuel_compressor'],
]

function SecretsSlide({ t, out }: { t: number; out: number }) {
  const R = S.secrets
  return (
    <Slide
      tone="deep"
      n={R.n}
      kicker={R.kicker}
      title={R.title}
      lede={R.lede}
      t={t}
      out={out}
      zoom={1.3}
    >
      <Box sx={{ border: `6px solid ${PRESS.ink}`, width: 1240 }}>
        {R.rows.map((row, i) => (
          <Box
            key={row}
            sx={{
              display: 'grid',
              gridTemplateColumns: '240px 1fr',
              alignItems: 'center',
              gap: 3,
              px: 3,
              py: 2,
              borderTop: i ? `3px solid ${PRESS.inkFaint}` : 'none',
              ...show(t, 1.0 + i * 0.7),
            }}
          >
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              {REVEAL_ICONS[i].map(type => (
                <TileIcon key={type} type={type} size={46} title={null} />
              ))}
            </Box>
            <Line size="2rem">{fill(row, { heat: DEFAULT_DISSIPATION_CAPACITY })}</Line>
          </Box>
        ))}
        <Box sx={{ bgcolor: PRESS.red, color: PRESS.paper, px: 3, py: 2.5, ...show(t, 4.2) }}>
          <Line size="2rem" color={PRESS.paper} sx={{ fontWeight: 700 }}>
            {R.public}
          </Line>
        </Box>
      </Box>
    </Slide>
  )
}

// ---- 08 Stations ------------------------------------------------------------

function StationsSlide({ t, out }: { t: number; out: number }) {
  const St = S.stations
  const cx = 1460
  const cy = 610
  const r = 230
  const step = smooth((t - 5.6) / 1.6)
  const a = ((-90 + 15 * STATION_DRIFT * step) * Math.PI) / 180
  return (
    <Slide n={St.n} kicker={St.kicker} title={St.title} t={t} out={out}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, width: 980 }}>
        {St.rows.map((row, i) => (
          <Bullet key={row} t={t} at={0.9 + i * 0.8}>
            {i === 2 ? <b>{row}</b> : row}
          </Bullet>
        ))}
        <Box sx={{ mt: 3, bgcolor: PRESS.ink, color: PRESS.paper, p: 3, ...show(t, 4.8) }}>
          <Line size="2rem" color={PRESS.paper}>
            {fill(St.move, { drift: STATION_DRIFT })}
          </Line>
        </Box>
      </Box>
      <svg
        width={1920}
        height={1080}
        style={{ position: 'absolute', left: 0, top: 0, opacity: smooth((t - 4.8) / 0.5) }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={r + 70}
          fill="none"
          stroke={PRESS.ink}
          strokeWidth={34}
          opacity={0.35}
        />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={PRESS.ink} strokeWidth={34} />
        <circle cx={cx} cy={cy} r={95} fill={PRESS.ink} />
        <path
          d={`M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`}
          fill="none"
          stroke={PRESS.red}
          strokeWidth={8}
          opacity={step > 0.02 ? 1 : 0}
        />
        <g
          transform={`translate(${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}) rotate(${(a * 180) / Math.PI + 90})`}
        >
          <rect
            x={-30}
            y={-30}
            width={60}
            height={60}
            fill={PRESS.paper}
            stroke={PRESS.red}
            strokeWidth={6}
          />
          <rect x={-12} y={-12} width={24} height={24} fill={PRESS.ink} />
        </g>
        <text
          x={cx}
          y={cy + r + 130}
          textAnchor="middle"
          fontFamily="Oswald Variable, Oswald, sans-serif"
          fontSize={34}
          fontWeight={600}
          fill={PRESS.ink}
        >
          {`+${STATION_DRIFT} SECTORS`}
        </text>
      </svg>
    </Slide>
  )
}

// ---- 09 Destruction ---------------------------------------------------------

function DeathSlide({ t, out }: { t: number; out: number }) {
  const D = S.death
  return (
    <Slide n={D.n} kicker={D.kicker} title={D.title} t={t} out={out} zoom={1.25}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr auto 1fr',
          alignItems: 'stretch',
        }}
      >
        {D.steps.map((step, i) => (
          <Box key={step.title} sx={{ display: 'contents' }}>
            {i > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', px: 3, ...show(t, 1.3 + i * 1.2) }}>
                <svg width={60} height={52} viewBox="0 0 34 30">
                  <path d="M0 10h18V0l16 15-16 15V20H0z" fill={PRESS.red} />
                </svg>
              </Box>
            )}
            <Box
              sx={{
                border: `6px solid ${PRESS.ink}`,
                bgcolor: i === 0 ? PRESS.ink : 'transparent',
                color: i === 0 ? PRESS.paper : PRESS.ink,
                p: 4,
                minHeight: 340,
                ...show(t, 1.0 + i * 1.2),
              }}
            >
              <Numeral size="1.9rem" color={i === 0 ? PRESS.red : PRESS.redText}>
                {step.when.toUpperCase()}
              </Numeral>
              <Display size="3rem" color={i === 0 ? PRESS.paper : PRESS.ink} sx={{ mt: 1.5 }}>
                {step.title}
              </Display>
              <Line size="1.9rem" color={i === 0 ? PRESS.paperSoft : PRESS.ink} sx={{ mt: 2 }}>
                {step.text}
              </Line>
            </Box>
          </Box>
        ))}
      </Box>
    </Slide>
  )
}

const SLIDES: Record<string, (p: { t: number; out: number }) => ReactNode> = {
  goal: GoalSlide,
  build: BuildSlide,
  turn: TurnSlide,
  orbits: OrbitsSlide,
  moves: MovesSlide,
  heat: HeatSlide,
  heatCheck: HeatCheckSlide,
  fight: FightSlide,
  missiles: MissilesSlide,
  secrets: SecretsSlide,
  stations: StationsSlide,
  death: DeathSlide,
}

// ---- The demonstrations -----------------------------------------------------

function Hero({ end, u }: { end: boolean; u: number }) {
  const H = X.hero
  return (
    <Box
      sx={{
        position: 'absolute',
        left: 110,
        top: 290,
        width: 820,
        bgcolor: PRESS.ink,
        color: PRESS.paper,
        p: 5.5,
        borderTop: `12px solid ${PRESS.red}`,
        opacity: smooth(u),
      }}
    >
      <Kicker color={PRESS.paperSoft}>
        {fill(H.kicker, { min: MIN_PLAYERS, max: MAX_PLAYERS })}
      </Kicker>
      <Display component="h1" size="7rem" color={PRESS.paper} sx={{ mt: 1.5, lineHeight: 0.92 }}>
        {H.title[0]}
        <Box component="span" sx={{ display: 'block', color: PRESS.red }}>
          {H.title[1]}
        </Box>
      </Display>
      <Display size="2.4rem" color={PRESS.paper} sx={{ mt: 3 }}>
        {H.motto}
      </Display>
      {!end && (
        <Box sx={{ fontFamily: FONT_BODY, fontSize: '1.7rem', color: PRESS.paperSoft, mt: 1.5 }}>
          {H.line}
        </Box>
      )}
    </Box>
  )
}

/** Which topic a demonstration belongs to, top left: its slide's number and kicker. */
function Topic({ id, u }: { id: keyof typeof S; u: number }) {
  const slide = S[id]
  return (
    <Box
      sx={{
        position: 'absolute',
        left: 64,
        top: 56,
        display: 'flex',
        alignItems: 'stretch',
        fontFamily: FONT_DISPLAY,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        opacity: smooth(u),
      }}
    >
      <Box
        sx={{
          bgcolor: PRESS.red,
          color: PRESS.paper,
          px: 2,
          py: 1,
          fontWeight: 700,
          fontSize: '1.8rem',
        }}
      >
        {slide.n}
      </Box>
      <Box
        sx={{
          bgcolor: PRESS.ink,
          color: PRESS.paper,
          px: 2.5,
          py: 1,
          fontWeight: 600,
          fontSize: '1.8rem',
        }}
      >
        {slide.kicker}
      </Box>
    </Box>
  )
}

/** The demonstration's one caption, lower third. */
function Caption({ text, vars, u }: { text: string; vars?: Vars; u: number }) {
  const key = text as keyof typeof X.captions
  return (
    <Box
      sx={{
        position: 'absolute',
        left: '50%',
        bottom: 84,
        transform: `translate(-50%, ${(1 - smooth(u)) * 18}px)`,
        maxWidth: 1500,
        bgcolor: PRESS.ink,
        color: PRESS.paper,
        borderLeft: `12px solid ${PRESS.red}`,
        px: 4,
        py: 2.25,
        fontFamily: FONT_BODY,
        fontSize: '2.35rem',
        fontWeight: 600,
        lineHeight: 1.25,
        whiteSpace: 'nowrap',
        opacity: smooth(u),
      }}
    >
      {fill(String(X.captions[key] ?? text), { points: POINTS, ...vars })}
    </Box>
  )
}

/** A ring on the piece the caption is about. */
function Ring({ x, y, u, r = 34 }: { x: number; y: number; u: number; r?: number }) {
  const e = smooth(u)
  return (
    <svg
      width={1920}
      height={1080}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
    >
      <circle
        cx={x}
        cy={y}
        r={r + (1 - e) * 40}
        fill="none"
        stroke={PRESS.red}
        strokeWidth={6}
        opacity={e}
      />
      <circle
        cx={x}
        cy={y}
        r={r + 9 + (1 - e) * 40}
        fill="none"
        stroke={PRESS.paper}
        strokeWidth={2.5}
        opacity={e * 0.8}
      />
    </svg>
  )
}

/** The route a piece takes, drawn on the board as it goes. */
function Path({ points, u }: { points: [number, number][]; u: number }) {
  if (points.length < 2) return null
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  return (
    <svg
      width={1920}
      height={1080}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
    >
      <path
        d={d}
        fill="none"
        stroke={PRESS.ink}
        strokeWidth={11}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.55 * smooth(u)}
      />
      <path
        d={d}
        fill="none"
        stroke={PRESS.red}
        strokeWidth={6}
        strokeDasharray="16 10"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={smooth(u)}
      />
    </svg>
  )
}

/** A shot: a dashed red rule from the ship that fires to the one it names. */
function Shot({
  x1,
  y1,
  x2,
  y2,
  u,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  u: number
}) {
  const e = smooth(u)
  return (
    <svg
      width={1920}
      height={1080}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
    >
      <line
        x1={x1}
        y1={y1}
        x2={x1 + (x2 - x1) * e}
        y2={y1 + (y2 - y1) * e}
        stroke={PRESS.red}
        strokeWidth={7}
        strokeDasharray="18 10"
      />
    </svg>
  )
}

/** The roll, on the d10 strip, at the right. */
function Roll({ face, u }: { face: number; u: number }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        right: 64,
        top: 150,
        width: 640,
        bgcolor: PRESS.paper,
        p: 2.5,
        borderTop: `10px solid ${PRESS.red}`,
        opacity: smooth(u),
      }}
    >
      <Box sx={{ zoom: 0.5 }}>
        <Strip t={10} at={0} face={face} />
      </Box>
      <Box
        sx={{
          mt: 1.5,
          display: 'flex',
          alignItems: 'baseline',
          gap: 1.5,
          fontFamily: FONT_DISPLAY,
          textTransform: 'uppercase',
        }}
      >
        <Numeral size="3.4rem" color={PRESS.red}>
          {face}
        </Numeral>
        <Box component="span" sx={{ fontWeight: 700, fontSize: '2.4rem', color: PRESS.ink }}>
          {X.roll[faceResult(face)]}
        </Box>
      </Box>
    </Box>
  )
}

/** The heat check worked as the cheatsheet's ledger works it, at the right. */
function HeatCheck({
  rows,
  u,
}: {
  rows: { value: string; text: string; tone?: 'red' | 'ink'; rule?: boolean }[]
  u: number
}) {
  const shown = Math.ceil(smooth(u) * rows.length)
  return (
    <Box
      sx={{
        position: 'absolute',
        right: 64,
        top: 150,
        width: 420,
        zoom: 1.5,
        bgcolor: PRESS.paper,
        border: `4px solid ${PRESS.ink}`,
        p: 2.5,
        opacity: smooth(Math.min(1, u * 4)),
      }}
    >
      <Ledger
        rows={rows.slice(0, shown).map(r => ({
          value: r.value,
          label: X.ledger[r.text as keyof typeof X.ledger] ?? r.text,
          tone: r.tone,
          rule: r.rule,
        }))}
      />
    </Box>
  )
}

interface Frame {
  slide?: { id: string; t: number; out: number }
  hero?: { end: boolean; u: number }
  topic?: { id: keyof typeof S; u: number }
  caption?: { text: string; vars?: Vars; u: number }
  rings?: { x: number; y: number; u: number; r?: number }[]
  paths?: { points: [number, number][]; u: number }[]
  shots?: { x1: number; y1: number; x2: number; y2: number; u: number }[]
  roll?: { face: number; u: number }
  ledger?: {
    rows: { value: string; text: string; tone?: 'red' | 'ink'; rule?: boolean }[]
    u: number
  }
}

function App() {
  const [frame, setFrame] = useState<Frame>({})
  // eslint-disable-next-line react-hooks/immutability -- the film's driver sets each frame through this global
  ;(window as unknown as { __set: (f: Frame) => void }).__set = setFrame
  const SlideOf = frame.slide ? SLIDES[frame.slide.id] : null
  return (
    <Box sx={{ position: 'relative', width: 1920, height: 1080, overflow: 'hidden' }}>
      {frame.paths?.map((p, i) => (
        <Path key={`p${i}`} {...p} />
      ))}
      {frame.shots?.map((s, i) => (
        <Shot key={`s${i}`} {...s} />
      ))}
      {frame.rings?.map((r, i) => (
        <Ring key={`r${i}`} {...r} />
      ))}
      {frame.topic && <Topic {...frame.topic} />}
      {frame.caption && <Caption {...frame.caption} />}
      {frame.roll && <Roll {...frame.roll} />}
      {frame.ledger && <HeatCheck {...frame.ledger} />}
      {frame.hero && <Hero {...frame.hero} />}
      {SlideOf && frame.slide && <SlideOf t={frame.slide.t} out={frame.slide.out} />}
    </Box>
  )
}

declare global {
  interface Window {
    __frame: (frame: Frame) => Promise<void>
  }
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <App />
  </ThemeProvider>
)

window.__frame = async frame => {
  flushSync(() => (window as unknown as { __set: (f: Frame) => void }).__set(frame))
  await document.fonts.ready
}
