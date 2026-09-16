/**
 * A shot, drawn between two hulls.
 *
 * The timing is the flat board's, to the millisecond: the head travels out
 * over the first 30% of the effect and the whole thing fades in for a quarter
 * and out for three. Only the character is new — a railgun is a thick bright
 * bolt, a laser a thin continuous line, a rack and a missile launch dashed
 * tracers, point defence a fine cyan one.
 *
 * The bolt bows a little over its span. That is not decoration: a straight
 * chord between two sectors of the same well would fly over the funnel, and a
 * shot across the gap between two wells has to clear the black hole; a few
 * board units of lift keeps every beam above the surface it was fired over
 * without ever reading as anything but straight.
 */
import { useMemo, useRef } from 'react'
import { Quaternion, Vector3, type Group, type Mesh } from 'three'
import { useFrame } from '@react-three/fiber'
import type { WeaponType } from '@dangerous-inclinations/engine'
import type { TableEffect } from '../../../../../context/AnimationContext'
import { LAYER, positionWorld } from '../../world'
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
}

const STYLE: Record<WeaponType | 'pdc', BeamStyle> = {
  // A slug: thick, bright all the way, a hard head.
  railgun: { core: 4.6, glow: 10, dashes: 0, duty: 0.5, base: 0.55, tail: 0.28 },
  // A line of light: thin, even, no travelling head to speak of.
  laser: { core: 1.9, glow: 5.5, dashes: 0, duty: 0.5, base: 0.92, tail: 0.18 },
  // A tracer: the rounds are visible one by one.
  missiles: { core: 3, glow: 7.5, dashes: 13, duty: 0.55, base: 0.5, tail: 0.3 },
  ballistic_rack: { core: 2.6, glow: 7, dashes: 22, duty: 0.42, base: 0.45, tail: 0.3 },
  // Point defence: fast, fine, cyan.
  pdc: { core: 1.7, glow: 4.5, dashes: 26, duty: 0.34, base: 0.4, tail: 0.22 },
}

const UP = new Vector3(0, 1, 0)

export function Beam({ effect }: { effect: BeamEffect }) {
  const group = useRef<Group>(null)
  const head = useRef<Mesh>(null)
  const muzzle = useRef<Mesh>(null)

  const core = useEffectMaterial('bolt')
  const glow = useEffectMaterial('bolt')
  const spark = useEffectMaterial('glow')

  const style = STYLE[effect.weapon] ?? STYLE.railgun

  /** The shot's frame: both ends, its length, and the way the tube points. */
  const shot = useMemo(() => {
    const from = positionWorld(effect.from, MUZZLE)
    const to = positionWorld(effect.to, MUZZLE)
    const span = new Vector3().subVectors(to, from)
    const length = Math.max(1, span.length())
    return {
      from,
      to,
      length,
      bow: Math.min(MAX_BOW, length * BOW),
      mid: new Vector3().addVectors(from, to).multiplyScalar(0.5),
      aim: new Quaternion().setFromUnitVectors(UP, span.clone().divideScalar(length)),
    }
  }, [effect.from, effect.to])

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

    for (const material of [core, glow]) {
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
