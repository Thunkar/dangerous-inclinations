/**
 * The shared modular corvette display model. +X is the bow, +Y is dorsal, port is -Z.
 * All mount-local modules point along +Y and share one keyed magnetic shoe.
 * Named groups are deliberately a clean seam for eventual authored glTF parts.
 * These intersecting display meshes are NOT manufacturing solids.
 */
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Path,
  Shape,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import type { Livery, SubsystemType } from '@dangerous-inclinations/engine'
import { MOUNTS, mountTransform, type MountId, type Vec3, type ShipConfig } from './config'
import { HULL_INK } from './palette'

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { visibleSlots, type VisibleSlots } from './visual'

type Material = MeshStandardMaterial

/** The livery patterns as the paint shader numbers them. */
const LIVERY_CODE: Record<Livery, number> = {
  band: 1,
  split: 2,
  chevron: 3,
  stern: 4,
  spine: 5,
}

/**
 * The livery, as a mask over the paint, in the seat's colour. It is laid out in
 * the ship's own frame (+X bow, +Y dorsal, Z across), not on any one part, so a
 * band runs on across plates, strakes and a module's housing the way a stripe
 * masked over the assembled model would. Coordinates are in hull units.
 */
const LIVERY_GLSL = `
varying vec3 vShip;
uniform vec3 uLiveryInk;
uniform int uLivery;
float liveryBand(float v, float a, float b) {
  float w = fwidth(v) * 0.75;
  return smoothstep(a - w, a + w, v) * (1.0 - smoothstep(b - w, b + w, v));
}
vec3 livery(vec3 base) {
  vec3 p = vShip;
  float t = 0.0;
  if (uLivery == 1) {
    // The poster's diagonal, at the cards' 32 degrees, with a pinstripe behind it.
    float u = p.x * 0.848 + p.y * 0.530;
    t = liveryBand(u, 2.05, 2.55) + liveryBand(u, 2.66, 2.76);
  } else if (uLivery == 2) {
    t = 1.0 - smoothstep(-0.12 - fwidth(p.y), -0.12 + fwidth(p.y), p.y);
    t = max(t, liveryBand(p.y, -0.05, 0.01));
  } else if (uLivery == 3) {
    float v = p.x - abs(p.z) * 1.1;
    t = liveryBand(v, 2.15, 2.75) + liveryBand(v, 1.8, 1.94);
  } else if (uLivery == 4) {
    t = liveryBand(p.x, -3.45, -3.05) + liveryBand(p.x, -2.95, -2.84);
  } else if (uLivery == 5) {
    t = (1.0 - step(0.36, abs(p.z))) * step(0.72, p.y);
    t = max(t, liveryBand(abs(p.z), 0.44, 0.5) * step(0.72, p.y));
  }
  return mix(base, uLiveryInk, clamp(t, 0.0, 1.0));
}
`
export interface ShipModel {
  root: Group
  mounts: Map<MountId, { frame: Group; module: Group; highlight: Material; labelPosition: Vector3 }>
  engineGlow: Material
  nozzles: Vector3[]
  /** Incremental editor updates; board batches are rebuilt from their visual spec. */
  update: (config: ShipConfig, slots?: VisibleSlots) => void
  dispose: () => void
}

/** A cross section with clipped corners, lofted along the thrust axis. */
function armoredSection(sections: [number, number, number][]): BufferGeometry {
  const rings = sections.map(([x, h, w]) => {
    const c = Math.min(h, w) * 0.35
    return [
      [h, w - c],
      [h - c, w],
      [-h + c, w],
      [-h, w - c],
      [-h, -w + c],
      [-h + c, -w],
      [h - c, -w],
      [h, -w + c],
    ].map(([y, z]) => [x, y, z])
  })
  const vertices: number[] = []
  const tri = (a: number[], b: number[], c: number[]) => vertices.push(...a, ...b, ...c)
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8
      tri(rings[r][i], rings[r + 1][j], rings[r + 1][i])
      tri(rings[r][i], rings[r][j], rings[r + 1][j])
    }
  }
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8
    tri([sections[0][0], 0, 0], rings[0][j], rings[0][i])
    tri([sections.at(-1)![0], 0, 0], rings.at(-1)![i], rings.at(-1)![j])
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.computeVertexNormals()
  return geometry
}

/** Swap two corners of every triangle, so a mirrored part still faces outward. */
function reverseWinding(geometry: BufferGeometry) {
  for (const attribute of Object.values(geometry.attributes)) {
    const { array, itemSize } = attribute
    for (let triangle = 0; triangle < array.length; triangle += itemSize * 3) {
      for (let item = 0; item < itemSize; item++) {
        const a = triangle + item
        const b = triangle + itemSize * 2 + item
        ;[array[a], array[b]] = [array[b], array[a]]
      }
    }
    attribute.needsUpdate = true
  }
}

