/**
 * A disruptor's pulse: an area, not a projectile.
 *
 * The box it fires into is the effect's own (`cells`, the engine's answer when
 * the shot went off), laid on the surface as one merged patch the way a range
 * preview is. A front runs out across it from the attacker, each sector
 * flashing as it is reached and left crackling behind it, and from every
 * sector a jagged ray of violet closes on the target and stops at the edge of
 * its shield, where a ring lights as they meet. What happens there (a shield
 * flaring, or the EMP getting into the hull) is the animator's next mark.
 *
 * The choreography is the flat board's (`fx.ts`); the rays are re-thrown a
 * couple of dozen times over the effect's life, so they crackle rather than
 * slide. The patch's buffers belong to this effect and go back to the GPU
 * with it; the materials are the pool's.
 */
import { useEffect, useMemo, useRef } from 'react'
import { LineBasicMaterial, Quaternion, Vector3, type Group, type Mesh } from 'three'
import { useFrame } from '@react-three/fiber'
import type { TableEffect } from '../../../../../animation/beats'
import type { BoardModel } from '../../../model'
import { positionPoint } from '../../../geometry'
import { RAY_PULSE, crackle, rayEnd, rayFade, rayReach, raySources } from '../../../fx'
import { LAYER, elevationAt } from '../../world'
import { WEDGE_BAND, wedgeFieldGeometry, wedgeOutlineGeometry } from '../overlays/wedges'
import {
  FLAT,
  MUZZLE,
  NO_RAYCAST,
  boltGeometry,
  discGeometry,
  useEffectMaterial,
} from './resources'

type RayEffect = Extract<TableEffect, { kind: 'ray' }>

/** Just over the range wedges, so a pulse fired while one is shown sits on top of it. */
const FIELD_LIFT = LAYER.wedge + 1.2
/** Where a ray leaves its sector: off the surface, under a hull. */
const RAY_FOOT = LAYER.effect
/** The ray's bright thread and the violet around it, in board units. */
const CORE_RADIUS = 0.9
const ENVELOPE_RADIUS = 2.6

const UP = new Vector3(0, 1, 0)

