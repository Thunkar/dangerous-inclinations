/**
 * Something flaring round a hull.
 *
 * A shield taking a shot is a bubble round the ship, faint across its face,
 * bright at its rim and white where the shot struck it, with a ring run out
 * across the surface under it; it swells a little and goes out. An EMP getting
 * through is violet crackle crawling over the hull, thrown again many times a
 * second and dropping out now and then, so it flickers rather than fades. The
 * flat board draws the same two things as a ring with a lit arc and as a few
 * jagged strokes. When what struck the shield was plasma (`accent`), its green
 * splashes across the bubble from the strike in rings. Plasma bursting on a
 * hull is a fireball of its own (`Fireball.tsx`).
 *
 * Like a burst, a flare is the cue that something happened to the ship it
 * names, so it posts the hull's reaction to `impacts.ts`.
 */
import { useEffect, useMemo, useRef } from 'react'
import { Quaternion, Vector3, type Group, type Mesh } from 'three'
import { useFrame } from '@react-three/fiber'
import type { TableEffect } from '../../../../../animation/beats'
import type { BoardModel } from '../../../model'
import { positionPoint } from '../../../geometry'
import { crackle, hash01 } from '../../../fx'
import { elevationAt, toWorld } from '../../world'
import { reportImpact } from './impacts'
import {
  FLAT,
  MUZZLE,
  NO_RAYCAST,
  ballGeometry,
  boltGeometry,
  discGeometry,
  shellGeometry,
  useEffectMaterial,
} from './resources'

type FlareEffect = Extract<TableEffect, { kind: 'flare' }>

/** EMP crackle: how many arcs, how many pieces each, and how often they are thrown again. */
const ARCS = 6
const ARC_SEGMENTS = 4
const FLICKERS = 18

const UP = new Vector3(0, 1, 0)