export function createShip(
  config: ShipConfig,
  concealed = false,
  options: { slots?: VisibleSlots; detail?: 'hero' | 'board' } = {}
): ShipModel {
  const root = new Group()
  root.name = 'modular_corvette'
  root.userData = { units: 'concept units' }
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const boardDetail = options.detail === 'board'
  const resin = config.finish === 'resin'
  function material(color: string, metalness = 0.35, emissive = 0): Material {
    const m = new MeshStandardMaterial({
      color: resin ? '#a1aaa4' : color,
      roughness: resin ? 0.85 : 0.52,
      metalness: resin ? 0 : metalness,
      emissive: resin ? '#000000' : color,
      emissiveIntensity: resin ? 0 : emissive,
    })
    materials.add(m)
    return m
  }
  /**
   * The paint takes the livery. The shader needs the ship's frame, which the
   * board moves every frame, so each painted mesh hands it over just before
   * it draws (`onBeforeRender`): one small matrix copy per plate.
   */
  const livery = {
    uLiveryInk: { value: new Color(config.accent) },
    uLivery: { value: LIVERY_CODE[config.appearance?.livery ?? 'band'] },
    uShip: { value: new Matrix4() },
  }
  const syncLivery = () => livery.uShip.value.copy(root.matrixWorld).invert()
  function takesLivery(m: Material) {
    if (resin) return
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, livery)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vShip;\nuniform mat4 uShip;')
        .replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvShip = (uShip * modelMatrix * vec4(transformed, 1.0)).xyz;'
        )
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${LIVERY_GLSL}`)
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          'vec4 diffuseColor = vec4( livery( diffuse ), opacity );'
        )
    }
    m.customProgramCacheKey = () => 'livery'
  }
  const hull = material(config.paint)
  takesLivery(hull)
  const pale = material(
    config.appearance?.secondaryPaint ??
      new Color(config.paint).lerp(new Color('#ffffff'), 0.2).getStyle()
  )
  const dark = material(HULL_INK.dark, 0.65)
  const steel = material(HULL_INK.steel, 0.75)
  const rubber = material(HULL_INK.rubber, 0.1)
  const copper = material(HULL_INK.copper, 0.72)
  const cyan = material(HULL_INK.cyan, 0.3, 0.7)
  const engineGlow = material(HULL_INK.glow, 0.2, 3.2)
  const red = material(HULL_INK.warn, 0.1, 1)

  const add = (
    parent: Group,
    geometry: BufferGeometry,
    mat: Material,
    pos: Vec3 = [0, 0, 0],
    rot: Vec3 = [0, 0, 0]
  ) => {
    geometries.add(geometry)
    const mesh = new Mesh(geometry, mat)
    if (mat === hull || mat === pale) mesh.onBeforeRender = syncLivery
    mesh.position.set(...pos)
    mesh.rotation.set(...rot)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  const box = (p: Group, size: Vec3, pos: Vec3, mat = hull, rot: Vec3 = [0, 0, 0]) =>
    add(p, new BoxGeometry(...size), mat, pos, rot)
  const plate = (p: Group, size: Vec3, pos: Vec3, mat = hull, rot: Vec3 = [0, 0, 0]) => {
    const [w, h, d] = size
    const c = Math.min(w, d) * 0.17
    const shape = new Shape()
    shape.moveTo(-w / 2 + c, -d / 2)
    shape.lineTo(w / 2 - c, -d / 2)
    shape.lineTo(w / 2, -d / 2 + c)
    shape.lineTo(w / 2, d / 2 - c)
    shape.lineTo(w / 2 - c, d / 2)
    shape.lineTo(-w / 2 + c, d / 2)
    shape.lineTo(-w / 2, d / 2 - c)
    shape.lineTo(-w / 2, -d / 2 + c)
    shape.closePath()
    const bevel = Math.min(w / 4, h / 4, d / 4, 0.035)
    const geo = new ExtrudeGeometry(shape, {
      depth: h - 2 * bevel,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      steps: 1,
    })
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, -h / 2 + bevel, 0)
    return add(p, geo, mat, pos, rot)
  }
  const slab = (
    size: Vec3,
    pos: Vec3,
    mat: Material,
    rot: Vec3 = [0, 0, 0],
    parent: Group = body
  ) => {
    const radius = Math.min(0.018, ...size.map(n => n / 3))
    return add(parent, new RoundedBoxGeometry(...size, 1, radius), mat, pos, rot)
  }
  const cylinder = (
    p: Group,
    r1: number,
    r2: number,
    h: number,
    pos: Vec3,
    mat = steel,
    rot: Vec3 = [0, 0, 0],
    segments = 12
  ) =>
    add(
      p,
      new CylinderGeometry(r1, r2, h, boardDetail ? Math.min(segments, 8) : segments),
      mat,
      pos,
      rot
    )
  const ring = (
    p: Group,
    radius: number,
    tube: number,
    pos: Vec3,
    mat = steel,
    rot: Vec3 = [Math.PI / 2, 0, 0]
  ) =>
    add(
      p,
      new TorusGeometry(radius, tube, boardDetail ? 4 : 5, boardDetail ? 12 : 24),
      mat,
      pos,
      rot
    )
  const pipe = (p: Group, from: Vec3, to: Vec3, radius: number, mat = steel) => {
    const a = new Vector3(...from),
      b = new Vector3(...to)
    const mesh = cylinder(
      p,
      radius,
      radius,
      a.distanceTo(b),
      a.clone().add(b).multiplyScalar(0.5).toArray() as Vec3,
      mat
    )
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.sub(a).normalize())
  }

  const body = new Group()
  body.name = 'hull_fixed_systems'
  body.scale.set(config.length, config.armor, config.beam)
  root.add(body)
  add(
    body,
    armoredSection([
      [-3.25, 0.71, 1.04],
      [-2.6, 0.84, 1.14],
      [1.95, 0.84, 1.14],
      [2.55, 0.76, 1.0],
      [3.04, 0.56, 0.8],
    ]),
    dark
  )
  // The armor: slab plating standing proud of the core, with seams between
  // the tiles. Everything painted on the deck (markings and spine)
  // rides on top of the plate; the bow tile stands lowest, to keep the
  // citadel clear.
  const relief = 0.8
  const deck = 0.05 + relief * 0.33
  const keel = 0.05 + relief * 0.3
  const chine = 0.07 + relief * 0.19
  const deckTop = 0.8 + deck
  // Flat armour laid in rectangles with tight seams, a port and a starboard
  // plate to each tile, rather than one moulded slab: plating that was bolted
  // on, not cast.
  const plateSeam = 0.035
  for (const [x, l, share] of [
    [-2.12, 0.93, 1],
    [-0.98, 1.25, 1],
    [0.43, 1.43, 1],
    [1.68, 0.91, 0.42],
  ] as [number, number, number][]) {
    const step = deck * share
    const length = l - plateSeam
    for (const side of [-1, 1]) {
      const deckWidth = (1.64 - plateSeam * 3) / 2
      slab(
        [length, step, deckWidth],
        [x, 0.8 + step / 2, (side * (deckWidth + plateSeam)) / 2],
        hull
      )
      const keelWidth = (1.6 - plateSeam * 3) / 2
      slab(
        [length, keel, keelWidth],
        [x, -0.79 - keel / 2, (side * (keelWidth + plateSeam)) / 2],
        hull
      )
      slab([length, chine, 0.5], [x, 0.61, side * 0.98], pale, [side * 0.68, 0, 0])
      slab([length, chine * 0.85, 0.42], [x, -0.62, side * 0.98], pale, [-side * 0.65, 0, 0])
    }
  }
  // Command citadel: a recessed slit, armored eyebrow, and forward cheek plates.
  add(
    body,
    armoredSection([
      [1.25, 0.08, 0.58],
      [1.55, 0.3, 0.62],
      [2.6, 0.3, 0.49],
      [3.1, 0.08, 0.42],
    ]),
    pale,
    [0, 0.93, 0]
  )
  box(body, [0.045, 0.14, 0.65], [2.73, 1.14, 0], rubber, [0, 0, 0.36])
  for (const z of [-0.22, 0, 0.22])
    box(body, [0.05, 0.052, 0.14], [2.76, 1.15, z], cyan, [0, 0, 0.36])
  for (const side of [-1, 1]) {
    // Bow armour: two flat blocks stacked on each shoulder, stepping down to
    // the prow, the heaviest plate on the ship where it points at the enemy.
    slab([1.1, 0.26, 0.34], [2.5, 0.72, side * 0.7], pale)
    slab([0.62, 0.2, 0.3], [2.72, 0.95, side * 0.62], hull)
    slab([0.9, 0.3, 0.12], [2.55, 0.1, side * 0.99], pale)
    // The service conduit: it comes forward off the afterbody's run (below)
    // and stops at a junction box short of the aft flank mount, clear of the
    // skin by its own radius, so nothing it passes cuts it.
    pipe(body, [-2.62, 0.3, side * 1.215], [-1.74, 0.3, side * 1.215], 0.055, copper)
    for (const x of [-2.62, -1.74]) box(body, [0.16, 0.2, 0.16], [x, 0.3, side * 1.2], steel)
    box(body, [0.08, 0.14, 0.12], [-2.18, 0.3, side * 1.2], dark)
    // Frames: the hull's ribs stand proud of the skin between the flank mounts,
    // where the loads come in, the way a working hull shows its structure.
    for (const x of [-1.52, 0.47]) {
      box(body, [0.2, 1.0, 0.1], [x, 0, side * 1.19], steel)
      for (const y of [-0.34, 0, 0.34]) box(body, [0.24, 0.06, 0.06], [x, y, side * 1.26], dark)
    }
    // Maneuvering thrusters remain with the hull, regardless of loadout.
    for (const x of [2.7]) {
      plate(body, [0.48, 0.22, 0.38], [x, -0.35, side * (x > 0 ? 0.91 : 1.16)], dark, [
        (side * Math.PI) / 2,
        0,
        0,
      ])
      for (const dx of [-0.12, 0.12])
        cylinder(body, 0.075, 0.09, 0.1, [x + dx, -0.35, side * (x > 0 ? 1.05 : 1.3)], rubber, [
          (side * Math.PI) / 2,
          0,
          0,
        ])
    }
    box(body, [0.17, 0.08, 0.14], [2.11, 0.78, side * 0.88], side < 0 ? red : cyan)
  }
  // The dorsal hardback: a stepped armoured block over the crew spaces, the
  // way a working hull puts its pressure volume under the heaviest plate, with
  // the dorsal airlock on its top step. Nothing up here is ornament: trays for
  // the cable runs, and a grab rail for whoever is out on the hull.
  const hardback = deckTop + 0.2
  plate(body, [2.3, 0.2, 1.06], [-1.28, deckTop + 0.1, 0], pale)
  plate(body, [1.25, 0.14, 0.72], [-1.62, hardback + 0.07, 0], hull)
  const hatchTop = hardback + 0.14
  plate(body, [0.46, 0.03, 0.46], [-1.62, hatchTop + 0.005, 0], dark)
  cylinder(body, 0.16, 0.16, 0.04, [-1.62, hatchTop + 0.02, 0], steel, [0, 0, 0], 20)
  for (const z of [-0.1, 0.1]) box(body, [0.2, 0.03, 0.025], [-1.62, hatchTop + 0.05, z], rubber)
  // Vents along the hardback's forward face.
  for (let i = 0; i < 5; i++)
    box(body, [0.03, 0.12, 0.16], [-0.12, deckTop + 0.1, -0.36 + i * 0.18], rubber)
  for (const side of [-1, 1]) {
    // Cable trays from the hardback to the citadel.
    plate(body, [1.35, 0.05, 0.12], [0.55, deckTop + 0.025, side * 0.2], dark)
    // The forward frame carried over the deck as a hoop, standing clear of
    // the cable trays that run under it.
    box(body, [0.2, 0.14, 0.07], [0.47, deckTop + 0.07, side * 0.8], steel)
  }
  box(body, [0.2, 0.07, 1.67], [0.47, deckTop + 0.175, 0], steel)
  for (const side of [-1, 1]) {
    // A grab rail on stand-offs down each deck edge.
    pipe(
      body,
      [-2.45, deckTop + 0.07, side * 0.72],
      [1.2, deckTop + 0.07, side * 0.72],
      0.018,
      steel
    )
    for (let x = -2.4; x <= 1.2; x += 0.45)
      box(body, [0.03, 0.07, 0.03], [x, deckTop + 0.035, side * 0.72], steel)
    for (let i = 0; i < 6; i++)
      box(body, [0.055, 0.035, 0.3], [0.05 + i * 0.13, deckTop, side * 0.52], rubber)
  }
  // Fixed scoop on the ventral bow.
  plate(body, [1.2, 0.26, 0.92], [2.58, -0.69, 0], steel)
  box(body, [0.11, 0.18, 0.67], [3.16, -0.68, 0], rubber)
  for (const z of [-0.24, -0.08, 0.08, 0.24]) box(body, [0.12, 0.15, 0.03], [3.22, -0.68, z], pale)

  // The afterbody is lofted in world space so it joins both the independently
  // scaled hull and the engine cluster without a step or a floating adapter.
  const driveOrigin = -3.13 * config.length
  const engineScale = config.engineSize
  // The engine block stands taller than the hull it pushes, above the deck line
  // and below the keel, so the drive is the first thing the silhouette says.
  const sternHeight =
    (config.engines === 5 ? 1.28 : config.engines === 1 ? 1.16 : 1.1) * engineScale
  const sternWidth = (config.engines === 1 ? 1.12 : 1.5) * engineScale
  // The block's full section, held from where the flare ends to the thrust
  // plate so the shroud behind it carries on at the same size, not smaller.
  const blockHeight = sternHeight + 0.08 * engineScale
  const blockWidth = sternWidth + 0.03 * engineScale
  const aftSections: [number, number, number][] = [
    [driveOrigin - 0.78 * engineScale, blockHeight, blockWidth],
    [driveOrigin - 0.22 * engineScale, blockHeight, blockWidth],
    [-2.8 * config.length, 0.91 * config.armor, 1.16 * config.beam],
    [-2.35 * config.length, 0.84 * config.armor, 1.14 * config.beam],
  ]
  const afterbody = new Group()
  afterbody.name = 'integrated_aft_hull'
  root.add(afterbody)
  add(afterbody, armoredSection(aftSections), hull)
  const aftProfile = (x: number) => {
    for (let i = 1; i < aftSections.length; i++) {
      if (x <= aftSections[i][0]) {
        const a = aftSections[i - 1],
          b = aftSections[i]
        const t = Math.max(0, (x - a[0]) / (b[0] - a[0]))
        return { height: a[1] + (b[1] - a[1]) * t, width: a[2] + (b[2] - a[2]) * t }
      }
    }
    return { height: aftSections.at(-1)![1], width: aftSections.at(-1)![2] }
  }
  const strake = (from: Vec3, to: Vec3, width: number, thickness: number, mat: Material) => {
    const a = new Vector3(...from),
      b = new Vector3(...to)
    const mesh = plate(
      afterbody,
      [a.distanceTo(b), thickness, width],
      a.clone().add(b).multiplyScalar(0.5).toArray() as Vec3,
      mat
    )
    mesh.quaternion.setFromUnitVectors(new Vector3(1, 0, 0), b.sub(a).normalize())
    return mesh
  }
  const seamX = -2.74 * config.length
  const seam = aftProfile(seamX)
  add(
    afterbody,
    armoredSection([
      [seamX - 0.035, seam.height + 0.027, seam.width + 0.027],
      [seamX + 0.035, seam.height + 0.027, seam.width + 0.027],
    ]),
    dark
  )
  // Everything laid on the afterbody follows its loft station by station,
  // standing off the skin by its own half-thickness: a straight piece across
  // the flare would dip into it between the kinks. A clamp covers each bend.
  const aftStations = [
    -2.62 * config.length,
    -2.8 * config.length,
    driveOrigin - 0.22 * engineScale,
    driveOrigin - 0.76 * engineScale,
  ]
  const run = (at: (x: number) => Vec3, lay: (from: Vec3, to: Vec3) => void) =>
    aftStations.slice(1).forEach((x, i) => lay(at(aftStations[i]), at(x)))
  for (const vertical of [-1, 1]) {
    // Structural armor along the dorsal and ventral centreline onto the thrust bulkhead.
    run(
      x => [x, vertical * (aftProfile(x).height + 0.074), 0],
      (from, to) => strake(from, to, 0.48 * config.beam, 0.14, pale)
    )
    for (const side of [-1, 1]) {
      run(
        x => [x, vertical * 0.46, side * (aftProfile(x).width + 0.099)],
        (from, to) => strake(from, to, 0.19, 0.12, pale)
      )
      run(
        x => [x, vertical * 0.3, side * (aftProfile(x).width + 0.075)],
        (from, to) => pipe(afterbody, from, to, 0.055, copper)
      )
      for (const x of aftStations.slice(1, -1))
        box(
          afterbody,
          [0.12, 0.16, 0.16],
          [x, vertical * 0.3, side * (aftProfile(x).width + 0.06)],
          steel
        )
    }
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const x = driveOrigin + (-0.44 + i * 0.17) * engineScale
      const { height, width } = aftProfile(x)
      box(afterbody, [0.075, height * 0.43, 0.035], [x, 0, side * (width + 0.014)], dark)
    }
  }

  const drive = new Group()
  drive.name = 'fixed_engines'
  drive.position.x = driveOrigin
  drive.scale.setScalar(engineScale)
  root.add(drive)
  // Recessed dark thrust plate and a painted perimeter lip carry the bells.
  add(
    drive,
    armoredSection([
      [-0.825, (sternHeight / engineScale) * 0.92, (sternWidth / engineScale) * 0.94],
      [-0.755, (sternHeight / engineScale) * 0.92, (sternWidth / engineScale) * 0.94],
    ]),
    dark
  )
  for (const y of [-1, 1]) {
    for (const z of [-1, 1]) {
      cylinder(
        drive,
        0.065,
        0.065,
        0.045,
        [-0.85, ((y * sternHeight) / engineScale) * 0.73, ((z * sternWidth) / engineScale) * 0.77],
        steel,
        [0, 0, Math.PI / 2],
        6
      )
    }
  }
  const bell = (y: number, z: number, scale: number) => {
    const g = new Group()
    g.name = `drive_bell_${y}_${z}`
    g.position.set(-0.72, y, z)
    g.scale.setScalar(scale)
    g.rotation.z = Math.PI / 2 // bell +Y points toward the stern (-X).
    drive.add(g)
    add(
      g,
      new LatheGeometry(
        [
          new Vector2(0.39, -0.11),
          new Vector2(0.5, -0.11),
          new Vector2(0.53, 0.09),
          new Vector2(0.48, 0.24),
          new Vector2(0.38, 0.24),
          new Vector2(0.39, -0.11),
        ],
        16
      ),
      steel
    )
    cylinder(g, 0.38, 0.4, 0.7, [0, 0, 0], dark)
    for (const yy of [0.1, 0.3]) ring(g, 0.4, 0.065, [0, yy, 0], steel)
    const points = [
      [0.31, 0.25],
      [0.34, 0.48],
      [0.43, 0.7],
      [0.64, 1.02],
      [0.66, 1.1],
      [0.55, 1.1],
      [0.52, 0.97],
      [0.32, 0.67],
      [0.24, 0.46],
    ]
    const nozzle = new LatheGeometry(
      points.map(([x, y]) => new Vector2(x, y)),
      24
    )
    add(g, nozzle, dark)
    ring(g, 0.615, 0.065, [0, 1.08, 0], steel)
    cylinder(g, 0.26, 0.26, 0.03, [0, 0.55, 0], engineGlow)
    ring(g, 0.4, 0.033, [0, 0.83, 0], cyan)
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      pipe(
        g,
        [Math.cos(a) * 0.4, 0.3, Math.sin(a) * 0.4],
        [Math.cos(a) * 0.57, 0.95, Math.sin(a) * 0.57],
        0.028,
        steel
      )
    }
  }
  if (config.engines === 1) bell(0, 0, 1.28)
  else {
    bell(0, 0, 0.92)
    for (const side of [-1, 1]) bell(0, side * 0.99, 0.63)
    if (config.engines === 5) for (const side of [-1, 1]) bell(side * 0.83, 0, 0.51)
  }

  // The engine room. A shroud carries the hull's own section on past the
  // thrust plate, so the bells sit back inside armour instead of hanging off
  // the stern. Everything that feeds a
  // bell is out where it can be serviced: turbopumps on the roof, their feed
  // lines running forward and down into the block, the flank conduits carried
  // aft into the block, and gimbal rams on every bell.
  const H = blockHeight / engineScale
  const W = blockWidth / engineScale
  const chamfer = Math.min(H, W) * 0.35
  const skin = 0.14
  const shroudFore = -0.8
  const shroudAft = -1.52
  const shroudLength = shroudFore - shroudAft
  const shroudX = (shroudFore + shroudAft) / 2
  for (const s of [-1, 1]) {
    // Roof and floor, the flanks, and a plate across each chamfer.
    slab(
      [shroudLength, skin, (W - chamfer) * 2],
      [shroudX, s * (H - skin / 2), 0],
      hull,
      [0, 0, 0],
      drive
    )
    slab(
      [shroudLength, (H - chamfer) * 2, skin],
      [shroudX, 0, s * (W - skin / 2)],
      pale,
      [0, 0, 0],
      drive
    )
    for (const t of [-1, 1]) {
      const inset = chamfer / 2 + skin * 0.35
      slab(
        [shroudLength, skin, chamfer * Math.SQRT2 + skin * 0.4],
        [shroudX, s * (H - inset), t * (W - inset)],
        dark,
        [s * t * (Math.PI / 4), 0, 0],
        drive
      )
    }
  }
  // Frames round the shroud, where it takes the thrust into the hull.
  for (const x of [shroudFore - 0.08, shroudAft + 0.16]) {
    for (const s of [-1, 1]) {
      box(drive, [0.1, 0.06, (W - chamfer) * 2 + 0.1], [x, s * (H + 0.03), 0], steel)
      box(drive, [0.1, (H - chamfer) * 2 + 0.1, 0.06], [x, 0, s * (W + 0.03)], steel)
    }
  }
  // Gimbal rams: two per bell, from the shroud wall to the bell's collar.
  const rams = (y: number, z: number, scale: number) => {
    const collarX = -0.72 - 0.3 * scale
    for (const s of [-1, 1]) {
      const wall = z === 0 ? H - skin : Math.min(H - skin, 0.6)
      pipe(
        drive,
        [shroudFore - 0.05, s * wall, z],
        [collarX, y + s * 0.38 * scale, z],
        0.035,
        steel
      )
      box(drive, [0.1, 0.06, 0.1], [shroudFore - 0.05, s * (wall - 0.02), z], dark)
    }
  }
  if (config.engines === 1) rams(0, 0, 1.28)
  else {
    rams(0, 0, 0.92)
    for (const side of [-1, 1]) rams(0, side * 0.99, 0.63)
  }
  // Turbopumps on the roof, each with a feed line forward into the block.
  const roof = H + 0.02
  for (const z of [-0.55, 0.55]) {
    const pumpX = -1.05
    cylinder(drive, 0.17, 0.17, 0.52, [pumpX, roof + 0.19, z], dark, [0, 0, Math.PI / 2], 16)
    for (const dx of [-0.2, 0, 0.2])
      ring(drive, 0.175, 0.03, [pumpX + dx, roof + 0.19, z], steel, [0, Math.PI / 2, 0])
    box(drive, [0.3, 0.06, 0.3], [pumpX, roof + 0.03, z], steel)
    cylinder(drive, 0.1, 0.12, 0.14, [pumpX - 0.34, roof + 0.19, z], steel, [0, 0, Math.PI / 2], 16)
    // The feed line runs forward along the roof and turns down into the
    // block through a flange, never out over the lower hull ahead of it.
    const feedX = -0.32
    pipe(drive, [pumpX + 0.26, roof + 0.19, z], [feedX, roof + 0.19, z], 0.05, copper)
    box(drive, [0.13, 0.13, 0.13], [feedX, roof + 0.19, z], steel)
    pipe(drive, [feedX, roof + 0.19, z], [feedX, roof, z], 0.05, copper)
    box(drive, [0.2, 0.04, 0.2], [feedX, roof + 0.01, z], steel)
  }
  // The flank conduits, carried aft along the shroud to a junction on the block.
  for (const y of [-0.3, 0.3])
    for (const z of [-1, 1]) {
      const reach = z * (W + 0.075)
      pipe(drive, [-0.76, y, reach], [shroudAft + 0.3, y, reach], 0.055, copper)
      box(drive, [0.16, 0.18, 0.16], [shroudAft + 0.3, y, z * (W + 0.06)], steel)
    }

  // Same paired magnet spacing and keyed interface on every mount.
  const magnetRadius =
    config.magnetMillimeters / (config.hullMillimeters / (8.5 * config.length)) / 2
  const magnetSpacing = 0.46
  const shoe = (p: Group, y: number, mat: Material, recessed: boolean) => {
    if (boardDetail) return // Mount interfaces are enclosed on assembled board miniatures.
    const shape = new Shape()
    const w = 0.9,
      d = 0.65,
      c = 0.16
    shape.moveTo(-w + c, -d)
    shape.lineTo(w - c, -d)
    shape.lineTo(w, -d + c)
    shape.lineTo(w, d - c)
    shape.lineTo(w - c, d)
    shape.lineTo(0.17, d)
    shape.lineTo(0.17, d - 0.14)
    shape.lineTo(-0.17, d - 0.14)
    shape.lineTo(-0.17, d)
    shape.lineTo(-w + c, d)
    shape.lineTo(-w, d - c)
    shape.lineTo(-w, -d + c)
    shape.closePath()
    for (const x of [-magnetSpacing, magnetSpacing]) {
      const hole = new Path()
      hole.absarc(x, 0, magnetRadius, 0, Math.PI * 2, true)
      shape.holes.push(hole)
    }
    const geo = new ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false, curveSegments: 20 })
    geo.rotateX(-Math.PI / 2)
    add(p, geo, mat, [0, y, 0])
    for (const x of [-magnetSpacing, magnetSpacing]) {
      cylinder(
        p,
        magnetRadius * 0.96,
        magnetRadius * 0.96,
        0.06,
        [x, y + (recessed ? 0.045 : 0.06), 0],
        steel
      )
      if (!resin) box(p, [magnetRadius * 0.6, 0.008, 0.025], [x, y + 0.078, 0], dark)
    }
    // Key at one end prevents a 180-degree reversed module.
    box(p, [0.27, 0.09, 0.1], [0, y + 0.12, -0.55], dark)
  }

  const moduleGeometry = (p: Group, type: SubsystemType) => {
    shoe(p, 0, dark, false)
    plate(p, [1.68, 0.12, 1.14], [0, 0.16, 0], hull)
    switch (type) {
      case 'railgun':
        // The breech is supported by the collar. Ahead of it, keep the channel
        // between the two stout rails open: no enclosing barrel or muzzle box.
        plate(p, [1.12, 0.36, 0.72], [0, 0.36, 0], dark)
        plate(p, [1.22, 0.15, 0.79], [0, 0.28, 0], pale)
        for (const side of [-1, 1]) {
          const rail = add(
            p,
            armoredSection([
              [0.36, 0.24, 0.3],
              [0.66, 0.22, 0.27],
              [1.53, 0.18, 0.23],
              [1.86, 0.175, 0.21],
            ]),
            steel,
            [side * 0.3, 0, 0],
            [0, 0, Math.PI / 2]
          )
          rail.name = `accelerator_rail_${side < 0 ? 'port' : 'starboard'}`
          // A narrow conductor on the inside of each rail traces the open gap.
          pipe(p, [side * 0.098, 0.75, 0], [side * 0.13, 1.73, 0], 0.027, cyan)
          plate(p, [0.42, 0.46, 0.61], [side * 0.3, 0.56, 0], hull)
          // Individual coil jackets and fasteners keep both rails readable.
          for (const y of [0.87, 1.24, 1.61]) {
            const z = y > 1.4 ? -0.23 : -0.26
            plate(p, [0.34, 0.23, 0.06], [side * 0.3, y, z], pale)
            plate(p, [0.085, 0.26, 0.43], [side * (y > 1.4 ? 0.485 : 0.51), y, 0], dark)
            cylinder(
              p,
              0.038,
              0.038,
              0.026,
              [side * 0.3, y, z - 0.038],
              steel,
              [Math.PI / 2, 0, 0],
              6
            )
          }
          pipe(p, [side * 0.54, 0.3, 0.12], [side * 0.5, 1.58, 0.12], 0.036, copper)
          plate(p, [0.35, 0.075, 0.43], [side * 0.3, 1.865, 0], dark)
          box(p, [0.045, 0.012, 0.16], [side * 0.3, 1.908, 0], steel)
        }
        break
      case 'sensor_array': {
        // Four shallow phased-array faces surround protected optical instruments.
        plate(p, [1.35, 0.24, 0.92], [0, 0.36, 0], dark)
        for (const side of [-1, 1]) {
          for (const end of [-1, 1]) {
            const face = new Group()
            face.name = `sensor_array_face_${side}_${end}`
            face.position.set(side * 0.42, 0.53, end * 0.26)
            face.rotation.set(end * 0.28, 0, -side * 0.32)
            p.add(face)
            plate(face, [0.55, 0.07, 0.4], [0, 0, 0], steel)
            plate(face, [0.46, 0.024, 0.32], [0, 0.045, 0], dark)
            for (let row = 0; row < 3; row++)
              for (let column = 0; column < 4; column++)
                box(
                  face,
                  [0.072, 0.012, 0.055],
                  [-0.15 + column * 0.1, 0.064, -0.09 + row * 0.09],
                  copper
                )
          }
        }
        plate(p, [0.32, 0.27, 0.72], [0, 0.58, 0], pale)
        for (const z of [-0.18, 0.18]) {
          cylinder(p, 0.117, 0.14, 0.1, [0, 0.75, z], dark)
          cylinder(p, 0.08, 0.08, 0.016, [0, 0.807, z], cyan)
          ring(p, 0.11, 0.02, [0, 0.8, z], steel)
        }
        // Short, supported interferometer elements instead of a tall mast.
        for (const x of [-0.69, 0.69]) {
          plate(p, [0.1, 0.3, 0.12], [x, 0.46, 0], pale)
          box(p, [0.22, 0.06, 0.1], [x, 0.63, 0], steel)
        }
        break
      }
      case 'missiles': {
        // Actual apertures in a single thick silo block, with short, supported
        // missile noses emerging from all four cells.
        const silo = new Shape()
        silo.moveTo(-0.77, -0.54)
        silo.lineTo(0.77, -0.54)
        silo.lineTo(0.77, 0.54)
        silo.lineTo(-0.77, 0.54)
        silo.closePath()
        for (const x of [-0.37, 0.37])
          for (const z of [-0.25, 0.25]) {
            const opening = new Path()
            opening.absarc(x, z, 0.205, 0, Math.PI * 2, true)
            silo.holes.push(opening)
            cylinder(p, 0.19, 0.19, 0.035, [x, 0.25, z], rubber)
            ring(p, 0.207, 0.035, [x, 0.59, z], steel)
            cylinder(p, 0.135, 0.135, 0.35, [x, 0.48, z], pale)
            cylinder(p, 0.143, 0.143, 0.08, [x, 0.65, z], steel)
            const nose = add(
              p,
              new LatheGeometry(
                [
                  new Vector2(0.135, 0),
                  new Vector2(0.128, 0.08),
                  new Vector2(0.09, 0.19),
                  new Vector2(0.025, 0.29),
                  new Vector2(0, 0.31),
                ],
                12
              ),
              pale,
              [x, 0.66, z]
            )
            nose.name = `warhead_${x < 0 ? 0 : 1}_${z < 0 ? 0 : 1}`
          }
        const wall = new ExtrudeGeometry(silo, {
          depth: 0.36,
          bevelEnabled: false,
          curveSegments: 16,
        })
        wall.rotateX(-Math.PI / 2)
        add(p, wall, hull, [0, 0.22, 0])
        for (const x of [-0.78, 0.78]) plate(p, [0.09, 0.33, 1.06], [x, 0.4, 0], dark)
        break
      }
      case 'laser':
        plate(p, [1.3, 0.26, 0.94], [0, 0.33, 0], pale)
        cylinder(p, 0.32, 0.43, 0.27, [0, 0.55, 0], steel)
        for (const y of [0.47, 0.59]) ring(p, 0.35, 0.06, [0, y, 0], dark)
        cylinder(p, 0.36, 0.34, 0.17, [0, 0.74, 0], dark)
        cylinder(p, 0.25, 0.25, 0.025, [0, 0.838, 0], cyan)
        ring(p, 0.31, 0.045, [0, 0.82, 0], steel)
        for (const x of [-0.53, 0.53]) box(p, [0.14, 0.23, 0.68], [x, 0.45, 0], dark)
        break
      case 'shields':
        plate(p, [1.48, 0.17, 0.97], [0, 0.3, 0], dark)
        pipe(p, [-0.7, 0.4, 0], [0.7, 0.4, 0], 0.09, copper)
        for (const x of [-0.48, 0, 0.48]) {
          const coil = new Group()
          coil.name = `exposed_shield_coil_${x}`
          p.add(coil)
          cylinder(coil, 0.12, 0.17, 0.4, [x, 0.57, 0], steel)
          for (const y of [0.44, 0.58, 0.73]) {
            ring(coil, 0.18, 0.038, [x, y, 0], cyan)
            ring(coil, 0.135, 0.028, [x, y - 0.015, 0], copper)
          }
          cylinder(coil, 0.105, 0.105, 0.04, [x, 0.78, 0], copper)
          cylinder(coil, 0.048, 0.048, 0.018, [x, 0.807, 0], cyan)
        }
        // An open perimeter cage protects the sides while exposing every coil.
        for (const x of [-0.8, 0.8]) plate(p, [0.1, 0.44, 1.0], [x, 0.48, 0], hull)
        for (const z of [-0.47, 0.47]) {
          plate(p, [1.52, 0.15, 0.12], [0, 0.62, z], pale)
        }
        break
      case 'radiator': {
        // Two radiative surfaces run along the hull. Local Z is the ship's
        // vertical axis on side mounts; a shallow cant exposes both broad faces.
        plate(p, [1.65, 0.12, 0.35], [0, 0.3, 0], dark)
        pipe(p, [-0.81, 0.39, 0], [0.81, 0.39, 0], 0.045, copper)
        for (const side of [-1, 1]) {
          const panel = new Group()
          panel.name = `radiator_panel_${side}`
          panel.position.set(0, 0.46, side * 0.39)
          panel.rotation.x = -side * 0.22
          p.add(panel)
          plate(panel, [1.83, 0.055, 0.66], [0, 0, 0], steel)
          plate(panel, [1.7, 0.018, 0.55], [0, 0.037, 0], dark)
          plate(panel, [1.7, 0.018, 0.55], [0, -0.037, 0], dark)
          for (const face of [-1, 1])
            for (let i = 0; i < 9; i++)
              box(panel, [0.015, 0.009, 0.5], [-0.72 + i * 0.18, face * 0.05, 0], steel)
          for (const x of [-0.78, 0.78])
            pipe(p, [x, 0.32, 0], [x, 0.44, side * 0.39], 0.035, copper)
        }
        break
      }
      case 'fuel_compressor': {
        // The compressor sits on the bow hardpoint, whose frame sends local +Y
        // down the nose and local X across it. It holds no fuel of its own
        // (it buys a jump, it is not a tank), so the bow carries the pump and
        // the exchanger that keeps it running: a squat volute mated flat to
        // the nose, a stack of thin fins standing off it on two spacers, and
        // copper from the casing over the stack and back into the hull. It
        // fills the bay sideways rather than reaching past the collar.
        plate(p, [1.1, 0.14, 1.0], [0, 0.29, 0], dark)
        const pump = new Group()
        pump.name = 'compressor_pump'
        p.add(pump)
        cylinder(pump, 0.4, 0.44, 0.26, [0, 0.49, 0], pale, [0, 0, 0], 16)
        // One band around the casing, and the impeller ring capping it.
        ring(pump, 0.425, 0.035, [0, 0.41, 0], dark)
        ring(pump, 0.405, 0.05, [0, 0.595, 0], steel)
        for (const x of [-0.5, 0.5]) box(pump, [0.13, 0.26, 0.44], [x, 0.49, 0], steel)
        const exchanger = new Group()
        exchanger.name = 'compressor_heat_exchanger'
        p.add(exchanger)
        plate(exchanger, [1.22, 0.07, 0.62], [0, 0.665, 0], pale)
        plate(exchanger, [1.08, 0.022, 0.54], [0, 0.715, 0], dark)
        for (let i = 0; i < 11; i++)
          box(exchanger, [0.032, 0.18, 0.58], [-0.5 + i * 0.1, 0.8, 0], steel)
        // Coolant leaves the casing, climbs past the stack, crosses the fins
        // and drops back through the mating face.
        for (const side of [-1, 1]) {
          pipe(p, [side * 0.38, 0.48, 0], [side * 0.58, 0.48, 0], 0.05, copper)
          pipe(p, [side * 0.58, 0.18, 0], [side * 0.58, 0.845, 0], 0.045, copper)
          cylinder(p, 0.075, 0.075, 0.05, [side * 0.58, 0.26, 0], dark, [0, 0, 0], 8)
        }
        pipe(p, [-0.58, 0.845, 0], [0.58, 0.845, 0], 0.042, copper)
        // Pressure telltale on the dorsal lip of the exchanger.
        box(p, [0.22, 0.1, 0.045], [0, 0.665, 0.3], dark)
        cylinder(p, 0.05, 0.05, 0.025, [0, 0.665, 0.33], cyan, [Math.PI / 2, 0, 0], 10)
        break
      }
      case 'ballistic_rack': {
        cylinder(p, 0.47, 0.57, 0.18, [0, 0.3, 0], dark, [0, 0, 0], 16)
        ring(p, 0.44, 0.06, [0, 0.4, 0], steel)
        const traverse = new Group()
        traverse.name = 'pdc_traverse_mount'
        traverse.rotation.y = 0.15
        p.add(traverse)
        for (const z of [-0.39, 0.39]) {
          plate(traverse, [0.66, 0.46, 0.14], [0, 0.57, z], hull)
          cylinder(traverse, 0.17, 0.17, 0.12, [0, 0.63, z * 1.15], steel, [Math.PI / 2, 0, 0])
          cylinder(traverse, 0.075, 0.075, 0.13, [0, 0.63, z * 1.24], steel, [Math.PI / 2, 0, 0], 8)
        }
        const gun = new Group()
        gun.name = 'pdc_elevation_cradle'
        gun.position.y = 0.63
        gun.rotation.z = -0.52
        traverse.add(gun)
        add(
          gun,
          armoredSection([
            [-0.27, 0.23, 0.25],
            [-0.12, 0.32, 0.29],
            [0.21, 0.32, 0.29],
            [0.4, 0.21, 0.23],
          ]),
          pale,
          [0, 0, 0],
          [0, 0, Math.PI / 2]
        )
        plate(gun, [0.16, 0.37, 0.43], [-0.36, 0.07, 0], dark)
        cylinder(gun, 0.18, 0.23, 0.16, [0, 0.41, 0], dark)
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3
          const x = Math.cos(angle) * 0.12,
            z = Math.sin(angle) * 0.12
          cylinder(gun, 0.052, 0.052, 0.4, [x, 0.65, z], steel)
          cylinder(gun, 0.033, 0.033, 0.018, [x, 0.858, z], rubber)
        }
        for (const y of [0.48, 0.79]) ring(gun, 0.178, 0.04, [0, y, 0], dark)
        plate(gun, [0.18, 0.27, 0.2], [0.34, 0.19, 0], dark)
        cylinder(gun, 0.065, 0.065, 0.025, [0.34, 0.335, 0], cyan)
        for (const y of [-0.08, 0.05, 0.18]) box(gun, [0.24, 0.04, 0.025], [0, y, -0.297], dark)
        break
      }
    }
  }

  const armoredCradle = (frame: Group, forward: boolean) => {
    const cradle = new Group()
    cradle.name = forward ? 'armored_bow_collar' : 'armored_equipment_bay'
    frame.add(cradle)
    // Both shoulders take the secondary paint: the scheme reads the same
    // above and below, so a ship seen from under the ring is the same ship.
    if (forward) {
      // A tapered upper/lower collar flows out of the existing bow armor.
      // Its open end protects the breech without bridging across the rails.
      for (const z of [-0.8, 0.8]) {
        add(
          cradle,
          armoredSection([
            [-0.64, 0.8, 0.12],
            [-0.2, 0.98, 0.13],
            [0.32, 0.98, 0.1],
            [0.73, 0.77, 0.075],
          ]),
          pale,
          [0, 0, z],
          [0, 0, Math.PI / 2]
        )
      }
      for (const x of [-1.04, 1.04]) {
        add(
          cradle,
          armoredSection([
            [-0.59, 0.14, 0.6],
            [-0.13, 0.13, 0.64],
            [0.33, 0.1, 0.6],
            [0.73, 0.07, 0.46],
          ]),
          hull,
          [x, 0, 0],
          [0, 0, Math.PI / 2]
        )
      }
    } else {
      // Deeply rooted shoulder armor above and below each module. The clear
      // opening is wider than the shared shoe, including at the shortest hull.
      for (const z of [-0.82, 0.82]) {
        add(
          cradle,
          armoredSection([
            [-0.97, 0.19, 0.075],
            [-0.76, 0.32, 0.135],
            [0.66, 0.32, 0.135],
            [0.97, 0.18, 0.075],
          ]),
          pale,
          [0, 0.08, z]
        )
      }
      for (const x of [-1, 1]) {
        plate(cradle, [0.09, 0.39, 1.35], [x, 0.025, 0], steel)
      }
    }
  }

  const mounts: ShipModel['mounts'] = new Map()
  for (const mount of MOUNTS) {
    const { position, rotation, scale } = mountTransform(config, mount.id)
    const frame = new Group()
    frame.name = `mount_${mount.id}`
    frame.userData.mountId = mount.id
    frame.position.set(...position)
    frame.rotation.set(...rotation)
    // Mirrored, not rotated: three flips the winding for a negative determinant.
    frame.scale.set(...scale)
    root.add(frame)
    plate(frame, [1.95, 0.13, 1.44], [0, -0.06, 0], dark)
    shoe(frame, 0, steel, true)
    const forward = mount.group === 'forward'
    armoredCradle(frame, forward)
    const highlight = material(HULL_INK.steel, 0.4)
    for (const x of [-0.67, 0.67])
      for (const z of [-1, 1]) {
        box(
          frame,
          [0.16, 0.025, 0.05],
          [x, forward ? 0.74 : 0.41, z * (forward ? 0.8 : 0.82)],
          highlight
        )
      }
    const module = new Group()
    module.position.y = 0.12
    frame.add(module)
    mounts.set(mount.id, { frame, module, highlight, labelPosition: new Vector3(0, 0.35, 0.94) })
  }
  const previous = new Map<MountId, string>()
  const damageMaterials = new Map<Material, Material>()
  function update(next: ShipConfig, slots = visibleSlots(next, concealed)) {
    if (!resin) {
      hull.color.set(next.paint)
      pale.color.set(
        next.appearance?.secondaryPaint ?? new Color(next.paint).lerp(new Color('#ffffff'), 0.2)
      )
      livery.uLiveryInk.value.set(next.accent)
      livery.uLivery.value = LIVERY_CODE[next.appearance?.livery ?? 'band']
      // Sprayed enamel over primer: a satin coat with a little tooth, not metal.
      for (const m of [hull, pale]) {
        m.roughness = 0.5
        m.metalness = 0.12
      }
    }
    for (const [id, mount] of mounts) {
      const slot = slots[id]
      const key = JSON.stringify(slot)
      if (previous.get(id) === key) continue
      previous.set(id, key)
      // Dispose only this module's geometry and damage copies. Shared paint
      // materials and the hull are retained across loadout edits.
      mount.module.traverse(object => {
        if (!(object instanceof Mesh)) return
        geometries.delete(object.geometry)
        object.geometry.dispose()
        const mat = object.material as Material
        if (damageMaterials.has(mat)) {
          damageMaterials.delete(mat)
          materials.delete(mat)
          mat.dispose()
        }
      })
      const module = mount.module
      module.clear()
      module.name = `module_${id}_${slot.unknown ? 'concealed' : (slot.type ?? 'empty')}`
      module.userData = { mountId: id, subsystem: slot.unknown ? 'concealed' : slot.type }
      if (slot.unknown) {
        shoe(module, 0, dark, false)
        plate(module, [1.64, 0.34, 1.16], [0, 0.25, 0], hull)
      } else if (slot.type) moduleGeometry(module, slot.type)
      if (slot.broken && !slot.unknown && slot.type) {
        const clones = new Map<Material, Material>()
        module.traverse(object => {
          if (!(object instanceof Mesh)) return
          const original = object.material as Material
          let clone = clones.get(original)
          if (!clone) {
            clone = original.clone()
            clones.set(original, clone)
            materials.add(clone)
            damageMaterials.set(clone, original)
          }
          object.material = clone
        })
        box(module, [0.67, 0.026, 0.12], [0, 0.25, -0.51], red)
      }
    }
    for (const [damaged, original] of damageMaterials) {
      damaged.color.copy(original.color).lerp(new Color('#292a29'), 0.65)
      damaged.emissive.set('#000000')
      damaged.emissiveIntensity = 0
    }
    root.updateMatrixWorld(true)
  }
  update(config, options.slots)
  const nozzles: Vector3[] = []
  root.traverse(object => {
    if (object.name.startsWith('drive_bell_'))
      nozzles.push(object.localToWorld(new Vector3(0, 1.1, 0)))
  })
  if (options.detail === 'board') {
    // Miniatures must retain their paint at board scale under the darker space
    // lighting. A restrained fill is cheaper than a light on every ship.
    for (const mat of [hull, pale, steel]) {
      mat.emissive.copy(mat.color)
      mat.emissiveIntensity = 0.16
    }
    // One mesh per material. Tiny fittings are omitted, leaving the same broad
    // silhouette and public module geometry, with no hidden mounting internals.
    root.updateMatrixWorld(true)
    const batches = new Map<Material, BufferGeometry[]>()
    root.traverse(object => {
      if (!(object instanceof Mesh)) return
      object.geometry.computeBoundingBox()
      const size = object.geometry.boundingBox!.getSize(new Vector3())
      if (Math.max(size.x, size.y, size.z) < 0.16) return
      let geometry = object.geometry.clone()
      geometry.applyMatrix4(object.matrixWorld)
      if (geometry.index) {
        const old = geometry
        geometry = old.toNonIndexed()
        old.dispose()
      }
      // Baking a mirrored mount into world space reverses its triangles; the
      // renderer's own flip is gone once the mesh becomes part of a batch.
      if (object.matrixWorld.determinant() < 0) reverseWinding(geometry)
      const mat = object.material as Material
      if (!mat.map) geometry.deleteAttribute('uv')
      const bucket = batches.get(mat) ?? []
      bucket.push(geometry)
      batches.set(mat, bucket)
    })
    root.clear()
    for (const [mat, batch] of batches) {
      const geometry = mergeGeometries(batch)
      batch.forEach(g => g.dispose())
      if (geometry) add(root, geometry, mat)
    }
    // The retained merged geometry owns the board model; discard source meshes.
    mounts.clear()
    const retained = new Set(root.children.filter(o => o instanceof Mesh).map(o => o.geometry))
    for (const geometry of geometries)
      if (!retained.has(geometry)) {
        geometry.dispose()
        geometries.delete(geometry)
      }
  }
  root.updateMatrixWorld(true)
  return {
    root,
    mounts,
    engineGlow,
    nozzles,
    update,
    dispose: () => {
      geometries.forEach(g => g.dispose())
      materials.forEach(m => m.dispose())
    },
  }
}

export function poseShip(model: ShipModel, exploded: number, selected: MountId | null) {
  for (const [id, mount] of model.mounts) {
    mount.module.position.y = 0.12 + exploded * 2.2
    mount.highlight.color.set(id === selected ? HULL_INK.warn : HULL_INK.steel)
    mount.highlight.emissive.set(id === selected ? HULL_INK.warn : '#000000')
    mount.highlight.emissiveIntensity = id === selected ? 0.8 : 0
  }
  model.root.updateMatrixWorld(true)
}
