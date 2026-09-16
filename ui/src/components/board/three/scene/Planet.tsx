/**
 * A planet: a world, not a ball.
 *
 * Three spheres tinted blue, red and green read as the same sphere three times,
 * and the colours are not negotiable — they are the ones on the rules sheet, so
 * a planet is recognisable from the paper board. The difference has to be
 * carried by the surface instead, so each well gets its own kind: Alpha is a
 * banded gas giant, Beta a cratered rock, Gamma an ocean world under cloud. At
 * the Table view that difference reads as texture; fly to one and it is a
 * world. All of it is procedural — the repository holds no images and the
 * board fetches nothing.
 *
 * Each body turns at its own rate, slowly enough that a screenshot taken a
 * minute apart is a different picture and a player watching is not distracted.
 * The lighting is the scene's own key direction, so the terminator on a planet
 * falls the same way as the shadow on the plate beneath it.
 */
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BackSide, Color, FrontSide, Vector3, type Mesh } from 'three'
import { useFrame } from '@react-three/fiber'
import type { GravityWellId } from '@dangerous-inclinations/engine'
import { wellCenter, wellVisual } from '../../geometry'
import { sceneTime } from '../clock'
import { BODY_KEY_DIRECTION, SCENE_LIGHT, bodyRamp, inkColor } from '../palette'
import { ATMOSPHERE_FRAGMENT, ATMOSPHERE_VERTEX } from '../shaders/atmosphere'
import { withOctaves } from '../shaders/noise'
import {
  CLOUD_FRAGMENT,
  PLANET_VERTEX,
  planetFragment,
  type PlanetKind,
} from '../shaders/planetSurface'
import { surfaceElevation } from '../world'
import { useSceneQuality } from '../shaders/quality'

/**
 * Which world is which. Blue takes the bands (a blue gas giant is the most
 * legible of the three at a glance), red the craters, green the ocean.
 */
const PLANET_KIND: Record<string, PlanetKind> = {
  'planet-alpha': 'gas',
  'planet-beta': 'rock',
  'planet-gamma': 'ocean',
}

/** Radians a second. Different per world, so they never look geared together. */
const SPIN: Record<string, number> = {
  'planet-alpha': 0.04,
  'planet-beta': 0.026,
  'planet-gamma': 0.033,
}

/**
 * Axial tilt, in degrees about the board's x and z axes.
 *
 * Generous, and mostly sideways. The camera looks *down* on the board, so a
 * world with a polite Earth-like tilt shows the table nothing but its own north
 * pole, and a gas giant seen pole-on is a set of concentric rings — a
 * fingerprint, not a planet. Leaning each axis over toward the horizontal
 * brings the equator into view, which is where the bands, the continents and
 * the terminator all live.
 */
const TILT: Record<string, readonly [number, number]> = {
  'planet-alpha': [18, 46],
  'planet-beta': [-16, -58],
  'planet-gamma': [9, 66],
}

const KEY = new Vector3(...BODY_KEY_DIRECTION).normalize()

/** How far past the limb the air reaches, in body radii. */
const AIR_OUTER = 1.34

