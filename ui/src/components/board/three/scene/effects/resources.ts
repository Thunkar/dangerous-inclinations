/**
 * The buffers and materials the table's transient effects are drawn with.
 *
 * A turn pushes effects a few at a time and takes them away again a moment
 * later, so nothing here is allocated per effect: each geometry is built
 * once and shared by everything of that shape, and materials are borrowed from
 * a pool and handed back when the effect expires. Only the uniforms differ
 * between two beams, and those are written in `useFrame`.
 *
 * `disposeEffectResources()` gives it all back to the GPU when the 3D board
 * goes away, the way `surfaces.ts` does for the printed board.
 */
import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  Vector2,
  Vector3,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  type Material,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
} from 'three'
import { sceneTime } from '../../clock'
import { LAYER } from '../../world'
import {
  BOLT_FRAGMENT,
  BOLT_VERTEX,
  EMBER_FRAGMENT,
  EMBER_VERTEX,
  PLASMA_FRAGMENT,
  PLASMA_VERTEX,
  FIELD_FRAGMENT,
  FIELD_VERTEX,
  PUFF_FRAGMENT,
  PUFF_VERTEX,
  SHELL_FRAGMENT,
  SHELL_VERTEX,
  SHOCK_FRAGMENT,
  SHOCK_VERTEX,
} from './glsl'

/**
 * Where a shot leaves a hull and where it strikes one: the nozzle height of
 * the ship model. A shield's bubble and an EMP's crackle sit round it too.
 */
export const MUZZLE = LAYER.token + 9

/** Nothing transient is ever a click target: a beam must not eat a ship's hit. */
export const NO_RAYCAST = () => {}

/** Flat on the board, the way every surface mark on this table is laid. */
export const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0]

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const geometries = new Map<string, BufferGeometry>()

function shared<T extends BufferGeometry>(key: string, build: () => T): T {
  const existing = geometries.get(key)
  if (existing) return existing as T
  const geometry = build()
  geometries.set(key, geometry)
  return geometry
}

/**
 * A unit tube along +Y, open at both ends and finely segmented along its
 * length so the bolt shader can bow it without faceting. Every beam and every
 * jump streak is this one cylinder, scaled and pointed.
 */
export function boltGeometry(): BufferGeometry {
  return shared('bolt', () => new CylinderGeometry(1, 1, 1, 10, 28, true))
}

/** A unit disc, for shockwaves laid on the surface and for flashes. */
export function discGeometry(): BufferGeometry {
  return shared('disc', () => new CircleGeometry(1, 72))
}

/** A unit ball: beam heads, muzzle flashes, detonation cores. */
export function ballGeometry(): BufferGeometry {
  return shared('ball', () => new SphereGeometry(1, 14, 10))
}

/** A finer unit ball, for a shield's bubble: its rim is all there is to it. */
export function shellGeometry(): BufferGeometry {
  return shared('shell', () => new SphereGeometry(1, 40, 24))
}

/** A fine unit ball for a ball of plasma: its surface boils, and coarse facets would show it. */
export function plasmaGeometry(): BufferGeometry {
  return shared('plasma', () => new SphereGeometry(1, 36, 28))
}

/**
 * The directions a spark puff throws its sparks in: a Fibonacci sphere
 * flattened toward the board, so a burst reads as a puff on the table rather
 * than a ball hanging in the air. Deterministic, so two runs of the same turn
 * produce the same frame.
 */
export function puffGeometry(count = 26): BufferGeometry {
  return shared(`puff:${count}`, () => {
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    const golden = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / Math.max(1, count - 1)) * 2
      const radius = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = golden * i
      positions[i * 3] = Math.cos(theta) * radius
      positions[i * 3 + 1] = y * 0.45
      positions[i * 3 + 2] = Math.sin(theta) * radius
      const hash = Math.sin(i * 12.9898) * 43758.5453
      seeds[i] = hash - Math.floor(hash)
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1))
    return geometry
  })
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

interface MaterialByKind {
  bolt: ShaderMaterial
  shock: ShaderMaterial
  puff: ShaderMaterial
  field: ShaderMaterial
  shell: ShaderMaterial
  plasma: ShaderMaterial
  embers: ShaderMaterial
  glow: MeshBasicMaterial
}

type MaterialKind = keyof MaterialByKind

/** Enough for the busiest turn; anything beyond it is disposed rather than kept. */
const POOL_LIMIT = 10

