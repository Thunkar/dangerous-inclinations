/**
 * Plasma bursting on the hull it reached.
 *
 * A turbulent ball of green-white fire swells off the hull in a moment and
 * falls back in on itself; a shockwave runs out across the board under it, a
 * pool of green light flares there and dies, a spray of sparks is thrown off
 * and a few embers hang in the air after the fire has gone. The fire is the
 * same program as a bolt (`plasma`), with no tail and a harder boil. The hull
 * itself flashes green (`impacts.ts`).
 *
 * The flat board draws the same moment as a filled flash, a ring and spark
 * ticks with embers left behind.
 */
import { useEffect, useMemo, useRef } from 'react'
import type { Group, Mesh } from 'three'
import { useFrame } from '@react-three/fiber'
import type { TableEffect } from '../../../../../animation/beats'
import type { BoardModel } from '../../../model'
import { positionPoint } from '../../../geometry'
import { FX_INK } from '../../palette'
import { LAYER, elevationAt } from '../../world'
import { reportImpact } from './impacts'
import {
  FLAT,
  MUZZLE,
  NO_RAYCAST,
  discGeometry,
  plasmaGeometry,
  puffGeometry,
  useEffectMaterial,
  useLight,
} from './resources'

type FlareEffect = Extract<TableEffect, { kind: 'flare' }>

/** When the fire is at its biggest, and when it has gone, as shares of the effect. */
const PEAK = 0.16
const GONE = 0.6

export function Fireball({
  effect,
  pointOf,
}: {
  effect: FlareEffect
  pointOf: BoardModel['pointOf']
}) {
  const group = useRef<Group>(null)
  const ball = useRef<Mesh>(null)

  const fire = useEffectMaterial('plasma')
  const shock = useEffectMaterial('shock')
  const light = useEffectMaterial('shock')
  const sparks = useEffectMaterial('puff')
  const embers = useEffectMaterial('puff')

  const anchor = useMemo(() => {
    const point = pointOf(effect.playerId) ?? positionPoint(effect.at)
    const ground = elevationAt(effect.at)
    return { x: point.x, z: point.y, hull: ground + MUZZLE, ground: ground + LAYER.wedge }
  }, [effect.at, effect.playerId, pointOf])

  useLight(light)

  useEffect(() => {
    reportImpact(effect.playerId, 'plasma', effect.start)
  }, [effect.playerId, effect.start])

  useFrame(() => {
    const node = group.current
    if (!node) return
    const progress = (performance.now() - effect.start) / effect.duration
    if (progress < 0 || progress >= 1) {
      node.visible = false
      return
    }
    node.visible = true
    const r = effect.radius

    // The fire: out fast, then in on itself.
    const burning = progress < GONE
    if (ball.current) {
      ball.current.visible = burning
      const size =
        progress < PEAK
          ? 0.35 + 0.85 * Math.sqrt(progress / PEAK)
          : 1.2 * (1 - (progress - PEAK) / (GONE - PEAK)) ** 0.8
      ball.current.scale.setScalar(r * 0.58 * Math.max(0.01, size))
    }
    const u = fire.uniforms
    u.uCore.value.set(FX_INK.plasmaCore)
    u.uGlow.value.set(effect.color)
    u.uFade.value = burning ? Math.min(1, 1.6 - progress / GONE) : 0
    u.uHeat.value = 1.25 * Math.max(0, 1 - progress / (GONE * 0.7))
    u.uStretch.value = 0
    u.uBoil.value = 0.5
    u.uSeed.value = 4.2

    const wave = Math.min(1, progress / 0.55)
    shock.uniforms.uColor.value.set(effect.color)
    shock.uniforms.uRadius.value = 0.12 + 0.88 * wave ** 0.7
    shock.uniforms.uWidth.value = 0.09 * (1 - 0.5 * wave)
    shock.uniforms.uFade.value = (1 - wave) ** 1.3
    shock.uniforms.uCore.value = 0

    light.uniforms.uColor.value.set(effect.color)
    light.uniforms.uRadius.value = 1
    light.uniforms.uWidth.value = 0.0001
    light.uniforms.uCore.value = 1
    light.uniforms.uFade.value = 0.9 * (1 - Math.min(1, progress / 0.5)) ** 2

    const spray = Math.min(1, progress / 0.45)
    sparks.uniforms.uColor.value.set(FX_INK.plasmaCore)
    sparks.uniforms.uProgress.value = spray ** 0.55
    sparks.uniforms.uRadius.value = r * 1.7
    sparks.uniforms.uSize.value = 9
    sparks.uniforms.uFade.value = (1 - spray) ** 1.4

    embers.uniforms.uColor.value.set(effect.color)
    embers.uniforms.uProgress.value = 0.25 + 0.5 * progress ** 0.8
    embers.uniforms.uRadius.value = r * 1.05
    embers.uniforms.uSize.value = 6
    embers.uniforms.uFade.value = progress < 0.15 ? progress / 0.15 : (1 - progress) ** 1.2
  })

  return (
    <group ref={group} visible={false}>
      <mesh
        geometry={discGeometry()}
        material={light}
        position={[anchor.x, anchor.ground, anchor.z]}
        rotation={FLAT}
        scale={effect.radius * 2}
        renderOrder={5}
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={discGeometry()}
        material={shock}
        position={[anchor.x, anchor.ground + 0.5, anchor.z]}
        rotation={FLAT}
        scale={effect.radius * 2.6}
        renderOrder={6}
        raycast={NO_RAYCAST}
      />
      <mesh
        ref={ball}
        geometry={plasmaGeometry()}
        material={fire}
        position={[anchor.x, anchor.hull, anchor.z]}
        frustumCulled={false}
        renderOrder={8}
        raycast={NO_RAYCAST}
      />
      <points
        geometry={puffGeometry(34)}
        material={sparks}
        position={[anchor.x, anchor.hull, anchor.z]}
        frustumCulled={false}
        renderOrder={7}
      />
      <points
        geometry={puffGeometry(18)}
        material={embers}
        position={[anchor.x, anchor.hull, anchor.z]}
        frustumCulled={false}
        renderOrder={7}
      />
    </group>
  )
}
