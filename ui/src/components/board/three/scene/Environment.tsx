/**
 * Deep space, lit for reading, and the one place that decides how much of it
 * this machine can afford.
 *
 * The room: a baked ink sky so the board never sits on flat black, three
 * shells of stars turning at different rates so orbiting the board parallaxes
 * them against each other, one cool key from above, a dim back light so a hull
 * has an edge against the void, a cold ink hemisphere fill so nothing goes
 * solid black, and one red lamp down in the pit: the only warm light on the table.
 * All of it is subordinate to the board: the sky stays at the luminance of the
 * felt, and nothing glows anywhere near a sector number.
 *
 * ## Quality
 *
 * The `postprocessing` prop is the *request*: the board's query flag, or its
 * default. What actually runs is decided here, by measuring. The composer costs
 * about two and a half times the frame time where there is no GPU to do it on,
 * and a playtester on a weak laptop is a real person; so the scene starts on
 * the requested path, watches a couple of seconds of frames, and steps down if
 * it cannot keep up: first the composer, which is where nearly all of the cost
 * is, and only on a machine that is still hopeless afterwards the whole cheap
 * path (fewer stars, a coarser sky, two-octave shaders, no cloud deck, coarser
 * spheres). It never steps back up: a board that changes its mind while you
 * are looking at it is worse than a board that is a little plain.
 *
 * `?quality=high` pins the requested path and `?quality=low` pins the cheap
 * one, so a screenshot can force either whatever the machine says.
 *
 * A screen-space lensing pass lived in this composer chain for a while and was
 * taken out again: at a strength that never touched a sector number it was
 * invisible, and at a strength you could see it bent the numbers. The black
 * hole says the same thing with geometry instead (see `scene/BlackHole.tsx`)
 * which costs nothing and cannot warp the board.
 *
 * This file is the only thing that measures and the only thing that steps the
 * scene down; the answer is kept in `shaders/quality.ts`, where the black hole,
 * the planets and the star shells read it. It changes at most twice, early, and
 * never per frame.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Vector3,
  type Group,
} from 'three'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { blackHoleBody } from '../bodies'
import { sceneTime } from '../clock'
import { KEY_DIRECTION, SCENE_LIGHT, SKY_INK, STAR_TINTS, inkColor } from '../palette'
import { NEBULA_FRAGMENT, NEBULA_VERTEX, buildNebulaTexture } from '../shaders/nebula'
import { stepDown, useDowngrade, useSceneQuality, type SceneQuality } from '../shaders/quality'
import { STARFIELD_FRAGMENT, STARFIELD_VERTEX } from '../shaders/starfield'

/** `?quality=high|low` pins the decision; anything else leaves it adaptive. */
function readQualityFlag(): 'high' | 'low' | null {
  if (typeof window === 'undefined') return null
  const asked = new URLSearchParams(window.location.search).get('quality')
  return asked === 'high' || asked === 'low' ? asked : null
}

/** Frames thrown away while shaders compile and buffers fill. */
const WARMUP_FRAMES = 30
/** Frames in a measuring window: two seconds at 20 fps, less if it is slower. */
const WINDOW_FRAMES = 40
/**
 * Two thresholds, because the two steps are not worth the same.
 *
 * Measured at 1440x900 under SwiftShader, which is the worst machine this will
 * ever meet: the composer costs about 42 ms a frame (61 -> 103), and the whole
 * cheap path saves about 3 (61 -> 58). The composer is the only lever that
 * matters, so it goes as soon as the board drops below about 22 fps; the cheap
 * path is held back for a machine that is genuinely hopeless, where every
 * millisecond is worth having and a plainer board is the lesser loss.
 */
const COMPOSER_LIMIT_MS = 45
const CHEAP_LIMIT_MS = 90

/**
 * Watches the first few seconds and steps the scene down if it has to, then
 * stops measuring. It is mounted only while the decision is still open.
 */
