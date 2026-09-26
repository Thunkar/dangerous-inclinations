/**
 * Missiles in flight, and the launches sitting in your plan.
 *
 * The path a missile will take is already in the model (`missilePaths`, asked
 * of the engine once): the drift around its ring first, then the flight steps
 * toward its target. Nothing here works one out.
 *
 * It is drawn the way the paper board draws it: the drift solid, because it
 * happens whatever anyone does, and the flight dashed, because it is an
 * intention, with a dot on the sector the warhead would reach. A launch you
 * have queued but not sent is the same marks at half strength, with a ring
 * where the rail is. A missile whose target has left the board has no path at
 * all: it is drawn as a dart and nothing more.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdditiveBlending, DoubleSide, type MeshBasicMaterial } from 'three'
import { useFrame } from '@react-three/fiber'
import type { Missile, Position } from '@dangerous-inclinations/engine'
import { samePosition } from '@dangerous-inclinations/engine'
import { TABLE } from '../../../../theme'
import { createMissile } from '../../../../ships/missile'
import { facingAngle, positionPoint } from '../../geometry'
import type { BoardModel, MissilePreview } from '../../model'
import { sceneTime } from '../clock'
import { LAYER, elevationAt, positionWorld, toWorld, yawFromHeading } from '../world'
import { BoardTooltip, SurfaceDot, SurfaceLine, SurfaceRing } from './overlays/marks'
import { NO_RAYCAST, arcPoints, chordPoints } from './overlays/paths'

/** Word for word the reminder the SVG board's tooltip carries. */
const MISSILE_TOOLTIP =
  'Rides its orbit, then flies up to 3 steps toward the target (rings first). ' +
  'On its launch turn it only flies, from where it was launched. 3 flights max.'

/**
 * Missile dimensions in board units, as `ships/missile.ts` models it. It is
 * drawn at `SCALE` of that: at full size a missile was two thirds of a hull
 * and read as a toy next to one; at 0.6 it is ordnance, about 16 units to a
 * hull's 40. The wake and the hover shrink with it.
 */
const LENGTH = 26
const WIDTH = 9
const SCALE = 0.6
/** How far the dart floats over the track it is drawing, before scaling. */
const HOVER = 5
/**
 * How far apart missiles sharing a sector stand: a salvo of four is four darts
 * abreast, not one dart drawn four times. Abreast means across each dart's own
 * heading, which may be along the ring or across it, so a salvo diving inward
 * does not line up nose to tail.
 */
const SPREAD = 9
/** A generous invisible sphere, so a dart two pixels wide can still be hovered. */
const HOVER_RADIUS = 16

/** A planned launch is drawn at the strength the SVG board draws it. */
const PREVIEW_OPACITY = 0.55
/** Dash drift, board units a second: the same flow as the planning overlays. */
const DASH_SPEED = 9

/** One shared empty path: a missile whose target has left the board has none. */
const NO_PATH: Position[] = []

/** Where the dart points: at the first place its path takes it. */
function headingOf(at: Position, path: readonly Position[]): number {
  const next = path.find(step => !samePosition(step, at))
  if (!next || next.wellId !== at.wellId) return facingAngle(at, 'prograde')
  const here = positionPoint(at)
  const there = positionPoint(next)
  return Math.atan2(there.y - here.y, there.x - here.x)
}

/** Two missiles side by side must not flicker in step, so each takes a phase. */
function phaseOf(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 1000
  return (hash / 1000) * Math.PI * 2
}

