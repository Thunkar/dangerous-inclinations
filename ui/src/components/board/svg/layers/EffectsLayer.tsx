/**
 * Transient effects: weapon beams, plasma bolts, disruptor pulses, flares,
 * bursts and floating numbers. Everything is
 * pushed by AnimationContext from the turn's events and fades on its own.
 *
 * An effect is anchored to a ship where it is about one and to a sector where
 * it is about a place: the model's `pointOf` knows where a hull is actually
 * drawn, which is beside the centre of its sector whenever somebody else is
 * standing in it, and the sector is the fallback. A float may carry a small
 * nudge in board units so two of them on one ship do not sit on top of each
 * other, and its step in the pile over its sector (`stack`), which the 3D
 * board raises and this one writes a line higher.
 */
import { memo } from 'react'
import { PLASMA_CORE, type TableEffect } from '../../../../animation/beats'
import { FONT_MONO } from '../../../../theme'
import {
  PLASMA_BURST,
  PLASMA_EMBERS,
  RAY_PULSE,
  boltFlight,
  emberSpawn,
  crackle,
  hash01,
  rayEnd,
  rayFade,
  rayReach,
  raySources,
} from '../../fx'
import { positionPoint, ringRadius, sectorWedgePath, type Point } from '../../geometry'
import { BOARD } from '../palette'
import type { BoardModel } from '../../model'

type Of<K extends TableEffect['kind']> = Extract<TableEffect, { kind: K }>

interface DrawProps<K extends TableEffect['kind']> {
  effect: Of<K>
  progress: number
  pointOf: BoardModel['pointOf']
}

/** A shot's two ends: on the hulls where there are hulls, on the sectors otherwise. */
function endsOf(effect: Of<'plasma'> | Of<'ray'>, pointOf: BoardModel['pointOf']) {
  return {
    from: (effect.fromId ? pointOf(effect.fromId) : null) ?? positionPoint(effect.from),
    to: (effect.toId ? pointOf(effect.toId) : null) ?? positionPoint(effect.to),
  }
}

const polyline = (points: readonly Point[]) => points.map(p => `${p.x},${p.y}`).join(' ')

/**
 * A soft ball of plasma as a gradient: white-yellow at the heart, the green
 * through the body and nothing at the edge. `focus` pushes the heart toward
 * the front of the shape it fills, which on an ellipse drawn along the flight
 * is a teardrop with its tail behind.
 */
function PlasmaGradient({ id, color, focus = 0.5 }: { id: string; color: string; focus?: number }) {
  return (
    <radialGradient id={id} cx="0.5" cy="0.5" r="0.5" fx={focus} fy="0.5">
      <stop offset="0" stopColor={PLASMA_CORE} />
      <stop offset="0.2" stopColor={PLASMA_CORE} />
      <stop offset="0.42" stopColor={color} />
      <stop offset="0.72" stopColor={color} stopOpacity={0.35} />
      <stop offset="1" stopColor={color} stopOpacity={0} />
    </radialGradient>
  )
}

/**
 * A plasma burst: bolts of burning gas one after another, each a soft
 * gradient blob drawn out along its flight, shedding embers that drift off
 * the line and cool from white to green, with a flash and a spray of sparks
 * at the muzzle as each one leaves and a flash where each one lands.
 */
