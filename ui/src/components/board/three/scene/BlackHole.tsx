/**
 * The black hole: a hole, a rim, a ring of light and a disc.
 *
 * It is the centre of the board and it is asked to look like it without ever
 * getting in the way of the numbers printed around it. Four layers, outward:
 *
 *  1. **The horizon** — a sphere darker than the felt, so it reads as a hole
 *     cut in the table rather than a ball resting on it, with one hard amber
 *     line at the silhouette. Without that line it is not visible at all.
 *  2. **The photon ring and the lensed arc** — camera-facing annuli just
 *     outside the silhouette. The ring is the cheapest true statement about a
 *     black hole available: light that went round instead of falling in. The
 *     arc is the far side of the disc, bent over the top of the hole, which is
 *     what stops the flat disc reading as a hat brim.
 *  3. **The accretion disc** — tilted sixteen degrees, sheared by Keplerian
 *     rotation, hottest at the inner edge, brighter on the limb turning toward
 *     you. See `shaders/accretion.ts` for what each term is doing.
 *  4. **The pool** — the light spilling onto the floor of the pit, drawn flat
 *     in the board plane where it can never intersect the funnel wall, and
 *     spent long before ring 1's sector numbers.
 *
 * Every radius comes from `bodies.ts`, which knows where ring 1 starts. The
 * whole group floats at the elevation `blackHoleBody()` computes, so a deeper
 * gravity funnel carries it down without the disc cutting into the wall.
 */
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  DoubleSide,
  FrontSide,
  Vector3,
  type Group,
  type Mesh,
  type Object3D,
} from 'three'
import { useFrame } from '@react-three/fiber'
import { DISC_TILT, POOL_RADIUS, blackHoleBody } from '../bodies'
import { sceneTime } from '../clock'
import { DISC_INK, inkColor } from '../palette'
import { ACCRETION_FRAGMENT, ACCRETION_VERTEX, LENSED_ARC_FRAGMENT } from '../shaders/accretion'
import {
  HORIZON_FRAGMENT,
  HORIZON_VERTEX,
  LIGHT_POOL_FRAGMENT,
  LIGHT_POOL_VERTEX,
  PHOTON_RING_FRAGMENT,
  PHOTON_RING_VERTEX,
} from '../shaders/horizon'
import { withOctaves } from '../shaders/noise'
import { LAYER, surfaceElevation } from '../world'
import { useSceneQuality } from '../shaders/quality'

/** Turns per minute of the disc's frame; the shear inside it is the shader's. */
const DISC_SPIN = 0.05

const localCamera = new Vector3()