export function Flare({
  effect,
  pointOf,
}: {
  effect: FlareEffect
  pointOf: BoardModel['pointOf']
}) {
  const group = useRef<Group>(null)
  const bubble = useRef<Mesh>(null)
  const ground = useRef<Mesh>(null)
  const heart = useRef<Mesh>(null)
  const threads = useRef<(Mesh | null)[]>([])
  const glows = useRef<(Mesh | null)[]>([])

  const shell = useEffectMaterial('shell')
  const shock = useEffectMaterial('shock')
  const core = useEffectMaterial('glow')
  const glow = useEffectMaterial('glow')

  const centre = useMemo(
    () =>
      toWorld(
        pointOf(effect.playerId) ?? positionPoint(effect.at),
        elevationAt(effect.at) + MUZZLE
      ),
    [effect.at, effect.playerId, pointOf]
  )

  /** Toward whoever fired, along the board: the side of the bubble the shot struck. */
  const strike = useMemo(() => {
    const source = effect.from
      ? positionPoint(effect.from)
      : effect.fromId
        ? pointOf(effect.fromId)
        : null
    if (!source) return new Vector3(0, 1, 0)
    return new Vector3(source.x - centre.x, 0, source.y - centre.z).normalize()
  }, [effect.from, effect.fromId, pointOf, centre])

  useEffect(() => {
    reportImpact(effect.playerId, effect.flare === 'shield' ? 'shield' : 'crit', effect.start)
  }, [effect.playerId, effect.flare, effect.start])

  const scratch = useMemo(
    () => ({ p: new Vector3(), q: new Vector3(), dir: new Vector3(), aim: new Quaternion() }),
    []
  )

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

    if (effect.flare === 'shield') {
      // A wall that took everything flares in full; one that let some through, less.
      const strength = 0.4 + 0.6 * (effect.strength ?? 1)
      shell.uniforms.uColor.value.set(effect.color)
      shell.uniforms.uFade.value = strength * fade ** 1.2
      shell.uniforms.uStrike.value.copy(strike)
      shell.uniforms.uStrikeAmount.value = Math.max(0, 1 - progress * 1.6)
      // What struck it, splashing out across the bubble from where it hit.
      shell.uniforms.uAccent.value.set(effect.accent ?? effect.color)
      shell.uniforms.uRipple.value = effect.accent ? (1 - progress) ** 0.7 : 0
      shell.uniforms.uPhase.value = progress * 4.4
      bubble.current?.scale.setScalar(effect.radius * (0.92 + 0.12 * progress))
      shock.uniforms.uColor.value.set(effect.color)
      shock.uniforms.uRadius.value = 0.55 + 0.45 * progress
      shock.uniforms.uWidth.value = 0.08
      shock.uniforms.uFade.value = strength * fade ** 1.5
      shock.uniforms.uCore.value = 0
      return
    }

    // The EMP: arcs from the edge of the hull's space in toward it, thrown again
    // every step, and a few of them out on any one step.
    const step = Math.floor(progress * FLICKERS)
    core.color.set('#ffffff')
    core.opacity = fade
    glow.color.set(effect.color)
    glow.opacity = 0.8 * fade
    const flicker = hash01(step, 5, 5) < 0.25 ? 0.35 : 1
    if (heart.current) heart.current.scale.setScalar(effect.radius * 0.35 * flicker * fade + 0.001)
    const { p, q, dir, aim } = scratch
    const r = effect.radius
    for (let arc = 0; arc < ARCS; arc++) {
      const on = hash01(arc, step, 9) >= 0.3
      const a = hash01(arc, step, 1) * Math.PI * 2
      const b = a + (0.6 + hash01(arc, step, 2)) * (hash01(arc, step, 3) < 0.5 ? -1 : 1)
      const lift = (hash01(arc, step, 4) - 0.35) * r * 0.6
      const outer = { x: Math.cos(a) * r, y: Math.sin(a) * r }
      const inner = { x: Math.cos(b) * r * 0.3, y: Math.sin(b) * r * 0.3 }
      const points = crackle(outer, inner, arc + 11, step, ARC_SEGMENTS, 5)
      for (let k = 0; k < ARC_SEGMENTS; k++) {
        const slot = arc * ARC_SEGMENTS + k
        const pair = [threads.current[slot], glows.current[slot]] as const
        if (!on) {
          for (const mesh of pair) if (mesh) mesh.visible = false
          continue
        }
        const s = points[k]
        const e = points[k + 1]
        p.set(centre.x + s.x, centre.y + lift * (1 - k / ARC_SEGMENTS), centre.z + s.y)
        q.set(centre.x + e.x, centre.y + lift * (1 - (k + 1) / ARC_SEGMENTS), centre.z + e.y)
        dir.subVectors(q, p)
        const length = Math.max(0.001, dir.length())
        aim.setFromUnitVectors(UP, dir.divideScalar(length))
        pair.forEach((mesh, layer) => {
          if (!mesh) return
          mesh.visible = true
          mesh.position.addVectors(p, q).multiplyScalar(0.5)
          mesh.quaternion.copy(aim)
          const width = layer === 0 ? 0.7 : 2.2
          mesh.scale.set(width, length, width)
        })
      }
    }
  })

  if (effect.flare === 'shield') {
    return (
      <group ref={group} visible={false}>
        <mesh
          ref={bubble}
          geometry={shellGeometry()}
          material={shell}
          position={centre}
          renderOrder={7}
          raycast={NO_RAYCAST}
        />
        <mesh
          ref={ground}
          geometry={discGeometry()}
          material={shock}
          position={centre}
          rotation={FLAT}
          scale={effect.radius * 1.5}
          renderOrder={6}
          raycast={NO_RAYCAST}
        />
      </group>
    )
  }

  return (
    <group ref={group} visible={false}>
      <mesh
        ref={heart}
        geometry={ballGeometry()}
        material={glow}
        position={centre}
        renderOrder={6}
        raycast={NO_RAYCAST}
      />
      {Array.from({ length: ARCS * ARC_SEGMENTS }, (_, slot) => (
        <group key={slot}>
          <mesh
            ref={node => {
              glows.current[slot] = node
            }}
            geometry={boltGeometry()}
            material={glow}
            visible={false}
            frustumCulled={false}
            renderOrder={6}
            raycast={NO_RAYCAST}
          />
          <mesh
            ref={node => {
              threads.current[slot] = node
            }}
            geometry={boltGeometry()}
            material={core}
            visible={false}
            frustumCulled={false}
            renderOrder={7}
            raycast={NO_RAYCAST}
          />
        </group>
      ))}
    </group>
  )
}