export function Planet({
  wellId,
  onDoubleClick,
}: {
  wellId: GravityWellId
  onDoubleClick?: (event: { stopPropagation: () => void }) => void
}) {
  const quality = useSceneQuality()
  const visual = wellVisual(wellId)
  const center = wellCenter(wellId)
  const body = useRef<Mesh>(null)
  const clouds = useRef<Mesh>(null)

  const kind = PLANET_KIND[wellId] ?? 'rock'
  const octaves = quality === 'cheap' ? 2 : 4

  const ramp = useMemo(() => bodyRamp(visual.color), [visual.color])

  const surfaceUniforms = useMemo(
    () => ({
      uDeep: { value: ramp.deep },
      uMid: { value: ramp.mid },
      uHigh: { value: ramp.high },
      uKeyColor: { value: new Color(SCENE_LIGHT.key) },
      uFillColor: { value: new Color(SCENE_LIGHT.fill) },
      uKeyDirection: { value: KEY },
      uAmbient: { value: 0.045 },
      uTime: sceneTime,
    }),
    [ramp]
  )

  const cloudUniforms = useMemo(
    () => ({
      uColor: { value: new Color('#e8f1fb') },
      uKeyColor: { value: new Color(SCENE_LIGHT.key) },
      uFillColor: { value: new Color(SCENE_LIGHT.fill) },
      uKeyDirection: { value: KEY },
      uAmbient: { value: 0.05 },
      uTime: sceneTime,
      uCoverage: { value: 0.6 },
    }),
    []
  )

  /* The limb glow: the printed colour bleached toward white, warmer where the
     star grazes it. Narrow on purpose — the planet's name is printed on the
     plate just outside the body and must stay ink on black. */
  const airUniforms = useMemo(
    () => ({
      uColor: { value: inkColor(visual.color) },
      uDayColor: {
        value: inkColor(visual.color).lerp(new Color().setRGB(1, 0.93, 0.82), 0.55),
      },
      uKeyDirection: { value: KEY },
      uBodyRadius: { value: visual.bodyRadius },
      uOuter: { value: AIR_OUTER },
      uPower: { value: 3.4 },
      uIntensity: { value: 1.05 },
    }),
    [visual.bodyRadius, visual.color]
  )

  const surfaceShader = useMemo(() => withOctaves(octaves, planetFragment(kind)), [kind, octaves])
  const cloudShader = useMemo(() => withOctaves(octaves, CLOUD_FRAGMENT), [octaves])

  const spin = SPIN[wellId] ?? 0.03
  const tilt = TILT[wellId] ?? [50, 0]

  useEffect(() => {
    // Start each world at its own longitude, so two of them never show the
    // same face at once on a fresh page.
    const phase = (wellId.length * 1.7) % (Math.PI * 2)
    if (body.current) body.current.rotation.y = phase
    if (clouds.current) clouds.current.rotation.y = phase * 0.6
  }, [wellId])

  useFrame((_, delta) => {
    if (body.current) body.current.rotation.y += delta * spin
    // The deck slips ahead of the ground: weather, not paint.
    if (clouds.current) clouds.current.rotation.y += delta * spin * 1.22
  })

  const elevation = surfaceElevation(wellId, 0) + visual.bodyRadius * 0.55
  const segments = quality === 'cheap' ? 32 : 64

  return (
    <group position={[center.x, elevation, center.y]} onDoubleClick={onDoubleClick}>
      <group rotation={[(tilt[0] * Math.PI) / 180, 0, (tilt[1] * Math.PI) / 180]}>
        <mesh ref={body}>
          <sphereGeometry args={[visual.bodyRadius, segments, Math.round(segments / 1.6)]} />
          <shaderMaterial
            uniforms={surfaceUniforms}
            vertexShader={PLANET_VERTEX}
            fragmentShader={surfaceShader}
            side={FrontSide}
          />
        </mesh>

        {kind === 'ocean' && quality !== 'cheap' && (
          <mesh ref={clouds}>
            <sphereGeometry
              args={[visual.bodyRadius * 1.028, segments, Math.round(segments / 1.6)]}
            />
            <shaderMaterial
              uniforms={cloudUniforms}
              vertexShader={PLANET_VERTEX}
              fragmentShader={cloudShader}
              transparent
              depthWrite={false}
              side={FrontSide}
            />
          </mesh>
        )}
      </group>

      <mesh>
        <sphereGeometry args={[visual.bodyRadius * AIR_OUTER, 40, 24]} />
        <shaderMaterial
          uniforms={airUniforms}
          vertexShader={ATMOSPHERE_VERTEX}
          fragmentShader={ATMOSPHERE_FRAGMENT}
          transparent
          blending={AdditiveBlending}
          side={BackSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
