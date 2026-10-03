/**
 * A plasma cannon's shot: a short burst of bolts of burning green gas.
 *
 * The flat board's choreography to the moment (`fx.ts`): the bolts leave one
 * after another, each takes the same share of the effect to cross, and each
 * flares and spreads as it lands; the fireball on a hit is the animator's
 * `plasma` flare, which comes with the die.
 *
 * A bolt is volumetric rather than a disc: a ball of gas whose heart is
 * white-yellow, whose body is the green and whose corona falls away to
 * nothing, drawn out behind into a teardrop and boiling as it flies (the
 * `plasma` program). It sheds embers that drift off its line and cool, the
 * muzzle throws a cone of sparks as each one leaves (both the `embers`
 * program, worked out on the GPU from three numbers a frame), and a pool of
 * green light runs along the board under it. Lobbed in a shallow arc, so a
 * shot across the funnel never ploughs into it.
 */
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Quaternion,
  Vector3,
  type Group,
  type Mesh,
  type ShaderMaterial,
} from 'three'
import { useFrame } from '@react-three/fiber'
import type { TableEffect } from '../../../../../animation/beats'
import type { BoardModel } from '../../../model'
import { positionPoint, wellCenter } from '../../../geometry'
import { PLASMA_BURST, PLASMA_EMBERS, boltFlight, emberSpawn, hash01 } from '../../../fx'
import { FX_INK } from '../../palette'
import { LAYER, elevationAt, surfaceElevation, toWorld } from '../../world'
import {
  FLAT,
  MUZZLE,
  NO_RAYCAST,
  discGeometry,
  plasmaGeometry,
  useEffectMaterial,
  useLight,
} from './resources'

type PlasmaEffect = Extract<TableEffect, { kind: 'plasma' }>

/** Lift over the span, as a share of it, and no more than this in board units. */
const LOB = 0.07
const MAX_LOB = 30
/** A bolt's corona, in board units, and how far its tail draws out behind, in radii. */
const BOLT_RADIUS = 11
const TAIL = 1.7
/** The pool of light a bolt throws on the board under it. */
const POOL_RADIUS = 36

const UP = new Vector3(0, 1, 0)

/**
 * The embers and sparks of one burst, built once per shot: a unit direction
 * each (the `position` attribute), which bolt it belongs to, when it was shed
 * and a seed. Deterministic, so a frame can be taken twice.
 */
