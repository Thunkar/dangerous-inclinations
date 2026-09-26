/**
 * A shot, drawn between two hulls.
 *
 * The timing is the flat board's, to the millisecond: the head travels out
 * over the first 30% of the effect and the whole thing fades in for a quarter
 * and out for three. Only the character is new: a laser is a thin continuous
 * line, a missile launch a dashed tracer and a scan a fine teal one. The two
 * kinetic weapons are not beams at all. A railgun fires one heavy slug, a long
 * bright streak that crosses fast and flashes where it lands; a ballistic rack
 * throws a stream of rounds, each a short streak you can count, whether it is
 * firing at a ship or at a missile (point defence).
 *
 * The bolt bows a little over its span. That is not decoration: a straight
 * chord between two sectors of the same well would fly over the funnel, and a
 * shot across the gap between two wells has to clear the black hole. Rounds
 * and the laser are the exceptions, because a slug or light that curves reads
 * as wrong at once: they fly dead straight, and the laser is drawn over the
 * surface rather than into it, so a shot across a terrace is never swallowed
 * by the step between.
 */
import { useMemo, useRef } from 'react'
import { Quaternion, Vector3, type Group, type Mesh } from 'three'
import { useFrame } from '@react-three/fiber'
import type { Position, WeaponType } from '@dangerous-inclinations/engine'
import type { TableEffect } from '../../../../../context/AnimationContext'
import type { BoardModel } from '../../../model'
import { positionPoint } from '../../../geometry'
import { LAYER, elevationAt, toWorld } from '../../world'
import { NO_RAYCAST, ballGeometry, boltGeometry, useEffectMaterial } from './resources'

type BeamEffect = Extract<TableEffect, { kind: 'beam' }>

/** Where a shot leaves a hull: the nozzle height of the ship model. */
const MUZZLE = LAYER.token + 9

/** Enough lift to clear the funnel, little enough that the shot reads straight. */
const BOW = 0.05
const MAX_BOW = 26

interface BeamStyle {
  /** Radius of the bolt itself, in board units. */
  core: number
  /** Radius of the soft envelope around it. */
  glow: number
  /** Dashes over the whole span; 0 for a continuous beam. */
  dashes: number
  duty: number
  /** Brightness of the shaft behind the head. */
  base: number
  /** How much of the span the bright head spreads over. */
  tail: number
  /** Lift over the span, as a share of it; the laser's is zero. */
  bow?: number
  /** Drawn over the surface rather than depth-tested against it. */
  overlay?: boolean
  /** A stream of this many rounds instead of a beam. */
  rounds?: number
  /** A round's streak, in board units. */
  roundLength?: number
  /** Share of the effect's life a round takes to arrive. */
  roundFlight?: number
  /** A flash where the round lands. */
  impact?: boolean
}

const STYLE: Record<WeaponType | 'pdc' | 'scan', BeamStyle> = {
  // A slug: thick, bright all the way, a hard head.
  // A slug: one heavy streak, fast and straight, flashing where it lands.
  railgun: {
    core: 3.4,
    glow: 0,
    dashes: 0,
    duty: 0,
    base: 0,
    tail: 0,
    bow: 0,
    rounds: 1,
    roundLength: 34,
    roundFlight: 0.2,
    impact: true,
  },
  // A line of light: thin, even, straight, no travelling head to speak of.
  laser: {
    core: 1.9,
    glow: 5.5,
    dashes: 0,
    duty: 0.5,
    base: 0.92,
    tail: 0.18,
    bow: 0,
    overlay: true,
  },
  // A tracer: the rounds are visible one by one.
  missiles: { core: 3, glow: 7.5, dashes: 13, duty: 0.55, base: 0.5, tail: 0.3 },
  // Rounds, not a beam: a burst of short streaks down a straight line.
  ballistic_rack: {
    core: 1.5,
    glow: 0,
    dashes: 0,
    duty: 0,
    base: 0,
    tail: 0,
    bow: 0,
    rounds: 7,
  },
  pdc: { core: 1.2, glow: 0, dashes: 0, duty: 0, base: 0, tail: 0, bow: 0, rounds: 6 },
  // A sensor sweep: fast, fine, teal.
  scan: { core: 1.7, glow: 4.5, dashes: 26, duty: 0.34, base: 0.4, tail: 0.22 },
}