/** The dart itself: the missile model, with a short additive wake behind it. */
function Dart({ color, phase }: { color: string; phase: number }) {
  const wake = useRef<MeshBasicMaterial>(null)
  // Plain three.js, built once per colour and handed back to the GPU with the
  // token: the same bargain the hull and the station make.
  const model = useMemo(() => createMissile(color), [color])
  useEffect(() => () => model.dispose(), [model])

  useFrame(() => {
    const material = wake.current
    if (material) material.opacity = 0.14 + 0.07 * Math.sin(sceneTime.value * 5 + phase)
  })

  return (
    <group position={[0, HOVER * SCALE, 0]} scale={SCALE}>
      <primitive object={model.root} dispose={null} />

      <mesh
        position={[-LENGTH * 0.68, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
        scale={[WIDTH * 0.45, LENGTH * 0.9, WIDTH * 0.45]}
        raycast={NO_RAYCAST}
      >
        <coneGeometry args={[0.5, 1, 8, 1, true]} />
        <meshBasicMaterial
          ref={wake}
          color={color}
          transparent
          opacity={0.28}
          blending={AdditiveBlending}
          side={DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

function MissileInFlight({
  missile,
  path,
  color,
  tooltip,
  offset,
}: {
  missile: Missile
  path: readonly Position[]
  color: string
  tooltip: string
  /** Its step abreast among the missiles sharing its sector. */
  offset: number
}) {
  const [hovered, setHovered] = useState(false)

  const at = useMemo<Position>(
    () => ({ wellId: missile.wellId, ring: missile.ring, sector: missile.sector }),
    [missile.wellId, missile.ring, missile.sector]
  )
  const drift = path[0]
  const flight = useMemo(() => path.slice(1), [path])

  // The drift only exists if the ring actually carries it somewhere: a missile
  // that rode along with its ship starts where it already is.
  const driftTrack = useMemo(
    () => (drift && !samePosition(at, drift) ? arcPoints([at, drift], LAYER.path) : null),
    [at, drift]
  )
  const flightTrack = useMemo(
    () => (drift && flight.length > 0 ? chordPoints([drift, ...flight], LAYER.path) : null),
    [drift, flight]
  )
  const impact = useMemo(
    () => (flight.length > 0 ? positionWorld(flight[flight.length - 1], LAYER.path) : null),
    [flight]
  )

  const heading = useMemo(() => headingOf(at, path), [at, path])
  const yaw = yawFromHeading(heading)
  // Abreast: the step is taken square to the way the dart points.
  const abreast = useMemo(() => {
    const centre = positionPoint(at)
    return {
      x: centre.x + Math.cos(heading + Math.PI / 2) * offset,
      y: centre.y + Math.sin(heading + Math.PI / 2) * offset,
    }
  }, [at, heading, offset])
  const anchor = useMemo(() => toWorld(abreast, elevationAt(at) + LAYER.token), [abreast, at])
  const shadow = useMemo(() => toWorld(abreast, elevationAt(at) + LAYER.path), [abreast, at])

  const over = useCallback((event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    setHovered(true)
  }, [])
  const out = useCallback(() => setHovered(false), [])

  return (
    <group>
      {driftTrack && <SurfaceLine points={driftTrack} color={color} width={2.2} opacity={0.8} />}
      {flightTrack && (
        <SurfaceLine
          points={flightTrack}
          color={color}
          width={2}
          opacity={0.8}
          dash={5}
          gap={4}
          speed={DASH_SPEED}
        />
      )}
      {impact && <SurfaceDot position={impact} color={color} radius={3.5} opacity={0.85} />}

      {/* The dark disc the SVG board sets its dart on, so it reads over a ring. */}
      <SurfaceDot position={shadow} color={TABLE.felt} radius={4.5} opacity={0.6} edge={false} />

      <group position={anchor} rotation={[0, yaw, 0]}>
        <Dart color={color} phase={phaseOf(missile.id)} />
        <mesh position={[0, HOVER * SCALE, 0]} onPointerOver={over} onPointerOut={out}>
          <sphereGeometry args={[HOVER_RADIUS, 8, 6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {hovered && <BoardTooltip position={[0, HOVER * SCALE + 30, 0]}>{tooltip}</BoardTooltip>}
      </group>
    </group>
  )
}

function LaunchPreview({ preview, path }: { preview: MissilePreview; path: readonly Position[] }) {
  const [hovered, setHovered] = useState(false)
  const drift = path[0]

  const driftTrack = useMemo(
    () =>
      drift && !samePosition(preview.from, drift)
        ? arcPoints([preview.from, drift], LAYER.path)
        : null,
    [preview.from, drift]
  )
  const track = useMemo(() => (path.length > 1 ? chordPoints(path, LAYER.path) : null), [path])
  const rail = useMemo(() => positionWorld(preview.from, LAYER.path), [preview.from])
  const end = useMemo(
    () => (path.length > 0 ? positionWorld(path[path.length - 1], LAYER.path) : rail),
    [path, rail]
  )

  const over = useCallback((event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    setHovered(true)
  }, [])
  const out = useCallback(() => setHovered(false), [])

  return (
    <group>
      {driftTrack && (
        <SurfaceLine
          points={driftTrack}
          color={preview.color}
          width={1.8}
          opacity={PREVIEW_OPACITY}
          dash={2}
          gap={3}
          speed={DASH_SPEED}
        />
      )}
      {track && (
        <SurfaceLine
          points={track}
          color={preview.color}
          width={1.8}
          opacity={PREVIEW_OPACITY}
          dash={4}
          gap={5}
          speed={DASH_SPEED}
        />
      )}
      <SurfaceRing
        position={rail}
        color={preview.color}
        radius={4}
        thickness={1.6}
        opacity={PREVIEW_OPACITY}
      />
      <SurfaceDot position={end} color={preview.color} radius={3} opacity={PREVIEW_OPACITY} />

      <group position={end}>
        <mesh onPointerOver={over} onPointerOut={out}>
          <sphereGeometry args={[HOVER_RADIUS * 0.7, 8, 6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {hovered && <BoardTooltip position={[0, 28, 0]}>{preview.label}</BoardTooltip>}
      </group>
    </group>
  )
}

export const Missiles = memo(function Missiles({
  missiles,
  previews,
  paths,
  colorOf,
  nameOf,
}: {
  missiles: BoardModel['missiles']
  previews: BoardModel['missilePreviews']
  paths: BoardModel['missilePaths']
  colorOf: BoardModel['colorOf']
  nameOf: BoardModel['nameOf']
}) {
  /** Each missile's step out from its sector's centre, in the order they are listed. */
  const offsets = useMemo(() => {
    const out: Record<string, number> = {}
    for (const missile of missiles) {
      const sharing = missiles.filter(other => samePosition(other, missile))
      const index = sharing.indexOf(missile)
      out[missile.id] = (index - (sharing.length - 1) / 2) * SPREAD
    }
    return out
  }, [missiles])

  return (
    <>
      {previews.map(preview => (
        <LaunchPreview
          key={`preview-${preview.id}`}
          preview={preview}
          path={paths[preview.id] ?? NO_PATH}
        />
      ))}
      {missiles.map(missile => (
        <MissileInFlight
          key={missile.id}
          missile={missile}
          path={paths[missile.id] ?? NO_PATH}
          color={colorOf(missile.ownerId)}
          offset={offsets[missile.id] ?? 0}
          tooltip={`${nameOf(missile.ownerId)}'s missile → ${nameOf(missile.targetId)} · ${
            3 - missile.movesMade
          } flight(s) left. ${MISSILE_TOOLTIP}`}
        />
      ))}
    </>
  )
})