function emberGeometry(): BufferGeometry {
  const { bolts } = PLASMA_BURST
  const count = bolts * (PLASMA_EMBERS.perBolt + PLASMA_EMBERS.sparks)
  const position = new Float32Array(count * 3)
  const bolt = new Float32Array(count)
  const spawn = new Float32Array(count)
  const seed = new Float32Array(count)
  const kind = new Float32Array(count)
  let i = 0
  for (let b = 0; b < bolts; b++) {
    for (let k = 0; k < PLASMA_EMBERS.perBolt + PLASMA_EMBERS.sparks; k++) {
      const spark = k >= PLASMA_EMBERS.perBolt
      const theta = hash01(b, k, 1) * Math.PI * 2
      const y = hash01(b, k, 2) * 2 - 1
      const r = Math.sqrt(1 - y * y)
      position.set([Math.cos(theta) * r, y, Math.sin(theta) * r], i * 3)
      bolt[i] = b
      spawn[i] = spark ? 0 : emberSpawn(k)
      seed[i] = hash01(b, k, 3)
      kind[i] = spark ? 1 : 0
      i++
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('aBolt', new BufferAttribute(bolt, 1))
  geometry.setAttribute('aSpawn', new BufferAttribute(spawn, 1))
  geometry.setAttribute('aSeed', new BufferAttribute(seed, 1))
  geometry.setAttribute('aKind', new BufferAttribute(kind, 1))
  return geometry
}

export function Plasma({
  effect,
  pointOf,
}: {
  effect: PlasmaEffect
  pointOf: BoardModel['pointOf']
}) {
  const group = useRef<Group>(null)
  const muzzle = useRef<Mesh>(null)
  const balls = useRef<(Mesh | null)[]>([])
  const pools = useRef<(Mesh | null)[]>([])

  // One program each, but a material a bolt: each fades on its own as it lands.
  const first = useEffectMaterial('plasma')
  const second = useEffectMaterial('plasma')
  const third = useEffectMaterial('plasma')
  const flash = useEffectMaterial('plasma')
  const embers = useEffectMaterial('embers')
  const pool = useEffectMaterial('shock')
  const boltMaterials = useMemo(() => [first, second, third], [first, second, third])

  const cloud = useMemo(emberGeometry, [])
  useEffect(() => () => cloud.dispose(), [cloud])
  useLight(pool)

  const shot = useMemo(() => {
    const end = (id: string | undefined, position: PlasmaEffect['from']) =>
      toWorld((id ? pointOf(id) : null) ?? positionPoint(position), elevationAt(position) + MUZZLE)
    const from = end(effect.fromId, effect.from)
    const to = end(effect.toId, effect.to)
    const span = new Vector3().subVectors(to, from)
    const length = Math.max(1, span.length())
    return {
      from,
      to,
      length,
      lob: Math.min(MAX_LOB, length * LOB),
      aim: span.clone().divideScalar(length),
      well: effect.from.wellId,
    }
  }, [effect.from, effect.to, effect.fromId, effect.toId, pointOf])

  // Scratch, so a frame allocates nothing.
  const scratch = useMemo(
    () => ({ at: new Vector3(), tangent: new Vector3(), aim: new Quaternion() }),
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
    const fade = progress > 0.85 ? (1 - progress) / 0.15 : 1
    const centre = wellCenter(shot.well)
    const { at, tangent, aim } = scratch
    const flights = [0, 1, 2].map(i => boltFlight(progress, i))

    boltMaterials.forEach((material, i) => {
      const t = flights[i]
      const ball = balls.current[i]
      const glow = pools.current[i]
      const flying = t >= 0 && t <= 1
      // Landed: the gas flattens and spreads on what it hit, and burns out.
      const after = ((t - 1) * PLASMA_BURST.flight) / PLASMA_BURST.splash
      const landing = after >= 0 && after < 1
      if (ball) ball.visible = flying || landing
      if (glow) glow.visible = flying
      if (!flying && !landing) return
      const u = material.uniforms
      u.uCore.value.set(FX_INK.plasmaCore)
      u.uGlow.value.set(effect.color)
      u.uSeed.value = i * 3.7 + 1.3
      if (flying) {
        at.lerpVectors(shot.from, shot.to, t)
        at.y += shot.lob * Math.sin(Math.PI * t)
        // Which way the bolt is going on its arc, so the tail streams behind it.
        tangent
          .subVectors(shot.to, shot.from)
          .addScaledVector(UP, shot.lob * Math.PI * Math.cos(Math.PI * t))
          .normalize()
        aim.setFromUnitVectors(UP, tangent)
        u.uFade.value = fade * Math.min(1, t / 0.08 + 0.4)
        u.uHeat.value = 1
        u.uStretch.value = TAIL * Math.min(1, t * 6)
        u.uBoil.value = 0.22
        if (ball) {
          ball.position.copy(at)
          ball.quaternion.copy(aim)
          ball.scale.setScalar(BOLT_RADIUS * (1 + 0.08 * Math.sin(progress * 70 + i * 2.1)))
        }
        // The light it throws on the board, wherever under it the board is.
        if (glow) {
          const radius = Math.hypot(at.x - centre.x, at.z - centre.y)
          glow.position.set(at.x, surfaceElevation(shot.well, radius) + LAYER.wedge, at.z)
        }
      } else if (ball) {
        u.uFade.value = fade * (1 - after) ** 1.4
        u.uHeat.value = 1.4 * (1 - after)
        u.uStretch.value = 0
        u.uBoil.value = 0.35
        ball.position.copy(shot.to)
        ball.scale.setScalar(BOLT_RADIUS * (1 + 1.1 * after ** 0.6))
      }
    })

    pool.uniforms.uColor.value.set(effect.color)
    pool.uniforms.uRadius.value = 1
    pool.uniforms.uWidth.value = 0.0001
    pool.uniforms.uCore.value = 1
    pool.uniforms.uFade.value = 0.6 * fade

    // The muzzle flares green as each bolt leaves it.
    const leaving = flights.find(t => t >= 0 && t < 0.25)
    const blast = muzzle.current
    if (blast) {
      blast.visible = leaving !== undefined
      if (leaving !== undefined) {
        const k = leaving / 0.25
        flash.uniforms.uCore.value.set(FX_INK.plasmaCore)
        flash.uniforms.uGlow.value.set(effect.color)
        flash.uniforms.uFade.value = fade * (1 - k)
        flash.uniforms.uHeat.value = 1.5 * (1 - k)
        flash.uniforms.uStretch.value = 0
        flash.uniforms.uBoil.value = 0.3
        flash.uniforms.uSeed.value = 9.1
        blast.scale.setScalar(BOLT_RADIUS * (0.7 + 0.9 * k))
      }
    }

    const e = embers.uniforms
    e.uFrom.value.copy(shot.from)
    e.uTo.value.copy(shot.to)
    e.uAim.value.copy(shot.aim)
    e.uLob.value = shot.lob
    e.uT.value.set(flights[0], flights[1], flights[2])
    e.uLife.value = PLASMA_EMBERS.life
    e.uSpark.value = PLASMA_EMBERS.spark
    e.uSize.value = 10
    e.uFade.value = fade
    e.uCore.value.set(FX_INK.plasmaCore)
    e.uGlow.value.set(effect.color)
  })

  return (
    <group ref={group} visible={false}>
      {boltMaterials.map((material: ShaderMaterial, i) => (
        <group key={i}>
          <mesh
            ref={node => {
              pools.current[i] = node
            }}
            geometry={discGeometry()}
            material={pool}
            rotation={FLAT}
            scale={POOL_RADIUS}
            visible={false}
            renderOrder={5}
            raycast={NO_RAYCAST}
          />
          <mesh
            ref={node => {
              balls.current[i] = node
            }}
            geometry={plasmaGeometry()}
            material={material}
            visible={false}
            frustumCulled={false}
            renderOrder={8}
            raycast={NO_RAYCAST}
          />
        </group>
      ))}
      <mesh
        ref={muzzle}
        geometry={plasmaGeometry()}
        material={flash}
        position={shot.from}
        visible={false}
        frustumCulled={false}
        renderOrder={8}
        raycast={NO_RAYCAST}
      />
      <points geometry={cloud} material={embers} frustumCulled={false} renderOrder={7} />
    </group>
  )
}