const makers: { [K in MaterialKind]: () => MaterialByKind[K] } = {
  bolt: () =>
    new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color('#ffffff') },
        uHead: { value: 0 },
        uFade: { value: 0 },
        uTail: { value: 0.35 },
        uBase: { value: 0.35 },
        uDashes: { value: 0 },
        uDuty: { value: 0.5 },
        uSpeed: { value: 1.2 },
        uSoft: { value: 0 },
        uBow: { value: 0 },
        uTime: sceneTime,
      },
      vertexShader: BOLT_VERTEX,
      fragmentShader: BOLT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false,
    }),
  shock: () =>
    new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color('#ffffff') },
        uRadius: { value: 0 },
        uWidth: { value: 0.18 },
        uFade: { value: 0 },
        uCore: { value: 0 },
      },
      vertexShader: SHOCK_VERTEX,
      fragmentShader: SHOCK_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false,
    }),
  puff: () =>
    new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color('#ffffff') },
        uProgress: { value: 0 },
        uRadius: { value: 0 },
        uSize: { value: 7 },
        uFade: { value: 0 },
      },
      vertexShader: PUFF_VERTEX,
      fragmentShader: PUFF_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    }),
  field: () =>
    new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color('#ffffff') },
        uOrigin: { value: new Vector2() },
        uFront: { value: 0 },
        uFade: { value: 0 },
        uTime: sceneTime,
      },
      vertexShader: FIELD_VERTEX,
      fragmentShader: FIELD_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false,
    }),
  shell: () =>
    new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color('#ffffff') },
        uFade: { value: 0 },
        uStrike: { value: new Vector3(0, 0, 1) },
        uStrikeAmount: { value: 0 },
        uAccent: { value: new Color('#ffffff') },
        uRipple: { value: 0 },
        uPhase: { value: 0 },
      },
      vertexShader: SHELL_VERTEX,
      fragmentShader: SHELL_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false,
    }),
  plasma: () =>
    new ShaderMaterial({
      uniforms: {
        uCore: { value: new Color('#ffffff') },
        uGlow: { value: new Color('#ffffff') },
        uFade: { value: 0 },
        uHeat: { value: 1 },
        uStretch: { value: 0 },
        uBoil: { value: 0 },
        uSeed: { value: 0 },
        uTime: sceneTime,
      },
      vertexShader: PLASMA_VERTEX,
      fragmentShader: PLASMA_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    }),
  embers: () =>
    new ShaderMaterial({
      uniforms: {
        uFrom: { value: new Vector3() },
        uTo: { value: new Vector3() },
        uAim: { value: new Vector3(0, 0, 1) },
        uLob: { value: 0 },
        uT: { value: new Vector3(-1, -1, -1) },
        uLife: { value: 0.5 },
        uSpark: { value: 0.3 },
        uSize: { value: 6 },
        uFade: { value: 0 },
        uCore: { value: new Color('#ffffff') },
        uGlow: { value: new Color('#ffffff') },
      },
      vertexShader: EMBER_VERTEX,
      fragmentShader: EMBER_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    }),
  glow: () =>
    new MeshBasicMaterial({
      color: new Color('#ffffff'),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    }),
}

const pools: { [K in MaterialKind]: MaterialByKind[K][] } = {
  bolt: [],
  shock: [],
  puff: [],
  field: [],
  shell: [],
  plasma: [],
  embers: [],
  glow: [],
}

/**
 * One material of a kind, for as long as the component that asks is mounted.
 *
 * The claim is repeated when the effect mounts and given back when it
 * unmounts, so a material is never on the free list and on the table at the
 * same time, which is what React's development double-mount would otherwise
 * arrange.
 */
export function useEffectMaterial<K extends MaterialKind>(kind: K): MaterialByKind[K] {
  const material = useMemo(() => {
    const pool = pools[kind] as MaterialByKind[K][]
    return pool.pop() ?? makers[kind]()
  }, [kind])

  useEffect(() => {
    const pool = pools[kind] as MaterialByKind[K][]
    const claimed = pool.indexOf(material)
    if (claimed >= 0) pool.splice(claimed, 1)
    return () => {
      if (pool.length < POOL_LIMIT) pool.push(material)
      else material.dispose()
    }
  }, [kind, material])

  return material
}

/**
 * Light on the board is drawn over it rather than into it: the board is
 * terraced, and a flat pool of light laid on a slope is cut off by the next
 * step up. The material is this effect's for as long as it is mounted, and it
 * goes back to the pool depth-tested as it came.
 */
export function useLight(material: Material) {
  useEffect(() => {
    material.depthTest = false
    return () => {
      material.depthTest = true
    }
  }, [material])
}

/** Hand every shared buffer and every pooled material back to the GPU. */
export function disposeEffectResources() {
  for (const geometry of geometries.values()) geometry.dispose()
  geometries.clear()
  for (const kind of Object.keys(pools) as MaterialKind[]) {
    const pool = pools[kind]
    for (const material of pool) material.dispose()
    pool.length = 0
  }
}
