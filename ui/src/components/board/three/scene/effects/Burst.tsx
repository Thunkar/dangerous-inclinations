/**
 * A burst: something happened here.
 *
 * The flat board draws one expanding circle. In three dimensions that circle
 * is a shockwave running out across the surface, a core that flashes and dies,
 * and a puff of sparks thrown off the sector — the same event with enough life
 * that a detonation reads as a detonation and a dock does not.
 *
 * Colour and radius are the effect's; the animator already decides what a
 * burst means (red for a kill, amber for a critical or a jump arrival, green
 * for a dock, a respawn or a deployment).
 */
import { useEffect, useMemo, useRef } from 'react'
import type { Group, Mesh, Points } from 'three'
import { useFrame } from '@react-three/fiber'
import type { TableEffect } from '../../../../../context/AnimationContext'
import type { BoardModel } from '../../../model'
import { positionPoint } from '../../../geometry'
import { LAYER, elevationAt, toWorld } from '../../world'
import { reportImpact, type ImpactKind } from './impacts'
import {
  FLAT,
  NO_RAYCAST,
  ballGeometry,
  discGeometry,
  puffGeometry,
  useEffectMaterial,
} from './resources'

type BurstEffect = Extract<TableEffect, { kind: 'burst' }>

/** How far off the surface the sparks and the core sit: hull height. */
const CORE_HEIGHT = 16

/** The flat board's circle grows from 0.3 to 1.2 of the effect's radius. */
const SPREAD = 1.2

/** What a burst of each colour does to the hull standing in it. */
const MEANING: Record<string, ImpactKind> = {
  '#ff5a72': 'damage',
  '#ffb445': 'crit',
  '#46d191': 'good',
}

export function Burst({
  effect,
  pointOf,
}: {
  effect: BurstEffect
  pointOf: BoardModel['pointOf']
}) {
  const group = useRef<Group>(null)
  const core = useRef<Mesh>(null)
  const sparks = useRef<Points>(null)

  const shock = useEffectMaterial('shock')
  const puff = useEffectMaterial('puff')
  const glow = useEffectMaterial('glow')

  // Over the hull it is about, which is not the middle of its sector when
  // somebody else is standing there too; its sector once it has left the table.
  const anchor = useMemo(
    () =>
      toWorld(
        pointOf(effect.playerId) ?? positionPoint(effect.at),
        elevationAt(effect.at) + LAYER.effect
      ),
    [effect.at, effect.playerId, pointOf]
  )

  // A burst is the cue that something happened to the ship it names: the hull
  // reads it back out of here rather than out of an event of its own.
  useEffect(() => {
    const kind = MEANING[effect.color.toLowerCase()]
    if (kind) reportImpact(effect.playerId, kind, effect.start)
  }, [effect.playerId, effect.color, effect.start])

  useFrame(() => {
    const node = group.current
    if (!node) return
    const progress = (performance.now() - effect.start) / effect.duration
    if (progress < 0 || progress >= 1) {
      node.visible = false
      return
    }
    node.visible = true
    const fade = 1 - progress

    shock.uniforms.uColor.value.set(effect.color)
    shock.uniforms.uRadius.value = (0.3 + 0.9 * progress) / SPREAD
    shock.uniforms.uWidth.value = 0.14 * (1 - 0.5 * progress)
    shock.uniforms.uFade.value = fade ** 1.25
    shock.uniforms.uCore.value = Math.max(0, 1 - progress * 4.5)

    puff.uniforms.uColor.value.set(effect.color)
    puff.uniforms.uProgress.value = progress ** 0.7
    puff.uniforms.uRadius.value = effect.radius * 1.35
    puff.uniforms.uSize.value = 6 + effect.radius * 0.12
    puff.uniforms.uFade.value = fade ** 1.8

    glow.color.set(effect.color)
    glow.opacity = Math.max(0, 1 - progress * 3.2)
    const ball = core.current
    if (ball) ball.scale.setScalar(effect.radius * 0.3 * (0.45 + 0.9 * progress))
    const cloud = sparks.current
    if (cloud) cloud.visible = puff.uniforms.uFade.value > 0.01
  })

  return (
    <group ref={group} position={anchor} visible={false}>
      <mesh
        geometry={discGeometry()}
        material={shock}
        rotation={FLAT}
        scale={effect.radius * SPREAD}
        renderOrder={6}
        raycast={NO_RAYCAST}
      />
      <points
        ref={sparks}
        geometry={puffGeometry()}
        material={puff}
        position={[0, CORE_HEIGHT, 0]}
        frustumCulled={false}
        renderOrder={7}
      />
      <mesh
        ref={core}
        geometry={ballGeometry()}
        material={glow}
        position={[0, CORE_HEIGHT, 0]}
        renderOrder={7}
        raycast={NO_RAYCAST}
      />
    </group>
  )
}
