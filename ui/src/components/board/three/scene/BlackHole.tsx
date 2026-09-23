/**
 * The black hole: a hole, a rim, a ring of light and a disc.
 *
 * It is the centre of the board and it is asked to look like it without ever
 * getting in the way of the numbers printed around it. Four layers, outward:
 *
 *  1. **The horizon**: a sphere darker than the felt, so it reads as a hole
 *     cut in the table rather than a ball resting on it, with one hard red
 *     line at the silhouette. Without that line it is not visible at all.
 *  2. **The photon ring and the lensed arc**: camera-facing annuli just
 *     outside the silhouette. The ring is the cheapest true statement about a
 *     black hole available: light that went round instead of falling in, with a
 *     second, fainter order of the same image outside it. The arc is the far
 *     side of the disc, bent over the top of the hole, which is what stops the
 *     flat disc reading as a hat brim.
 *  3. **The accretion disc**, a sheet, not a decal: tilted out of the board
 *     plane, turning, wound into spiral filaments, white hot at its inner lip,
 *     brighter on the limb turning toward you, and drawn three times at a
 *     flared scale height so it has a thickness. It turns differentially, and
 *     it turns *visibly*: bright clumps of gas orbit at their own radius's
 *     Keplerian rate (this component tells them where they are, once a frame)
 *     and the inner edge laps the outer. See `shaders/accretion.ts` for why
 *     that took landmarks rather than more turbulence.
 *  4. **The pool**: the light spilling onto the floor of the pit, drawn flat
 *     in the board plane where it can never intersect the funnel wall, and
 *     spent long before ring 1's sector numbers. Its mottle turns at the rate
 *     of the gas at the disc's outer edge, because that is the gas throwing it.
 *
 * Not one radius in this file is a number. Every one comes from `bodies.ts`,
 * which solves them against ring 1's own ink (in plan for the Top camera and
 * up the screen for the Table one) so opening the board out makes the black
 * hole bigger and nothing here has to be touched. The whole group floats at the
 * elevation `blackHoleBody()` computes, so a deeper gravity funnel carries it
 * down without the disc cutting into the wall.
 *
 * `?bh=blaze|warp|halo` picks a treatment; `bodies.ts` describes them.
 */
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  Vector3,
  type Group,
  type Mesh,
  type Object3D,
  type ShaderMaterial,
} from 'three'
import { useFrame } from '@react-three/fiber'
import { blackHoleBody } from '../bodies'
import { sceneTime } from '../clock'
import { DISC_INK, inkColor } from '../palette'
import {
  ACCRETION_VERTEX,
  FACING_VERTEX,
  KNOT_COUNT,
  LENSED_ARC_FRAGMENT,
  accretionFragment,
  orbitRate,
  writeKnots,
} from '../shaders/accretion'
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

const localCamera = new Vector3()

/**
 * Put this frame's clock and this frame's camera bearing into the materials
 * that are actually on the GPU.
 *
 * This looks like it should be unnecessary, and it is the single reason the
 * black hole never appeared to turn. A `<shaderMaterial uniforms={...}>` does
 * not keep the object it is handed: three's `ShaderMaterial.copy` runs the
 * uniforms through `cloneUniforms`, which copies a **number by value** and
 * shares an **object or a typed array by reference**. So `uTime: sceneTime`
 * ends up as a private `{ value }` on the material, frozen at whatever the
 * clock read when the copy happened (a fraction of a second after the board
 * opened) and every later `sceneTime.value += delta` writes to an object the
 * renderer will never look at again. `uApproach` and `uLean`, written here
 * every frame, were dead in exactly the same way: the Doppler-beamed limb was
 * pinned to the board instead of following the camera.
 *
 * The clumps escaped it only by accident: they travel as a `Float32Array`,
 * which `cloneUniforms` passes by reference, so mutating it in place reaches
 * the GPU. That is the tell that named the bug.
 *
 * Writing through the live material is proof against it however the copy
 * happens, and it costs five assignments a frame.
 *
 * The same bug had frozen everything else that animates through `sceneTime`:
 * the ring dashes, the lane flow, the planets, the nebula, the stars' twinkle.
 * `SceneClock` now writes `uTime` through the whole scene every frame, so
 * that half is fixed there rather than here. What is left below is the half
 * only the black hole needs: `uApproach` and `uLean` are the camera's bearing
 * in the disc's own frame, which no shared clock could know.
 */
function writeScalars(root: Object3D | null, time: number, approach: number): void {
  if (!root) return
  root.traverse(object => {
    const material = (object as Mesh).material as ShaderMaterial | undefined
    const uniforms = material?.uniforms
    if (!uniforms) return
    if (uniforms.uTime) uniforms.uTime.value = time
    if (uniforms.uApproach) uniforms.uApproach.value = approach
    if (uniforms.uLean) uniforms.uLean.value = Math.sin(approach)
  })
}

