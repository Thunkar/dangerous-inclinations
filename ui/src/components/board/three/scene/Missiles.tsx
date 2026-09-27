/**
 * Missiles in flight, and the launches sitting in your plan.
 *
 * The path a missile will take is already in the model (asked of the engine
 * once): the drift around its ring first, then the flight steps toward its
 * target. So are its heading and its place abreast in a salvo. Nothing here
 * works one out.
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
import { samePosition } from '@dangerous-inclinations/engine'
import { TABLE } from '../../../../theme'
import { createMissile } from '../../../../ships/missile'
import type { BoardModel, MissilePreview, MissileToken } from '../../model'
import { sceneTime } from '../clock'
import { LAYER, elevationAt, positionWorld, toWorld, yawFromHeading } from '../world'
import { BoardTooltip, SurfaceDot, SurfaceLine, SurfaceRing } from './overlays/marks'
import { NO_RAYCAST, arcPoints, chordPoints } from './overlays/paths'

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
/** A generous invisible sphere, so a dart two pixels wide can still be hovered. */
const HOVER_RADIUS = 16

/** A planned launch is drawn at the strength the SVG board draws it. */
const PREVIEW_OPACITY = 0.55
/** Dash drift, board units a second: the same flow as the planning overlays. */
const DASH_SPEED = 9

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

function MissileInFlight({ missile }: { missile: MissileToken }) {
  const [hovered, setHovered] = useState(false)
  const { position: at, path, color, tooltip, heading, point: abreast } = missile
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

  const yaw = yawFromHeading(heading)
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

function LaunchPreview({ preview }: { preview: MissilePreview }) {
  const [hovered, setHovered] = useState(false)
  const path = preview.path
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
}: {
  missiles: BoardModel['missiles']
  previews: BoardModel['missilePreviews']
}) {
  return (
    <>
      {previews.map(preview => (
        <LaunchPreview key={`preview-${preview.id}`} preview={preview} />
      ))}
      {missiles.map(missile => (
        <MissileInFlight key={missile.id} missile={missile} />
      ))}
    </>
  )
})