export function Ray({ effect, pointOf }: { effect: RayEffect; pointOf: BoardModel['pointOf'] }) {
  const group = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const cores = useRef<(Mesh | null)[]>([])
  const envelopes = useRef<(Mesh | null)[]>([])

  const field = useEffectMaterial('field')
  const shock = useEffectMaterial('shock')
  const core = useEffectMaterial('glow')
  const envelope = useEffectMaterial('glow')

  const patch = useMemo(
    () => wedgeFieldGeometry(effect.cells, WEDGE_BAND, FIELD_LIFT).geometry,
    [effect.cells]
  )
  const outline = useMemo(
    () => wedgeOutlineGeometry(effect.cells, WEDGE_BAND, FIELD_LIFT),
    [effect.cells]
  )
  const edge = useMemo(
    () =>
      new LineBasicMaterial({
        color: effect.color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    [effect.color]
  )
  useEffect(() => () => patch.dispose(), [patch])
  useEffect(() => () => outline.dispose(), [outline])
  useEffect(() => () => edge.dispose(), [edge])

  /**
   * Where everything is: the attacker on the board, the target's hull in the
   * world, and each ray's foot and stopping point. Fixed for the effect's life.
   */
  const layout = useMemo(() => {
    const origin = (effect.fromId ? pointOf(effect.fromId) : null) ?? positionPoint(effect.from)
    const target = (effect.toId ? pointOf(effect.toId) : null) ?? positionPoint(effect.to)
    const targetY = elevationAt(effect.to) + MUZZLE
    const sources = raySources(effect.cells, effect.from, origin)
    const furthest = Math.max(1, ...sources.map(s => s.distance))
    const rays = sources.flatMap(source => {
      const end = rayEnd(source.start, target, effect.stopAt)
      return end ? [{ ...source, end, footY: elevationAt(source.cell) + RAY_FOOT }] : []
    })
    return { origin, target, targetY, furthest, rays }
  }, [effect.cells, effect.from, effect.to, effect.fromId, effect.toId, effect.stopAt, pointOf])

  const segments = RAY_PULSE.segments
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
    const fade = rayFade(progress)
    const front = (progress / RAY_PULSE.flood) * (layout.furthest + 40)
    const step = Math.floor(progress * RAY_PULSE.flickers)

    field.uniforms.uColor.value.set(effect.color)
    field.uniforms.uOrigin.value.set(layout.origin.x, layout.origin.y)
    field.uniforms.uFront.value = front
    field.uniforms.uFade.value = fade
    edge.opacity = 0.75 * fade * Math.min(1, front / (layout.furthest + 26))

    core.color.set('#ffffff')
    core.opacity = 0.9 * fade
    envelope.color.set(effect.color)
    envelope.opacity = 0.75 * fade

    const { p, q, dir, aim } = scratch
    let arrived = false
    layout.rays.forEach((ray, i) => {
      const reach = rayReach(progress, ray.share)
      arrived ||= reach >= 1
      const tip = {
        x: ray.start.x + (ray.end.x - ray.start.x) * reach,
        y: ray.start.y + (ray.end.y - ray.start.y) * reach,
      }
      const tipY = ray.footY + (layout.targetY - ray.footY) * reach
      const points = reach > 0 ? crackle(ray.start, tip, ray.seed, step) : null
      for (let k = 0; k < segments; k++) {
        const slot = i * segments + k
        const thread = cores.current[slot]
        const glow = envelopes.current[slot]
        if (!points) {
          if (thread) thread.visible = false
          if (glow) glow.visible = false
          continue
        }
        const a = points[k]
        const b = points[k + 1]
        p.set(a.x, ray.footY + ((tipY - ray.footY) * k) / segments, a.y)
        q.set(b.x, ray.footY + ((tipY - ray.footY) * (k + 1)) / segments, b.y)
        dir.subVectors(q, p)
        const length = Math.max(0.001, dir.length())
        aim.setFromUnitVectors(UP, dir.divideScalar(length))
        for (const [mesh, radius] of [
          [thread, CORE_RADIUS],
          [glow, ENVELOPE_RADIUS],
        ] as const) {
          if (!mesh) continue
          mesh.visible = true
          mesh.position.addVectors(p, q).multiplyScalar(0.5)
          mesh.quaternion.copy(aim)
          mesh.scale.set(radius, length, radius)
        }
      }
    })

    // Where the rays meet: the edge of the target's shield, ringing.
    shock.uniforms.uColor.value.set(effect.color)
    shock.uniforms.uRadius.value = 0.96
    shock.uniforms.uWidth.value = 0.06
    shock.uniforms.uCore.value = 0
    shock.uniforms.uFade.value = arrived ? fade * (0.7 + 0.3 * Math.sin(progress * 90)) : 0
    if (ring.current) ring.current.visible = arrived
  })

  return (
    <group ref={group} visible={false}>
      <mesh geometry={patch} material={field} renderOrder={5} raycast={NO_RAYCAST} />
      <lineSegments geometry={outline} material={edge} renderOrder={5} raycast={NO_RAYCAST} />
      {Array.from({ length: layout.rays.length * segments }, (_, slot) => (
        <group key={slot}>
          <mesh
            ref={node => {
              envelopes.current[slot] = node
            }}
            geometry={boltGeometry()}
            material={envelope}
            visible={false}
            frustumCulled={false}
            renderOrder={6}
            raycast={NO_RAYCAST}
          />
          <mesh
            ref={node => {
              cores.current[slot] = node
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
      <mesh
        ref={ring}
        geometry={discGeometry()}
        material={shock}
        position={[layout.target.x, layout.targetY, layout.target.y]}
        rotation={FLAT}
        scale={effect.stopAt * 1.04}
        visible={false}
        renderOrder={6}
        raycast={NO_RAYCAST}
      />
    </group>
  )
}