/** How much light the disc's midplane writes. Its shells write a fraction of it. */
const DISC_LIGHT = 0.74

/**
 * The unit sheet the disc is drawn on: a grid in (fraction of the radius,
 * azimuth) that the vertex shader bends into place. One buffer serves the
 * midplane and both shells, and the radial resolution is what the warp and the
 * scale height are smooth over: a four-segment ring creases visibly.
 */
function discSheetGeometry(radialSteps: number, arcSteps: number): BufferGeometry {
  const positions = new Float32Array((radialSteps + 1) * (arcSteps + 1) * 3)
  const polar = new Float32Array((radialSteps + 1) * (arcSteps + 1) * 2)
  let v = 0
  let p = 0
  for (let i = 0; i <= radialSteps; i++) {
    const u = i / radialSteps
    for (let j = 0; j <= arcSteps; j++) {
      const theta = (j / arcSteps) * Math.PI * 2
      // The shader puts every vertex where it belongs; these are placeholders
      // that only have to be somewhere sane for the bounding sphere.
      positions[v++] = Math.cos(theta) * u
      positions[v++] = 0
      positions[v++] = Math.sin(theta) * u
      polar[p++] = u
      polar[p++] = theta
    }
  }
  const indices: number[] = []
  const stride = arcSteps + 1
  for (let i = 0; i < radialSteps; i++) {
    for (let j = 0; j < arcSteps; j++) {
      const a = i * stride + j
      indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('aPolar', new BufferAttribute(polar, 2))
  geometry.setIndex(indices)
  return geometry
}

export function BlackHole({
  onDoubleClick,
}: {
  onDoubleClick?: (event: { stopPropagation: () => void }) => void
}) {
  const quality = useSceneQuality()
  const body = useMemo(() => blackHoleBody(), [])
  // The pool lies on the floor of the funnel, a hair above the plate.
  const floorOffset = surfaceElevation('blackhole', 0) - body.centerY + LAYER.ring
  const facing = useRef<Group>(null)
  const root = useRef<Group>(null)

  const sheet = useMemo(
    () => discSheetGeometry(quality === 'cheap' ? 14 : 36, quality === 'cheap' ? 96 : 160),
    [quality]
  )
  useEffect(() => () => sheet.dispose(), [sheet])

  const rimUniforms = useMemo(
    () => ({
      uRim: { value: inkColor(DISC_INK.rim) },
      uVoid: { value: inkColor(DISC_INK.void) },
      uPower: { value: 13.0 },
      uIntensity: { value: 1.6 },
    }),
    []
  )

  const photonUniforms = useMemo(
    () => ({
      uColor: { value: inkColor(DISC_INK.photon) },
      uRadius: { value: body.radius * 1.035 },
      uWidth: { value: body.radius * 0.042 },
      uIntensity: { value: 0.95 * body.photon },
      uHalo: { value: 0.11 * body.photon },
      uHaloRadius: { value: body.arcOuter },
      uHaloRadiusUp: { value: body.arcOuterUp },
    }),
    [body.arcOuter, body.arcOuterUp, body.photon, body.radius]
  )

  // The rate of the gas at the disc's outer edge, which is the gas the pool on
  // the floor and the arc over the top are both light thrown by. Reading it from
  // the same law the disc turns by is what keeps the three in step.
  const rimSpin = useMemo(() => orbitRate(body.discOuter, body.discInner), [body])

  const poolUniforms = useMemo(
    () => ({
      uColor: { value: inkColor(DISC_INK.pool) },
      uRadius: { value: body.pool },
      uFalloff: { value: 2.3 },
      uIntensity: { value: 0.8 },
      uTime: sceneTime,
      uSpin: { value: rimSpin },
    }),
    [body.pool, rimSpin]
  )

  const arcUniforms = useMemo(
    () => ({
      uHot: { value: inkColor(DISC_INK.hot) },
      uWarm: { value: inkColor(DISC_INK.warm) },
      uInner: { value: body.arcInner },
      uOuter: { value: body.arcOuter },
      uOuterUp: { value: body.arcOuterUp },
      uTime: sceneTime,
      uIntensity: { value: 0.85 * body.arc },
      uUnderside: { value: 0.38 },
      uBeaming: { value: body.beaming },
      uLean: { value: 0 },
      uSpin: { value: rimSpin },
    }),
    [body.arc, body.arcInner, body.arcOuter, body.arcOuterUp, body.beaming, rimSpin]
  )

  /**
   * Where the clumps of gas are. One pair of arrays for all three sheets, so
   * the midplane and its shells are three slices of the same clumps; mutated in
   * `useFrame` and never replaced, so nothing re-renders and the uniforms are
   * uploaded from the same buffer every frame.
   */
  const knots = useMemo(
    () => ({
      uKnots: { value: new Float32Array(KNOT_COUNT * 4) },
      uKnotGain: { value: new Float32Array(KNOT_COUNT) },
    }),
    []
  )

  const discUniforms = useMemo(
    () => ({
      uHot: { value: inkColor(DISC_INK.hot) },
      uWarm: { value: inkColor(DISC_INK.warm) },
      uEmber: { value: inkColor(DISC_INK.ember) },
      uInner: { value: body.discInner },
      uBright: { value: body.discBright },
      uOuter: { value: body.discOuter },
      uTilt: { value: body.tilt },
      uWarp: { value: body.warp },
      uLift: { value: body.lift },
      uPuff: { value: body.puff },
      uSpiral: { value: body.spiral },
      uTime: sceneTime,
      uIntensity: { value: DISC_LIGHT },
      uApproach: { value: 0 },
      uBeaming: { value: body.beaming },
      uShell: { value: 0 },
      ...knots,
    }),
    [body, knots]
  )

  // Three octaves on the disc, two on everything else. The disc covers more
  // pixels than anything else in the scene, and past three octaves the extra
  // detail is below the size of the turbulence it is already drawing.
  const octaves = quality === 'cheap' ? 2 : 3
  const discFragment = useMemo(() => accretionFragment(octaves), [octaves])
  // The shells are a soft body of gas around the midplane, not the subject:
  // one octave less each, which is two thirds of the disc's pixels made a third
  // cheaper for a difference that cannot be seen through their own alpha.
  const shellFragment = useMemo(() => accretionFragment(octaves - 1), [octaves])
  const arcFragment = useMemo(() => withOctaves(2, LENSED_ARC_FRAGMENT), [])
  const poolFragment = useMemo(() => withOctaves(2, LIGHT_POOL_FRAGMENT), [])

  // The shells are the expensive half of the disc (the same fragment shader
  // over again, twice) so a machine that has already been stepped down draws
  // the midplane alone.
  const shells = quality === 'cheap' ? [0] : body.shells ? [0, 1, -1] : [0]

  useFrame(({ camera }) => {
    if (facing.current) facing.current.quaternion.copy(camera.quaternion)

    // Where the clumps of gas have got to. Ten of them, once a frame, against
    // the hundred thousand fragments they are drawn over.
    writeKnots(
      sceneTime.value,
      body.discInner,
      body.discOuter,
      knots.uKnots.value,
      knots.uKnotGain.value
    )

    // Beaming: find the limb of the disc that is turning toward the camera.
    // The disc turns prograde (the way sectors increase) so the limb coming
    // at you is a quarter turn behind the camera's own bearing over the board.
    // The hole sits at the board's origin, so the camera's bearing over the
    // board is its own x/z angle.
    localCamera.copy(camera.position)
    const bearing = Math.atan2(localCamera.z, localCamera.x)
    // The arc is square to the camera, so the bent image of that limb lands on
    // whichever side of the screen it is on: the sine of the same angle.
    writeScalars(root.current, sceneTime.value, bearing - Math.PI / 2)
  })

  return (
    <group ref={root} position={[0, body.centerY, 0]} onDoubleClick={onDoubleClick}>
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
          bounded in board units, which is what keeps it off ring 1. */}
      <mesh position={[0, floorOffset, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={0}>
        <circleGeometry args={[body.pool, 96]} />
        <shaderMaterial
          uniforms={poolUniforms}
          vertexShader={LIGHT_POOL_VERTEX}
          fragmentShader={poolFragment}
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
          <ringGeometry args={[body.arcInner, body.arcOuter, 128, 1]} />
          <shaderMaterial
            uniforms={arcUniforms}
            vertexShader={FACING_VERTEX}
            fragmentShader={arcFragment}
            transparent
            blending={AdditiveBlending}
            side={DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh renderOrder={3}>
          <ringGeometry args={[body.radius * 0.9, body.arcOuter, 96, 1]} />
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

      {/* The disc: one sheet drawn three times, a midplane and two shells. The
          shells are drawn at under half the midplane's weight: three sheets at
          full strength add to white and a white black hole is a smudge. */}
      {shells.map(shell => (
        <mesh key={shell} geometry={sheet} renderOrder={2} frustumCulled={false}>
          <shaderMaterial
            uniforms={{
              ...discUniforms,
              uShell: { value: shell },
              uIntensity: { value: shell === 0 ? DISC_LIGHT : DISC_LIGHT * 0.42 },
            }}
            vertexShader={ACCRETION_VERTEX}
            fragmentShader={shell === 0 ? discFragment : shellFragment}
            transparent
            blending={AdditiveBlending}
            side={DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}