function QualityProbe({
  level,
  composerOn,
  onSlow,
}: {
  level: number
  composerOn: boolean
  onSlow: (next: number) => void
}) {
  const probe = useRef({ warmup: 0, frames: 0, elapsed: 0, seen: -1, done: false })

  useFrame((_, delta) => {
    const state = probe.current
    if (state.done) return
    // A step down changes what is drawn: throw the window away and start again.
    if (state.seen !== level) {
      state.seen = level
      state.warmup = 0
      state.frames = 0
      state.elapsed = 0
    }
    if (state.warmup < WARMUP_FRAMES) {
      state.warmup++
      return
    }
    state.frames++
    state.elapsed += delta
    if (state.frames < WINDOW_FRAMES) return

    const average = (state.elapsed / state.frames) * 1000
    state.frames = 0
    state.elapsed = 0

    // Drop the composer first if it is what is running; otherwise the only
    // step left is the cheap path, and it has a much higher bar.
    if (level === 0 && composerOn && average > COMPOSER_LIMIT_MS) {
      onSlow(1)
      return
    }
    if (average > CHEAP_LIMIT_MS) {
      state.done = true
      onSlow(2)
      return
    }
    state.done = true
  })

  return null
}

/* --------------------------------------------------------------------- sky */

const SKY_RADIUS = 9000