/**
 * The stream of rounds, as shares of the effect's life: each leaves the muzzle
 * `ROUND_GAP` after the last and takes `ROUND_FLIGHT` to arrive, so the last of
 * seven lands at 0.23 + 6 × 0.075 ≈ 0.68, before the fade has gone too far.
 */
const ROUND_GAP = 0.075
const ROUND_FLIGHT = 0.23
/** How long a round's streak is, in board units. */
const ROUND_LENGTH = 9

const UP = new Vector3(0, 1, 0)

export function Beam({ effect, pointOf }: { effect: BeamEffect; pointOf: BoardModel['pointOf'] }) {
  const group = useRef<Group>(null)
  const head = useRef<Mesh>(null)
  const muzzle = useRef<Mesh>(null)
  const hit = useRef<Mesh>(null)
  const rounds = useRef<(Mesh | null)[]>([])

  const core = useEffectMaterial('bolt')
  const glow = useEffectMaterial('bolt')
  const spark = useEffectMaterial('glow')

  const style = STYLE[effect.weapon] ?? STYLE.railgun

  /**
   * The shot's frame: both ends, its length, and the way the tube points.
   *
   * An end that names a ship is the hull's own point, so a shot at one of two
   * ships sharing a sector lands on the one that was hit, and a shot between
   * them is a short beam rather than no beam at all. An end that names nothing
   * (a missile a rack is shooting down) stays on its sector, and so does a ship
   * that has left the table.
   */
  const shot = useMemo(() => {
    const end = (id: string | undefined, position: Position) =>
      toWorld((id ? pointOf(id) : null) ?? positionPoint(position), elevationAt(position) + MUZZLE)
    const from = end(effect.fromId, effect.from)
    const to = end(effect.toId, effect.to)
    const span = new Vector3().subVectors(to, from)
    const length = Math.max(1, span.length())
    return {
      from,
      to,
      length,
      bow: Math.min(MAX_BOW, length * (style.bow ?? BOW)),
      mid: new Vector3().addVectors(from, to).multiplyScalar(0.5),
      aim: new Quaternion().setFromUnitVectors(UP, span.clone().divideScalar(length)),
    }
  }, [effect.from, effect.to, effect.fromId, effect.toId, pointOf, style.bow])

  const point = useMemo(() => new Vector3(), [])

  useFrame(() => {
    const node = group.current
    if (!node) return
    const progress = (performance.now() - effect.start) / effect.duration
    if (progress < 0 || progress >= 1) {
      node.visible = false
      return
    }
    node.visible = true

    // The flat board's curves, unchanged.
    const fade = progress < 0.25 ? progress / 0.25 : 1 - (progress - 0.25) / 0.75
    const reach = Math.min(1, progress / 0.3)

    if (style.rounds) {
      // Each round flies its own straight line; the muzzle flickers once per round.
      spark.color.set(effect.color)
      spark.opacity = 1
      const flight = style.roundFlight ?? ROUND_FLIGHT
      let firing = false
      rounds.current.forEach((round, i) => {
        if (!round) return
        const t = (progress - i * ROUND_GAP) / flight
        round.visible = t >= 0 && t <= 1
        if (!round.visible) return
        firing ||= t < 0.25
        round.position.lerpVectors(shot.from, shot.to, t)
      })
      const flash = muzzle.current
      if (flash) {
        const cycle = (progress / ROUND_GAP) % 1
        flash.scale.setScalar(firing ? style.core * 3 * (1 - cycle) : 0.001)
      }
      // The landing: a flash that swells and goes out just after the last round arrives.
      const landing = hit.current
      if (landing) {
        const after = (progress - ((style.rounds - 1) * ROUND_GAP + flight)) / 0.18
        landing.visible = after >= 0 && after < 1
        if (landing.visible) landing.scale.setScalar(style.core * (2 + 4 * after) * (1 - after))
      }
      return
    }

    for (const material of [core, glow]) {
      // Pooled materials are shared between kinds of shot, so this is set
      // every frame rather than once.
      material.depthTest = !style.overlay
      const uniforms = material.uniforms
      uniforms.uColor.value.set(effect.color)
      uniforms.uHead.value = reach
      uniforms.uDashes.value = style.dashes
      uniforms.uDuty.value = style.duty
      uniforms.uSpeed.value = 1.6
      uniforms.uBow.value = shot.bow
      uniforms.uTail.value = style.tail
    }
    // The core is a solid bolt; the envelope around it is light, so it fades
    // out toward its own edge and reads as glow rather than as a second tube.
    core.uniforms.uFade.value = fade
    core.uniforms.uBase.value = style.base
    core.uniforms.uSoft.value = 0.4
    glow.uniforms.uFade.value = fade * 0.26
    glow.uniforms.uBase.value = Math.min(1, style.base + 0.3)
    glow.uniforms.uSoft.value = 1

    // The head, where the flat board puts its dot, and the flash left behind
    // at the muzzle for as long as the shot is leaving it.
    const rise = shot.bow * Math.sin(Math.PI * reach)
    point.lerpVectors(shot.from, shot.to, reach)
    const dot = head.current
    if (dot) {
      dot.position.set(point.x, point.y + rise, point.z)
      dot.scale.setScalar(style.core * (1.5 + 0.8 * fade))
    }
    const flash = muzzle.current
    if (flash) flash.scale.setScalar(style.core * 2.6 * Math.max(0, 1 - progress / 0.3))
    spark.color.set(effect.color)
    spark.opacity = Math.max(0, fade)
  })

  if (style.rounds) {
    return (
      <group ref={group} visible={false}>
        {Array.from({ length: style.rounds }, (_, i) => (
          <mesh
            key={i}
            ref={node => {
              rounds.current[i] = node
            }}
            geometry={ballGeometry()}
            material={spark}
            quaternion={shot.aim}
            scale={[style.core, style.roundLength ?? ROUND_LENGTH, style.core]}
            visible={false}
            renderOrder={7}
            raycast={NO_RAYCAST}
          />
        ))}
        <mesh
          ref={muzzle}
          geometry={ballGeometry()}
          material={spark}
          position={shot.from}
          renderOrder={7}
          raycast={NO_RAYCAST}
        />
        {style.impact && (
          <mesh
            ref={hit}
            geometry={ballGeometry()}
            material={spark}
            position={shot.to}
            visible={false}
            renderOrder={7}
            raycast={NO_RAYCAST}
          />
        )}
      </group>
    )
  }

  return (
    <group ref={group} visible={false}>
      <mesh
        geometry={boltGeometry()}
        material={glow}
        position={shot.mid}
        quaternion={shot.aim}
        scale={[style.glow, shot.length, style.glow]}
        frustumCulled={false}
        renderOrder={6}
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={boltGeometry()}
        material={core}
        position={shot.mid}
        quaternion={shot.aim}
        scale={[style.core, shot.length, style.core]}
        frustumCulled={false}
        renderOrder={7}
        raycast={NO_RAYCAST}
      />
      <mesh
        ref={head}
        geometry={ballGeometry()}
        material={spark}
        renderOrder={7}
        raycast={NO_RAYCAST}
      />
      <mesh
        ref={muzzle}
        geometry={ballGeometry()}
        material={spark}
        position={shot.from}
        renderOrder={7}
        raycast={NO_RAYCAST}
      />
    </group>
  )
}
