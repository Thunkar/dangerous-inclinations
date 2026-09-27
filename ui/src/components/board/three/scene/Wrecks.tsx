/**
 * Wrecks: what a destroyed ship leaves where it died, until a Salvage holder
 * takes its black box (RULES §Missions, Salvage).
 *
 * The flat board's mark in the round: the ship's wedge broken in two, bare
 * burnt structure edged in faint cream, lying low on a dark scorch with a few
 * shards round the break. Nothing on it glows and none of it is a seat's
 * colour or the red, so it never reads as a live hull or a threat.
 * `geometry.wreckPoint` puts it in the wrecks' band of its sector, the same
 * point the flat board uses; the band stands outward of the ring, on the ramp
 * up to the next terrace, so a wreck is lifted to the surface under it rather
 * than to its ring's terrace, or the ramp would swallow it.
 *
 * Geometry is built once at module scope and shared by every wreck. Nothing
 * re-renders per frame: a drifting wreck is slid along its ring in `useFrame`
 * against its `motion`, written straight onto the group.
 */
import { useMemo, useRef, useState } from 'react'
import {
  CircleGeometry,
  EdgesGeometry,
  ExtrudeGeometry,
  LineBasicMaterial,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Shape,
  TetrahedronGeometry,
  type Group,
} from 'three'
import { useFrame } from '@react-three/fiber'
import { HULL_INK } from '../../../../ships/palette'
import { TABLE } from '../../../../theme'
import type { WreckToken } from '../../model'
import { slideProgress, wreckHeading, wreckPoint, wreckRadius } from '../../geometry'
import { wreckLabel } from '../../labels'
import { WRECK_BOW, WRECK_STERN, type Outline } from '../../shapes'
import { LAYER, elevationAt, surfaceElevation, toWorld, yawFromHeading } from '../world'
import { BoardTooltip } from './overlays/marks'
import { NO_RAYCAST } from './effects/resources'

/** The flat board's wedge is drawn at 0.6 of a token; the 3D hull is bigger than the flat one. */
const SCALE = 1.15
const THICKNESS = 2.6
const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0]

/** Board-space outline to a shape: the flat board's y runs down, which becomes world z. */
function plate(points: Outline): ExtrudeGeometry {
  const shape = new Shape()
  points.forEach(([x, y], i) =>
    i === 0 ? shape.moveTo(x * SCALE, y * SCALE) : shape.lineTo(x * SCALE, y * SCALE)
  )
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth: THICKNESS, bevelEnabled: false })
  // Shape (x, y) to world (x, z), extruded downward from the top face.
  geometry.rotateX(Math.PI / 2)
  geometry.translate(0, THICKNESS, 0)
  return geometry
}

/** The same bow and stern the flat board draws (`shapes.ts`). */
const BOW = plate(WRECK_BOW)
const STERN = plate(WRECK_STERN)

const GEO = {
  bow: BOW,
  stern: STERN,
  bowEdges: new EdgesGeometry(BOW),
  sternEdges: new EdgesGeometry(STERN),
  shard: new TetrahedronGeometry(1.9 * SCALE),
  scorch: new CircleGeometry(10 * SCALE, 24),
} as const

const MAT = {
  hull: new MeshStandardMaterial({ color: HULL_INK.steel, roughness: 0.85, metalness: 0.4 }),
  shard: new MeshStandardMaterial({ color: TABLE.inkFaint, roughness: 0.9, metalness: 0.2 }),
  edge: new LineBasicMaterial({ color: TABLE.inkSoft, transparent: true, opacity: 0.9 }),
  scorch: new MeshBasicMaterial({
    color: TABLE.bar,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    toneMapped: false,
  }),
} as const

/** Where the loose plating lies round the break, and how each piece is turned. */
const SHARDS: { at: [number, number, number]; turn: [number, number, number] }[] = [
  { at: [8 * SCALE, 1.2, 6.2 * SCALE], turn: [0.4, 0.9, 0.2] },
  { at: [0.2 * SCALE, 1.2, -7 * SCALE], turn: [1.1, 0.3, 0.7] },
  { at: [11.4 * SCALE, 1.2, -2.2 * SCALE], turn: [0.2, 1.6, 1.2] },
]

function drift(wreck: WreckToken, now: number): number {
  if (!wreck.motion) return 1
  const raw = Math.min(1, Math.max(0, (now - wreck.motion.start) / wreck.motion.duration))
  return slideProgress(raw)
}

function WreckMesh({ wreck }: { wreck: WreckToken }) {
  const group = useRef<Group>(null)
  const [hovered, setHovered] = useState(false)
  const { wellId } = wreck.position

  /** The surface under the band, or the ring's terrace, whichever stands higher. */
  const height = useMemo(
    () =>
      Math.max(
        elevationAt(wreck.position),
        surfaceElevation(wellId, wreckRadius(wreck.position, wreck.crowd))
      ) +
      LAYER.token -
      3,
    [wreck.position, wreck.crowd, wellId]
  )
  const rest = useMemo(() => {
    const point = wreckPoint(wreck.position, wreck.crowd)
    return {
      at: toWorld(point, height),
      yaw: yawFromHeading(wreckHeading(point, wellId, wreck.id)),
    }
  }, [wreck.position, wreck.crowd, wreck.id, wellId, height])

  useFrame(() => {
    const node = group.current
    if (!node) return
    const motion = wreck.motion
    const now = performance.now()
    if (motion && now < motion.start + motion.duration) {
      const point = wreckPoint(wreck.position, wreck.crowd, motion.from, drift(wreck, now))
      node.position.set(point.x, height, point.y)
      node.rotation.y = yawFromHeading(wreckHeading(point, wellId, wreck.id))
    } else if (!node.position.equals(rest.at)) {
      node.position.copy(rest.at)
      node.rotation.y = rest.yaw
    }
  })

  return (
    <group
      ref={group}
      position={rest.at}
      rotation={[0, rest.yaw, 0]}
      onPointerOver={event => {
        event.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh
        geometry={GEO.scorch}
        material={MAT.scorch}
        rotation={FLAT}
        position={[0, 0.3, 0]}
        raycast={NO_RAYCAST}
      />
      <group position={[2.4 * SCALE, 0.4, -1.4 * SCALE]} rotation={[0.18, -0.28, 0.12]}>
        <mesh geometry={GEO.bow} material={MAT.hull} />
        <lineSegments geometry={GEO.bowEdges} material={MAT.edge} raycast={NO_RAYCAST} />
      </group>
      <group position={[-1.2 * SCALE, 0.2, 0.8 * SCALE]} rotation={[-0.08, 0.16, -0.1]}>
        <mesh geometry={GEO.stern} material={MAT.hull} />
        <lineSegments geometry={GEO.sternEdges} material={MAT.edge} raycast={NO_RAYCAST} />
      </group>
      {SHARDS.map(({ at, turn }, i) => (
        <mesh key={i} geometry={GEO.shard} material={MAT.shard} position={at} rotation={turn} />
      ))}
      {hovered && (
        <BoardTooltip position={[0, 30, 0]}>
          {wreckLabel(wreck.position)}
        </BoardTooltip>
      )}
    </group>
  )
}

export function Wrecks({ wrecks }: { wrecks: readonly WreckToken[] }) {
  return (
    <>
      {wrecks.map(wreck => (
        <WreckMesh key={wreck.id} wreck={wreck} />
      ))}
    </>
  )
}