function Nebula({ quality }: { quality: SceneQuality }) {
  const texture = useMemo(
    () =>
      quality === 'cheap'
        ? buildNebulaTexture(SKY_INK, 160, 3)
        : buildNebulaTexture(SKY_INK, 320, 4),
    [quality]
  )
  useEffect(() => () => texture.dispose(), [texture])

  const uniforms = useMemo(
    () => ({
      uMap: { value: texture },
      uHorizon: { value: new Color(SKY_INK.horizon) },
      uIntensity: { value: 1 },
    }),
    [texture]
  )

  return (
    <mesh frustumCulled={false} renderOrder={-100}>
      <sphereGeometry args={[SKY_RADIUS, 32, 16]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={NEBULA_VERTEX}
        fragmentShader={NEBULA_FRAGMENT}
        side={BackSide}
        depthWrite={false}
      />
    </mesh>
  )
}

/* ------------------------------------------------------------------- stars */

interface Shell {
  radius: number
  count: number
  /** Radians a second about its own axis: this is where the parallax comes from. */
  spin: number
  axis: readonly [number, number, number]
  sizeScale: number
}

const SHELLS: readonly Shell[] = [
  { radius: 3000, count: 300, spin: 0.0044, axis: [0.15, 1, 0.1], sizeScale: 2.2 },
  { radius: 5400, count: 640, spin: 0.0025, axis: [-0.4, 1, 0.25], sizeScale: 1.6 },
  { radius: 8200, count: 1080, spin: 0.0011, axis: [0.3, 0.8, -0.5], sizeScale: 1.2 },
]

/**
 * One shell of stars. Position, size, tint and twinkle phase are baked into
 * attributes, so a shell is one draw call and one uniform a frame. The
 * generator is a deterministic LCG rather than `Math.random`: the sky is the
 * same sky every time the board opens, which is what makes a before-and-after
 * screenshot mean anything.
 */
function StarShell({ shell, density, seed }: { shell: Shell; density: number; seed: number }) {
  const group = useRef<Group>(null)

  const geometry = useMemo(() => {
    const count = Math.max(24, Math.round(shell.count * density))
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const phases = new Float32Array(count)
    const tints = new Float32Array(count * 3)
    const tintColors = STAR_TINTS.map(inkColor)
    let state = (seed * 2654435761) % 4294967296
    const random = () => {
      state = (state * 1664525 + 1013904223) % 4294967296
      return state / 4294967296
    }

    for (let i = 0; i < count; i++) {
      // Even over the sphere: uniform in height, not in polar angle.
      const height = random() * 2 - 1
      const theta = random() * Math.PI * 2
      const r = Math.sqrt(Math.max(0, 1 - height * height))
      positions[i * 3] = Math.cos(theta) * r * shell.radius
      positions[i * 3 + 1] = height * shell.radius
      positions[i * 3 + 2] = Math.sin(theta) * r * shell.radius

      // Most stars are faint and a handful carry the picture; cubed, so the
      // bright ones are rare rather than merely fewer.
      const magnitude = random() ** 3
      sizes[i] = shell.sizeScale * (1.0 + magnitude * 2.2)
      phases[i] = random() * Math.PI * 2

      // Cold white through white and cream to a pale red, the warm end deliberately rare.
      const pick = Math.floor(random() ** 1.7 * tintColors.length)
      const tint = tintColors[Math.min(tintColors.length - 1, pick)]
      const brightness = 0.52 + magnitude * 0.48
      tints[i * 3] = tint.r * brightness
      tints[i * 3 + 1] = tint.g * brightness
      tints[i * 3 + 2] = tint.b * brightness
    }

    const buffer = new BufferGeometry()
    buffer.setAttribute('position', new BufferAttribute(positions, 3))
    buffer.setAttribute('aSize', new BufferAttribute(sizes, 1))
    buffer.setAttribute('aPhase', new BufferAttribute(phases, 1))
    buffer.setAttribute('aTint', new BufferAttribute(tints, 3))
    return buffer
  }, [density, seed, shell.count, shell.radius, shell.sizeScale])

  useEffect(() => () => geometry.dispose(), [geometry])

  const uniforms = useMemo(
    () => ({
      uTime: sceneTime,
      uPixelRatio: { value: 1 },
      uTwinkle: { value: 0.3 + seed * 0.12 },
    }),
    [seed]
  )

  const axis = useMemo(
    () => new Vector3(shell.axis[0], shell.axis[1], shell.axis[2]).normalize(),
    [shell.axis]
  )

  useFrame(({ viewport }, delta) => {
    // Point size is in device pixels, so it has to track the canvas's own
    // ratio; read in the frame rather than subscribed to, so a resize never
    // re-renders the scene.
    uniforms.uPixelRatio.value = Math.min(viewport.dpr || 1, 1.5)
    group.current?.rotateOnAxis(axis, delta * shell.spin)
  })

  return (
    <group ref={group}>
      <points geometry={geometry} frustumCulled={false} renderOrder={-90}>
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={STARFIELD_VERTEX}
          fragmentShader={STARFIELD_FRAGMENT}
          transparent
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </points>
    </group>
  )
}

function Starfield({ quality }: { quality: SceneQuality }) {
  const density = quality === 'cheap' ? 0.3 : 1
  return (
    <>
      {SHELLS.map((shell, index) => (
        <StarShell key={shell.radius} shell={shell} density={density} seed={index + 1} />
      ))}
    </>
  )
}

/* ---------------------------------------------------------------- the room */

/** Lights are placed by direction; the distance is only "outside the board". */
const LIGHT_DISTANCE = 2400

export function Environment({ postprocessing = true }: { postprocessing?: boolean }) {
  const pinned = useMemo(() => readQualityFlag(), [])
  const level = useDowngrade()
  const quality = useSceneQuality()
  const onSlow = useCallback((next: number) => stepDown(next), [])

  useEffect(() => {
    if (pinned === 'low') stepDown(2)
  }, [pinned])

  const composerOn = pinned === 'low' ? false : postprocessing && level < 1

  const body = useMemo(() => blackHoleBody(), [])
  const key = useMemo(
    () =>
      new Vector3(...KEY_DIRECTION).normalize().multiplyScalar(LIGHT_DISTANCE).toArray() as [
        number,
        number,
        number,
      ],
    []
  )
  const rim = useMemo(
    () =>
      new Vector3(...SCENE_LIGHT.rimDirection)
        .normalize()
        .multiplyScalar(LIGHT_DISTANCE)
        .toArray() as [number, number, number],
    []
  )

  return (
    <>
      <Nebula quality={quality} />
      <Starfield quality={quality} />

      <hemisphereLight args={[SCENE_LIGHT.fill, SCENE_LIGHT.ground, 0.5]} />
      <directionalLight
        position={key}
        intensity={SCENE_LIGHT.keyIntensity}
        color={SCENE_LIGHT.key}
      />
      {/* A back light, so the shoulder of a hull is never the same value as the
          sky behind it. Dim on purpose: it must not read as a second sun. */}
      <directionalLight
        position={rim}
        intensity={SCENE_LIGHT.rimIntensity}
        color={SCENE_LIGHT.rim}
      />
      {/* The lamp in the pit. Its range stops inside ring 5: the red belongs
          to the black hole, not to the whole plate. */}
      <pointLight
        position={[0, body.centerY, 0]}
        color={SCENE_LIGHT.lamp}
        intensity={5200}
        distance={240}
        decay={2}
      />

      {pinned === null && <QualityProbe level={level} composerOn={composerOn} onSlow={onSlow} />}

      {composerOn && (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          {/* High threshold and a tight radius: only the hottest part of the
              disc blooms, and it must not spill across the horizon: a black
              hole with a grey middle is a smudge, not a hole. */}
          <Bloom
            mipmapBlur
            intensity={0.5}
            radius={0.55}
            luminanceThreshold={0.88}
            luminanceSmoothing={0.15}
          />
          <Vignette offset={0.32} darkness={0.6} eskil={false} />
        </EffectComposer>
      )}
    </>
  )
}