function PlasmaShot({ effect, progress, pointOf }: DrawProps<'plasma'>) {
  const { from, to } = endsOf(effect, pointOf)
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  const heading = Math.atan2(dy, dx)
  const { radius, splash } = PLASMA_BURST
  const fade = progress > 0.85 ? (1 - progress) / 0.15 : 1
  const blob = `${effect.id}-blob`
  const flash = `${effect.id}-flash`
  return (
    <g opacity={Math.max(0, fade)}>
      <defs>
        <PlasmaGradient id={blob} color={effect.color} focus={0.8} />
        <PlasmaGradient id={flash} color={effect.color} />
      </defs>
      {Array.from({ length: PLASMA_BURST.bolts }, (_, i) => {
        const t = boltFlight(progress, i)
        if (t < 0) return null
        const marks = []
        // Embers: dropped along the way, drifting off the line as they cool.
        for (let k = 0; k < PLASMA_EMBERS.perBolt; k++) {
          const spawn = emberSpawn(k)
          const life = (t - spawn) / PLASMA_EMBERS.life
          if (life < 0 || life > 1) continue
          const seed = hash01(i, k, 3)
          const side = (hash01(i, k, 1) * 2 - 1) * 13 * life
          const back = 9 * seed * life
          marks.push(
            <circle
              key={`e${k}`}
              cx={from.x + dx * spawn - uy * side - ux * back}
              cy={from.y + dy * spawn + ux * side - uy * back}
              r={(0.8 + 2.2 * seed) * (1 - 0.7 * life)}
              fill={life < 0.3 ? PLASMA_CORE : effect.color}
              opacity={1 - life}
            />
          )
        }
        // Leaving: a flash at the muzzle and sparks thrown forward in a cone.
        if (t < PLASMA_EMBERS.spark) {
          const k = t / PLASMA_EMBERS.spark
          marks.push(
            <circle
              key="m"
              cx={from.x}
              cy={from.y}
              r={radius * (1.2 + 0.8 * k)}
              fill={`url(#${flash})`}
              opacity={1 - k}
            />
          )
          for (let j = 0; j < PLASMA_EMBERS.sparks; j++) {
            const angle = heading + (hash01(i, j, 5) - 0.5) * 1.3
            const reach = 6 + 34 * hash01(i, j, 6) * Math.sqrt(k)
            const cos = Math.cos(angle)
            const sin = Math.sin(angle)
            marks.push(
              <line
                key={`s${j}`}
                x1={from.x + cos * reach}
                y1={from.y + sin * reach}
                x2={from.x + cos * (reach + 5)}
                y2={from.y + sin * (reach + 5)}
                stroke={PLASMA_CORE}
                strokeWidth={1.6}
                strokeLinecap="round"
                opacity={1 - k}
              />
            )
          }
        }
        if (t <= 1) {
          const breath = 1 + 0.08 * Math.sin(progress * 70 + i * 2.1)
          const tail = Math.min(1, t * 6)
          marks.push(
            <g
              key="b"
              transform={`translate(${from.x + dx * t} ${from.y + dy * t}) rotate(${(heading * 180) / Math.PI})`}
            >
              <ellipse
                cx={-radius * 0.8 * tail}
                cy={0}
                rx={radius * (1.5 + 0.8 * tail)}
                ry={radius * 1.3 * breath}
                fill={`url(#${blob})`}
              />
            </g>
          )
        } else {
          // Landed: the gas flashes and spreads on what it hit.
          const after = ((t - 1) * PLASMA_BURST.flight) / splash
          if (after < 1)
            marks.push(
              <circle
                key="l"
                cx={to.x}
                cy={to.y}
                r={radius * (1.3 + 1.4 * after)}
                fill={`url(#${flash})`}
                opacity={1 - after}
              />
            )
        }
        return <g key={i}>{marks}</g>
      })}
    </g>
  )
}

/**
 * Plasma bursting on a hull: a fireball of the gradient that swells and falls
 * back in, a ring running out, spark ticks thrown off and embers left hanging
 * after the fire has gone.
 */
function PlasmaBurst({
  effect,
  progress,
  at,
}: {
  effect: Of<'flare'>
  progress: number
  at: Point
}) {
  const r = effect.radius
  const fire = `${effect.id}-fire`
  const peak = 0.16
  const gone = 0.6
  const size =
    progress < peak
      ? 0.35 + 0.85 * Math.sqrt(progress / peak)
      : progress < gone
        ? 1.2 * (1 - (progress - peak) / (gone - peak)) ** 0.8
        : 0
  const wave = Math.min(1, progress / 0.55)
  const spray = Math.min(1, progress / 0.45)
  const linger = progress < 0.15 ? progress / 0.15 : (1 - progress) ** 1.2
  return (
    <g>
      <defs>
        <PlasmaGradient id={fire} color={effect.color} />
      </defs>
      {wave < 1 && (
        <circle
          cx={at.x}
          cy={at.y}
          r={r * (0.3 + 1.3 * wave ** 0.7)}
          fill="none"
          stroke={effect.color}
          strokeWidth={5 * (1 - wave) + 0.5}
          opacity={1 - wave}
        />
      )}
      {size > 0 && (
        <circle
          cx={at.x}
          cy={at.y}
          r={r * 0.75 * size}
          fill={`url(#${fire})`}
          opacity={Math.min(1, 1.6 - progress / gone)}
        />
      )}
      {spray < 1 &&
        Array.from({ length: 12 }, (_, i) => {
          const angle = hash01(i, 7, 1) * Math.PI * 2
          const reach = r * (0.25 + 1.5 * spray ** 0.55 * (0.5 + 0.8 * hash01(i, 7, 2)))
          const tick = 8 * (1 - spray) + 1
          const cos = Math.cos(angle)
          const sin = Math.sin(angle)
          return (
            <line
              key={`s${i}`}
              x1={at.x + cos * reach}
              y1={at.y + sin * reach}
              x2={at.x + cos * (reach + tick)}
              y2={at.y + sin * (reach + tick)}
              stroke={PLASMA_CORE}
              strokeWidth={1.8}
              strokeLinecap="round"
              opacity={1 - spray}
            />
          )
        })}
      {Array.from({ length: 9 }, (_, i) => {
        const angle = hash01(i, 8, 1) * Math.PI * 2
        const reach = r * (0.3 + 0.8 * progress ** 0.8 * hash01(i, 8, 2))
        return (
          <circle
            key={`e${i}`}
            cx={at.x + Math.cos(angle) * reach}
            cy={at.y + Math.sin(angle) * reach - 10 * progress}
            r={(1 + 1.8 * hash01(i, 8, 3)) * (1 - 0.6 * progress)}
            fill={effect.color}
            opacity={linger}
          />
        )
      })}
    </g>
  )
}

