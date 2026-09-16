/**
 * Missiles in flight, and the launches sitting in your plan.
 *
 * The path a missile will take is already in the model (`missilePaths`, asked
 * of the engine once): the drift around its ring first, then the flight steps
 * toward its target. Nothing here works one out.
 *
 * It is drawn the way the paper board draws it — the drift solid, because it
 * happens whatever anyone does, and the flight dashed, because it is an
 * intention — with a dot on the sector the warhead would reach. A launch you
 * have queued but not sent is the same marks at half strength, with a ring
 * where the rail is. A missile whose target has left the board has no path at
 * all: it is drawn as a dart and nothing more.
 */
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { AdditiveBlending, DoubleSide, type MeshBasicMaterial } from 'three'
import { useFrame } from '@react-three/fiber'
import type { Missile, Position } from '@dangerous-inclinations/engine'
import { samePosition } from '@dangerous-inclinations/engine'
import { TABLE } from '../../../../theme'
import { facingAngle, positionPoint } from '../../geometry'
import type { BoardModel, MissilePreview } from '../../model'
import { sceneTime } from '../clock'
import { LAYER, positionWorld, yawFromHeading } from '../world'
import { BoardTooltip, SurfaceDot, SurfaceLine, SurfaceRing } from './overlays/marks'
import { NO_RAYCAST, arcPoints, chordPoints } from './overlays/paths'

/** Word for word the reminder the SVG board's tooltip carries. */
const MISSILE_TOOLTIP =
  'Rides its orbit, then flies up to 3 steps toward the target (rings first). ' +
  'Launched after moving? It already rode along — no drift this turn. 3 flights max.'

/** Dart dimensions in board units: unmistakably smaller than a hull. */
const LENGTH = 26
const WIDTH = 9
/** How far the dart floats over the track it is drawing. */
const HOVER = 5
/** A generous invisible sphere, so a dart two pixels wide can still be hovered. */
const HOVER_RADIUS = 16

/** A planned launch is drawn at the strength the SVG board draws it. */
const PREVIEW_OPACITY = 0.55
/** Dash drift, board units a second — the same flow as the planning overlays. */
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

/** The dart itself: a glowing head with a short additive wake behind it. */
function Dart({ color, phase }: { color: string; phase: number }) {
  const wake = useRef<MeshBasicMaterial>(null)

  useFrame(() => {
    const material = wake.current
    if (material) material.opacity = 0.22 + 0.12 * Math.sin(sceneTime.value * 5 + phase)
  })

  return (
    <group position={[0, HOVER, 0]}>
      <mesh rotation={[0, 0, -Math.PI / 2]} scale={[WIDTH, LENGTH, WIDTH]}>
        <coneGeometry args={[0.5, 1, 6]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.5}
          roughness={0.35}
          metalness={0.2}
          flatShading
          toneMapped={false}
        />
      </mesh>

      <mesh
        position={[-LENGTH * 0.78, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
        scale={[WIDTH * 0.62, LENGTH * 1.6, WIDTH * 0.62]}
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
}: {
  missile: Missile
  path: readonly Position[]
  color: string
  tooltip: string
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

  const anchor = useMemo(() => positionWorld(at, LAYER.token), [at])
  const shadow = useMemo(() => positionWorld(at, LAYER.path), [at])
  const yaw = useMemo(() => yawFromHeading(headingOf(at, path)), [at, path])

  const over = useCallback((event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    setHovered(true)
  }, [])
  const out = useCallback(() => setHovered(false), [])

  return (
    <group>
      {driftTrack && <SurfaceLine points={driftTrack} color={color} width={2.2} opacity={0.55} />}
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
      <SurfaceDot position={shadow} color={TABLE.felt} radius={6.5} opacity={0.6} />

      <group position={anchor} rotation={[0, yaw, 0]}>
        <Dart color={color} phase={phaseOf(missile.id)} />
        <mesh position={[0, HOVER, 0]} onPointerOver={over} onPointerOut={out}>
          <sphereGeometry args={[HOVER_RADIUS, 8, 6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {hovered && <BoardTooltip position={[0, HOVER + 34, 0]}>{tooltip}</BoardTooltip>}
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
          tooltip={`${nameOf(missile.ownerId)}'s missile → ${nameOf(missile.targetId)} · ${
            3 - missile.movesMade
          } flight(s) left. ${MISSILE_TOOLTIP}`}
        />
      ))}
    </>
  )
})