export function BlackHole({
  onDoubleClick,
}: {
  onDoubleClick?: (event: { stopPropagation: () => void }) => void
}) {
  const quality = useSceneQuality()
  const body = useMemo(() => blackHoleBody(), [])
  // The pool lies on the floor of the funnel, a hair above the plate.
  const floorOffset = surfaceElevation('blackhole', 0) - body.centerY + LAYER.ring
  const disc = useRef<Group>(null)
  const discMesh = useRef<Mesh>(null)
  const facing = useRef<Group>(null)

  const rimUniforms = useMemo(
    () => ({
      uRim: { value: inkColor(DISC_INK.rim) },
      // Darker than the felt, so the hole is the blackest thing on the table.
      uVoid: { value: inkColor('#000000') },
      uPower: { value: 13.0 },
      uIntensity: { value: 1.6 },
    }),
    []
  )

  const photonUniforms = useMemo(
    () => ({
      uColor: { value: inkColor(DISC_INK.photon) },
      uRadius: { value: body.radius * 1.035 },
      uWidth: { value: body.radius * 0.055 },
      uIntensity: { value: 0.95 },
    }),
    [body.radius]
  )

  const poolUniforms = useMemo(
    () => ({
      uColor: { value: inkColor(DISC_INK.pool) },
      uRadius: { value: body.radius * POOL_RADIUS },
      uFalloff: { value: 4.2 },
      uIntensity: { value: 0.42 },
    }),
    [body.radius]
  )

  const arcUniforms = useMemo(
    () => ({
      uHot: { value: inkColor(DISC_INK.hot) },
      uWarm: { value: inkColor(DISC_INK.warm) },
      uInner: { value: body.radius * 1.02 },
      uOuter: { value: body.radius * 1.5 },
      uTime: sceneTime,
      uIntensity: { value: 0.85 },
      uUnderside: { value: 0.36 },
    }),
    [body.radius]
  )

  const discUniforms = useMemo(
    () => ({
      uHot: { value: inkColor(DISC_INK.hot) },
      uWarm: { value: inkColor(DISC_INK.warm) },
      uEmber: { value: inkColor(DISC_INK.ember) },
      uInner: { value: body.discInner },
      uBright: { value: body.discBright },
      uOuter: { value: body.discOuter },
      uTime: sceneTime,
      uIntensity: { value: 0.92 },
      uApproach: { value: 0 },
      uBeaming: { value: 0.45 },
    }),
    [body.discBright, body.discInner, body.discOuter]
  )

  // Three octaves on the disc, two on the arc. It covers more pixels than
  // anything else in the scene, and past three octaves the extra detail is
  // below the size of the turbulence it is already drawing.
  const octaves = quality === 'cheap' ? 2 : 3
  const discFragment = useMemo(() => withOctaves(octaves, ACCRETION_FRAGMENT), [octaves])
  const arcFragment = useMemo(() => withOctaves(2, LENSED_ARC_FRAGMENT), [])

  useFrame(({ camera }, delta) => {
    if (disc.current) disc.current.rotation.z -= delta * DISC_SPIN
    if (facing.current) facing.current.quaternion.copy(camera.quaternion)

    // Beaming: find the limb of the disc that is turning toward the camera.
    // The disc spins about its local -z, so that limb is a quarter turn behind
    // the camera's own bearing in the disc's frame.
    const mesh: Object3D | null = discMesh.current
    if (mesh) {
      localCamera.copy(camera.position)
      mesh.worldToLocal(localCamera)
      discUniforms.uApproach.value = Math.atan2(localCamera.y, localCamera.x) + Math.PI / 2
    }
  })

  return (
    <group position={[0, body.centerY, 0]} onDoubleClick={onDoubleClick}>
      {/* The horizon. Nothing comes off it but the line at its edge. */}
      <mesh renderOrder={1}>
        <sphereGeometry args={[body.radius, 48, 32]} />
        <shaderMaterial
          uniforms={rimUniforms}
          vertexShader={HORIZON_VERTEX}
          fragmentShader={HORIZON_FRAGMENT}
          side={FrontSide}
          toneMapped={false}
        />
      </mesh>

      {/* The light on the floor of the pit. Flat in the board plane, so it
          lies along the funnel instead of cutting through it, and radially
          bounded in board units — which is what keeps it off ring 1. */}
      <mesh position={[0, floorOffset, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={0}>
        <circleGeometry args={[body.radius * POOL_RADIUS, 72]} />
        <shaderMaterial
          uniforms={poolUniforms}
          vertexShader={LIGHT_POOL_VERTEX}
          fragmentShader={LIGHT_POOL_FRAGMENT}
          transparent
          blending={AdditiveBlending}
          side={DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* The light that went round, square to the camera: a ring of light has
          no orientation of its own. */}
      <group ref={facing}>
        {/* The far side of the disc, bent over the top. */}
        <mesh renderOrder={2}>
          <ringGeometry args={[body.radius * 1.02, body.radius * 1.5, 128, 1]} />
          <shaderMaterial
            uniforms={arcUniforms}
            vertexShader={ACCRETION_VERTEX}
            fragmentShader={arcFragment}
            transparent
            blending={AdditiveBlending}
            side={DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh renderOrder={3}>
          <ringGeometry args={[body.radius * 0.9, body.radius * 1.22, 96, 1]} />
          <shaderMaterial
            uniforms={photonUniforms}
            vertexShader={PHOTON_RING_VERTEX}
            fragmentShader={PHOTON_RING_FRAGMENT}
            transparent
            blending={AdditiveBlending}
            side={DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>

      <group ref={disc} rotation={[-Math.PI / 2 - (DISC_TILT * Math.PI) / 180, 0, 0]}>
        <mesh ref={discMesh} renderOrder={2}>
          <ringGeometry args={[body.discInner, body.discOuter, 128, 4]} />
          <shaderMaterial
            uniforms={discUniforms}
            vertexShader={ACCRETION_VERTEX}
            fragmentShader={discFragment}
            transparent
            blending={AdditiveBlending}
            side={DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  )
}