/**
 * A disruptor's pulse: the box it fires into floods violet from the attacker
 * outward, a front running across it, and from every cell of it a crackling
 * ray closes on the target and stops at its shield. The box is the effect's
 * own (`cells`, the engine's answer when the shot went off).
 */
function RayPulse({ effect, progress, pointOf }: DrawProps<'ray'>) {
  const { from, to } = endsOf(effect, pointOf)
  const sources = raySources(effect.cells, effect.from, from)
  const furthest = Math.max(1, ...sources.map(s => s.distance))
  const front = (progress / RAY_PULSE.flood) * (furthest + 40)
  const fade = rayFade(progress)
  const step = Math.floor(progress * RAY_PULSE.flickers)
  const clip = `ray-${effect.id}`
  const wedges = effect.cells.map(cell => {
    const r = ringRadius(cell.wellId, cell.ring)
    return sectorWedgePath(cell.wellId, cell.sector, r - 13, r + 13)
  })
  const arrived = sources.some(s => rayReach(progress, s.share) >= 1)
  return (
    <g opacity={fade}>
      <defs>
        <clipPath id={clip}>
          {wedges.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </clipPath>
      </defs>
      {sources.map((source, i) => {
        // A cell lights as the front reaches it and settles to a wash.
        const lit = Math.min(1, Math.max(0, (front - source.distance) / 26))
        if (lit <= 0) return null
        const flash = Math.max(0, 1 - (front - source.distance) / 120)
        const r = ringRadius(source.cell.wellId, source.cell.ring)
        return (
          <path
            key={i}
            d={sectorWedgePath(source.cell.wellId, source.cell.sector, r - 13, r + 13)}
            fill={effect.color}
            fillOpacity={lit * (0.18 + 0.32 * flash)}
            stroke={effect.color}
            strokeWidth={1.2}
            strokeOpacity={0.4 + 0.5 * flash}
          />
        )
      })}
      {progress < RAY_PULSE.flood * 1.2 && (
        <circle
          cx={from.x}
          cy={from.y}
          r={front}
          fill="none"
          stroke={BOARD.ink}
          strokeWidth={3}
          clipPath={`url(#${clip})`}
        />
      )}
      {sources.map((source, i) => {
        const end = rayEnd(source.start, to, effect.stopAt)
        const reach = rayReach(progress, source.share)
        if (!end || reach <= 0) return null
        const tip = {
          x: source.start.x + (end.x - source.start.x) * reach,
          y: source.start.y + (end.y - source.start.y) * reach,
        }
        const points = polyline(crackle(source.start, tip, source.seed, step))
        return (
          <g key={`ray-${i}`}>
            <polyline
              points={points}
              fill="none"
              stroke={effect.color}
              strokeWidth={3.2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <polyline
              points={points}
              fill="none"
              stroke={BOARD.ink}
              strokeWidth={1}
              strokeLinejoin="round"
            />
          </g>
        )
      })}
      {arrived && (
        // Where the rays meet: the edge of the target's shield, ringing.
        <circle
          cx={to.x}
          cy={to.y}
          r={effect.stopAt}
          fill="none"
          stroke={effect.color}
          strokeWidth={2}
          strokeDasharray="5 4"
          strokeDashoffset={step * 3}
        />
      )}
    </g>
  )
}

/**
 * What struck a shield, splashing across it: a flash where it hit and rings
 * running out over the bubble from there, held inside the bubble's edge.
 */
function ShieldSplash({
  id,
  at,
  r,
  facing,
  accent,
  progress,
}: {
  id: string
  at: Point
  r: number
  facing: number
  accent: string
  progress: number
}) {
  const strike = { x: at.x + Math.cos(facing) * r, y: at.y + Math.sin(facing) * r }
  const clip = `${id}-bubble`
  const flash = `${id}-splash`
  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <circle cx={at.x} cy={at.y} r={r} />
        </clipPath>
        <PlasmaGradient id={flash} color={accent} />
      </defs>
      <g clipPath={`url(#${clip})`}>
        {[0, 1, 2].map(j => {
          // An angle over the bubble from the strike, drawn as the chord it makes.
          const front = progress * 4.4 - j * 0.55
          if (front <= 0 || front >= 3) return null
          return (
            <circle
              key={j}
              cx={strike.x}
              cy={strike.y}
              r={2 * r * Math.sin(front / 2)}
              fill="none"
              stroke={accent}
              strokeWidth={3.2 * (1 - progress) + 0.6}
              opacity={(1 - progress) * (1 - j * 0.25)}
            />
          )
        })}
      </g>
      {progress < 0.35 && (
        <circle
          cx={strike.x}
          cy={strike.y}
          r={r * (0.35 + 0.5 * (progress / 0.35))}
          fill={`url(#${flash})`}
          opacity={1 - progress / 0.35}
        />
      )}
    </g>
  )
}

/**
 * Something flaring round a hull. A shield is a teal bubble struck bright on
 * the side the shot came from; an EMP is violet crackle crawling over the
 * hull, on and off.
 */
function Flare({ effect, progress, pointOf }: DrawProps<'flare'>) {
  const at = pointOf(effect.playerId) ?? positionPoint(effect.at)
  const fade = 1 - progress
  if (effect.flare === 'plasma') return <PlasmaBurst effect={effect} progress={progress} at={at} />
  if (effect.flare === 'shield') {
    const source = effect.from
      ? positionPoint(effect.from)
      : effect.fromId
        ? pointOf(effect.fromId)
        : null
    // A wall that took everything flares in full; one that let some through, less.
    const strength = 0.4 + 0.6 * (effect.strength ?? 1)
    const facing = source ? Math.atan2(source.y - at.y, source.x - at.x) : -Math.PI / 2
    const r = effect.radius * (0.92 + 0.12 * progress)
    const spread = 0.8
    const arc = (a: number) => ({ x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r })
    const a0 = arc(facing - spread)
    const a1 = arc(facing + spread)
    return (
      <g opacity={fade * strength}>
        <circle
          cx={at.x}
          cy={at.y}
          r={r}
          fill={effect.color}
          fillOpacity={0.16}
          stroke={effect.color}
          strokeWidth={2.5}
        />
        <path
          d={`M ${a0.x} ${a0.y} A ${r} ${r} 0 0 1 ${a1.x} ${a1.y}`}
          fill="none"
          stroke={BOARD.ink}
          strokeWidth={5 * fade + 1}
          strokeLinecap="round"
        />
        {effect.accent && (
          <ShieldSplash
            id={effect.id}
            at={at}
            r={r}
            facing={facing}
            accent={effect.accent}
            progress={progress}
          />
        )}
      </g>
    )
  }
  const step = Math.floor(progress * 18)
  // Held, then gone: an EMP crackles at full strength and drops out late.
  const strength = Math.min(1, fade / 0.4)
  return (
    <g opacity={strength}>
      {progress < 0.25 && (
        <circle
          cx={at.x}
          cy={at.y}
          r={effect.radius * 0.7}
          fill={effect.color}
          opacity={0.5 * (1 - progress / 0.25)}
        />
      )}
      {Array.from({ length: 7 }, (_, i) => {
        // On for most steps, off for a few: a flicker, not a fade.
        if (hash01(i, step, 9) < 0.25) return null
        const a = hash01(i, step, 1) * Math.PI * 2
        const b = a + (0.6 + hash01(i, step, 2)) * (hash01(i, step, 3) < 0.5 ? -1 : 1)
        const outer = effect.radius
        const p = { x: at.x + Math.cos(a) * outer, y: at.y + Math.sin(a) * outer }
        const q = { x: at.x + Math.cos(b) * outer * 0.25, y: at.y + Math.sin(b) * outer * 0.25 }
        const points = polyline(crackle(p, q, i + 11, step, 4, 6))
        return (
          <g key={i}>
            <polyline
              points={points}
              fill="none"
              stroke={effect.color}
              strokeWidth={4}
              strokeLinejoin="round"
            />
            <polyline points={points} fill="none" stroke={BOARD.ink} strokeWidth={1.4} />
          </g>
        )
      })}
    </g>
  )
}

/**
 * The floats' inks. Red is what hurts and the heat track's own red is heat; a
 * critical is printed in full cream, so it reads as the loudest number without
 * a third red; a shield is the table's one cool ink.
 */
const TONE_COLORS = {
  damage: BOARD.red,
  shield: BOARD.teal,
  heat: BOARD.heat,
  miss: BOARD.inkFaint,
  crit: BOARD.ink,
  good: BOARD.good,
} as const

/** A line of the floats' 15-unit type, with air: one step of a pile-up. */
const FLOAT_LINE = 18

export const EffectsLayer = memo(function EffectsLayer({
  effects,
  pointOf,
  now,
}: {
  effects: ReadonlyArray<TableEffect>
  pointOf: BoardModel['pointOf']
  now: number
}) {
  return (
    <g className="effects" pointerEvents="none">
      {effects.map(effect => {
        // Nothing is drawn before it starts, as on the 3D board.
        if (now < effect.start) return null
        const progress = Math.min(1, Math.max(0, (now - effect.start) / effect.duration))
        if (effect.kind === 'beam') {
          const fade = progress < 0.25 ? progress / 0.25 : 1 - (progress - 0.25) / 0.75
          const head = Math.min(1, progress / 0.3)
          const from = (effect.fromId ? pointOf(effect.fromId) : null) ?? positionPoint(effect.from)
          const to = (effect.toId ? pointOf(effect.toId) : null) ?? positionPoint(effect.to)
          const x = from.x + (to.x - from.x) * head
          const y = from.y + (to.y - from.y) * head
          const dashed = effect.weapon === 'missiles' || effect.weapon === 'ballistic_rack'
          return (
            <g key={effect.id} opacity={Math.max(0, fade)}>
              <line
                x1={from.x}
                y1={from.y}
                x2={x}
                y2={y}
                stroke={effect.color}
                strokeWidth={effect.weapon === 'railgun' ? 5 : 3}
                strokeLinecap="round"
                strokeDasharray={dashed ? '6 5' : undefined}
              />
              <circle cx={x} cy={y} r={4} fill={effect.color} />
            </g>
          )
        }
        if (effect.kind === 'plasma')
          return (
            <PlasmaShot key={effect.id} effect={effect} progress={progress} pointOf={pointOf} />
          )
        if (effect.kind === 'ray')
          return <RayPulse key={effect.id} effect={effect} progress={progress} pointOf={pointOf} />
        if (effect.kind === 'flare')
          return <Flare key={effect.id} effect={effect} progress={progress} pointOf={pointOf} />
        if (effect.kind === 'burst') {
          const r = effect.radius * (0.3 + progress * 0.9)
          const at = pointOf(effect.playerId) ?? positionPoint(effect.at)
          return (
            <circle
              key={effect.id}
              cx={at.x}
              cy={at.y}
              r={r}
              fill="none"
              stroke={effect.color}
              strokeWidth={3 * (1 - progress) + 1}
              opacity={1 - progress}
            />
          )
        }
        if (effect.kind !== 'float') return null
        const anchor = pointOf(effect.playerId) ?? positionPoint(effect.at)
        const at = {
          x: anchor.x + (effect.offset?.x ?? 0),
          y: anchor.y + (effect.offset?.y ?? 0) - (effect.stack ?? 0) * FLOAT_LINE,
        }
        const rise = -38 * progress
        const opacity =
          progress < 0.1 ? progress / 0.1 : progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1
        const scale =
          progress < 0.18
            ? 0.6 + (progress / 0.18) * 0.55
            : 1.15 - Math.min(1, (progress - 0.18) / 0.2) * 0.15
        return (
          <g
            key={effect.id}
            opacity={Math.max(0, opacity)}
            transform={`translate(${at.x} ${at.y + rise}) scale(${scale})`}
          >
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={15}
              fontWeight={800}
              fontFamily={FONT_MONO}
              stroke={BOARD.ground}
              strokeWidth={4}
              strokeLinejoin="round"
            >
              {effect.text}
            </text>
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={15}
              fontWeight={800}
              fontFamily={FONT_MONO}
              fill={TONE_COLORS[effect.tone]}
            >
              {effect.text}
            </text>
          </g>
        )
      })}
    </g>
  )
})
