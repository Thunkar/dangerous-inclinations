/**
 * A fold's wormhole: two mouths standing upright across the ship's way, one
 * ahead of where it was and one behind where it lands, each a dark throat in
 * a ring of the drive's light with arms turning in it, and a pool of that
 * light on the board under it so the mouth reads from straight above too.
 *
 * When each mouth opens and closes, and where the hull is meanwhile, is
 * `wormhole.ts`, which the flat board reads as well; the hull itself is
 * flown by `Ships.tsx`. Everything changes in `useFrame`: React renders this
 * once when the fold starts and once when it is over.
 */
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import { useFrame } from '@react-three/fiber'
import type { TableEffect } from '../../../../../animation/beats'
import type { BoardModel } from '../../../model'
import { facingAngle, positionPoint, type Point } from '../../../geometry'
import { mouthPoints, mouthsOpen } from '../../../wormhole'
import { LAYER, elevationAt, toWorld, yawFromHeading } from '../../world'
import type { Position } from '@dangerous-inclinations/engine'
import { FLAT, NO_RAYCAST, discGeometry, useEffectMaterial, useLight } from './resources'

type WormholeEffect = Extract<TableEffect, { kind: 'wormhole' }>

/** A mouth's centre over the surface: the height a hull flies at. */
const MOUTH_HEIGHT = LAYER.token + 12
/** A mouth's radius on this board, where a hull is 40 long. */
const RADIUS = 20
/** How far the arms turn over the fold, in radians. */
const SPIN = 18

function Mouth({
  effect,
  end,
  at,
  position,
}: {
  effect: WormholeEffect
  end: 'entry' | 'exit'
  at: Point
  position: Position
}) {
  const node = useRef<Group>(null)
  const mouth = useRef<Group>(null)
  const light = useEffectMaterial('wormhole')
  const throat = useEffectMaterial('throat')
  const pool = useEffectMaterial('glow')
  // The pool lies over the terraced board rather than in it, or the next step up cuts it off.
  useLight(pool)
  const base = elevationAt(position)
  const centre = useMemo(() => toWorld(at, base), [at, base])
  const yaw = yawFromHeading(facingAngle(position, effect.facing))

  useFrame(() => {
    const group = node.current
    if (!group) return
    const raw = (performance.now() - effect.start) / effect.duration
    const open = raw < 0 || raw >= 1 ? 0 : mouthsOpen(raw)[end]
    group.visible = open > 0.01
    if (!group.visible) return
    mouth.current?.scale.setScalar(open)
    light.uniforms.uColor.value.set(effect.color)
    light.uniforms.uOpen.value = open
    light.uniforms.uSpin.value = (end === 'entry' ? 1 : -1) * SPIN * raw
    throat.opacity = 0.92 * open
    pool.color.set(effect.color)
    pool.opacity = 0.22 * open * open
  })

  return (
    <group ref={node} position={centre} visible={false}>
      <mesh
        geometry={discGeometry()}
        material={pool}
        rotation={FLAT}
        position={[0, LAYER.wedge, 0]}
        scale={RADIUS * 1.4}
        renderOrder={5}
        raycast={NO_RAYCAST}
      />
      {/* Square to the way the ship faces: local +X is its heading. */}
      <group ref={mouth} position={[0, MOUTH_HEIGHT, 0]} rotation={[0, yaw, 0]}>
        <mesh
          geometry={discGeometry()}
          material={throat}
          rotation={[0, Math.PI / 2, 0]}
          scale={RADIUS * 0.9}
          renderOrder={6}
          raycast={NO_RAYCAST}
        />
        <mesh
          geometry={discGeometry()}
          material={light}
          rotation={[0, Math.PI / 2, 0]}
          scale={RADIUS}
          renderOrder={7}
          raycast={NO_RAYCAST}
        />
      </group>
    </group>
  )
}

export function Wormhole({
  effect,
  pointOf,
}: {
  effect: WormholeEffect
  pointOf: BoardModel['pointOf']
}) {
  // The exit stands behind the hull's resting point, which is beside its
  // sector's centre when somebody else is standing there.
  const mouths = useMemo(
    () =>
      mouthPoints(
        effect.from,
        effect.to,
        effect.facing,
        pointOf(effect.playerId) ?? positionPoint(effect.to)
      ),
    // Where it lands is settled when the fold starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effect.id]
  )
  return (
    <>
      <Mouth effect={effect} end="entry" at={mouths.entry} position={effect.from} />
      <Mouth effect={effect} end="exit" at={mouths.exit} position={effect.to} />
    </>
  )
}
