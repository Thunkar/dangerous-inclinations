/**
 * The shared modular corvette display model. +X is the bow, +Y is dorsal, port is -Z.
 * All mount-local modules point along +Y and share one keyed magnetic shoe.
 * Named groups are deliberately a clean seam for eventual authored glTF parts.
 * These intersecting display meshes are NOT manufacturing solids.
 */
import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Path,
  Shape,
  Vector3,
  Vector4,
} from 'three'
import type { Livery, SubsystemType } from '@dangerous-inclinations/engine'
import { MOUNTS, mountTransform, type MountId, type Vec3, type ShipConfig } from './config'
import { HULL_INK } from './palette'

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { visibleSlots, type VisibleSlots } from './visual'
import { armoredSection } from './loft'
import { HULL_INFO } from './hulls'
import { buildShrike } from './shrike'
import { buildMantis } from './mantis'
import { boxSolid, cylinderSolid, delavalBells, extrudeSolid, torusSolid } from './parts'
import { bake, describe } from './solid'
import { CORVETTE } from './corvetteShape'
import { BELL_LENGTH, bellRadius } from './bell'
import { MODULE_BUILDS, type ModuleKit } from './modules'

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
// Where each pattern sits on this hull: the band's (x, y) shift, the
// chevron's and the stern band's x shifts; the split line's and the spine's
// y shifts, how much of the beam the chevron counts, and how far off the
// centreline the spine runs (a hull with two arms gives each its own).
uniform vec4 uLiveryAt;
uniform vec4 uLiveryAt2;
float liveryBand(float v, float a, float b) {
  float w = fwidth(v) * 0.75;
  return smoothstep(a - w, a + w, v) * (1.0 - smoothstep(b - w, b + w, v));
}
vec3 livery(vec3 base) {
  vec3 p = vShip;
  float t = 0.0;
  if (uLivery == 1) {
    // The poster's diagonal, at the cards' 32 degrees, with a pinstripe behind it.
    float u = (p.x + uLiveryAt.x) * 0.848 + (p.y + uLiveryAt.y) * 0.530;
    t = liveryBand(u, 2.05, 2.55) + liveryBand(u, 2.66, 2.76);
  } else if (uLivery == 2) {
    float y = p.y + uLiveryAt2.x;
    t = 1.0 - smoothstep(-0.12 - fwidth(y), -0.12 + fwidth(y), y);
    t = max(t, liveryBand(y, -0.05, 0.01));
  } else if (uLivery == 3) {
    float v = p.x + uLiveryAt.z - abs(p.z) * uLiveryAt2.z * 1.1;
    t = liveryBand(v, 2.15, 2.75) + liveryBand(v, 1.8, 1.94);
  } else if (uLivery == 4) {
    float x = p.x + uLiveryAt.w;
    t = liveryBand(x, -3.45, -3.05) + liveryBand(x, -2.95, -2.84);
  } else if (uLivery == 5) {
    float y = p.y + uLiveryAt2.y;
    float z = abs(abs(p.z) - uLiveryAt2.w);
    t = (1.0 - step(0.36, z)) * step(0.72, y);
    t = max(t, liveryBand(z, 0.44, 0.5) * step(0.72, y));
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
  /** `name` is the paint the print takes (`solid.ts`). */
  function material(name: string, color: string, metalness = 0.35, emissive = 0): Material {
    const m = new MeshStandardMaterial({
      name,
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
    uLiveryAt: { value: new Vector4() },
    uLiveryAt2: { value: new Vector4() },
  }
  // The livery is laid out in corvette units; each hull says where on it each
  // pattern lands.
  const hullKind = config.appearance?.hull ?? 'corvette'
  const at = HULL_INFO[hullKind].livery
  livery.uLiveryAt.value.set(at.band[0], at.band[1], at.chevron, at.stern)
  livery.uLiveryAt2.value.set(at.split, at.spine, at.beam, at.spineZ)
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
  const hull = material('hull', config.paint)
  takesLivery(hull)
  const pale = material(
    'pale',
    config.appearance?.secondaryPaint ??
      new Color(config.paint).lerp(new Color('#ffffff'), 0.2).getStyle()
  )
  const dark = material('dark', HULL_INK.dark, 0.65)
  const steel = material('steel', HULL_INK.steel, 0.75)
  const rubber = material('rubber', HULL_INK.rubber, 0.1)
  const copper = material('copper', HULL_INK.copper, 0.72)
  const cyan = material('cyan', HULL_INK.cyan, 0.3, 0.7)
  const engineGlow = material('glow', HULL_INK.glow, 0.2, 3.2)
  const red = material('red', HULL_INK.warn, 0.1, 1)

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
    add(p, boxSolid(size), mat, pos, rot)
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
    const geo = extrudeSolid(shape, {
      depth: h - 2 * bevel,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      steps: 1,
    })
    bake(geo, new Matrix4().makeRotationX(-Math.PI / 2))
    bake(geo, new Matrix4().makeTranslation(0, -h / 2 + bevel, 0))
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
    return add(parent, boxSolid(size, radius), mat, pos, rot)
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
    add(p, cylinderSolid(r1, r2, h, boardDetail ? Math.min(segments, 8) : segments), mat, pos, rot)
  const ring = (
    p: Group,
    radius: number,
    tube: number,
    pos: Vec3,
    mat = steel,
    rot: Vec3 = [Math.PI / 2, 0, 0]
  ) => add(p, torusSolid(radius, tube, boardDetail ? 4 : 5, boardDetail ? 12 : 24), mat, pos, rot)
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
  // Faceted solids for machinery that must not read round. Both put a flat
  // face toward +X (and toward every axis for 4 or 8 sides); `radius` is to
  // the corners.
  /**
   * A regular polygon lofted along Y, with the plates' chamfered edges; a
   * `hole` radius cuts the same polygon through it, making a collar.
   */
  const prism = (
    p: Group,
    sides: number,
    radius: number,
    h: number,
    pos: Vec3,
    mat = steel,
    rot: Vec3 = [0, 0, 0],
    hole = 0
  ) => {
    const bevel = Math.min(radius / 4, h / 4, hole ? (radius - hole) / 4 : 1, 0.03)
    const polygon = (path: Shape | Path, r: number) => {
      for (let i = 0; i < sides; i++) {
        const a = Math.PI / sides + (i * 2 * Math.PI) / sides
        if (i === 0) path.moveTo(Math.cos(a) * r, Math.sin(a) * r)
        else path.lineTo(Math.cos(a) * r, Math.sin(a) * r)
      }
      path.closePath()
    }
    const shape = new Shape()
    polygon(shape, radius - bevel)
    if (hole) {
      const cut = new Path()
      polygon(cut, hole + bevel)
      shape.holes.push(cut)
    }
    const geo = extrudeSolid(shape, {
      depth: h - 2 * bevel,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      steps: 1,
    })
    bake(geo, new Matrix4().makeRotationX(-Math.PI / 2))
    bake(geo, new Matrix4().makeTranslation(0, -h / 2 + bevel, 0))
    return add(p, geo, mat, pos, rot)
  }
  /** A flat-shaded tapered polygon along Y: a pyramid when the top radius is 0. */
  const frustum = (
    p: Group,
    sides: number,
    bottom: number,
    top: number,
    h: number,
    pos: Vec3,
    mat = steel,
    rot: Vec3 = [0, 0, 0]
  ) => {
    const thetaStart = Math.PI / 2 + Math.PI / sides
    const smooth = new CylinderGeometry(top, bottom, h, sides, 1, false, thetaStart)
    const geo = smooth.toNonIndexed()
    smooth.dispose()
    geo.computeVertexNormals()
    describe(geo, { kind: 'cylinder', top, bottom, height: h, sides, thetaStart })
    return add(p, geo, mat, pos, rot)
  }
  /** A flat plate cut to a profile in the XY plane, `thickness` deep across Z. */
  const fin = (
    p: Group,
    points: [number, number][],
    thickness: number,
    mat: Material,
    rot: Vec3 = [0, 0, 0]
  ) => {
    const shape = new Shape()
    shape.moveTo(...points[0])
    for (const point of points.slice(1)) shape.lineTo(...point)
    shape.closePath()
    const geo = extrudeSolid(shape, { depth: thickness, bevelEnabled: false })
    bake(geo, new Matrix4().makeTranslation(0, 0, -thickness / 2))
    return add(p, geo, mat, [0, 0, 0], rot)
  }

  const body = new Group()
  body.name = 'hull_fixed_systems'
  root.add(body)
  if (hullKind === 'shrike')
    buildShrike(
      body,
      (geometry, mat, pos, rot, parent = body) => add(parent as Group, geometry, mat, pos, rot),
      {
        hull,
        pale,
        dark,
        steel,
        copper,
        cyan,
        red,
      }
    )
  else if (hullKind === 'mantis')
    buildMantis(
      body,
      (geometry, mat, pos, rot, parent = body) => add(parent as Group, geometry, mat, pos, rot),
      { hull, pale, dark, steel, rubber, copper, cyan, red }
    )
  else {
    body.scale.set(config.length, config.armor, config.beam)
    add(body, armoredSection(CORVETTE.core.map(station => [...station])), dark)
    // The armor: slab plating standing proud of the core, with seams between
    // the tiles. Everything painted on the deck (markings and spine)
    // rides on top of the plate; the bow tile stands lowest, to keep the
    // citadel clear.
    const relief = CORVETTE.armor.relief
    const deck = 0.05 + relief * 0.33
    const keel = 0.05 + relief * 0.3
    const chine = 0.07 + relief * 0.19
    const deckTop = CORVETTE.armor.deckY + deck
    // Flat armour laid in rectangles with tight seams, a port and a starboard
    // plate to each tile, rather than one moulded slab: plating that was bolted
    // on, not cast.
    const plateSeam = CORVETTE.armor.seam
    for (const [x, l, share] of CORVETTE.armor.tiles) {
      const step = deck * share
      const length = l - plateSeam
      for (const side of [-1, 1]) {
        const deckWidth = (CORVETTE.armor.deckWidth - plateSeam * 3) / 2
        slab(
          [length, step, deckWidth],
          [x, CORVETTE.armor.deckY + step / 2, (side * (deckWidth + plateSeam)) / 2],
          hull
        )
        const keelWidth = (CORVETTE.armor.keelWidth - plateSeam * 3) / 2
        slab(
          [length, keel, keelWidth],
          [x, CORVETTE.armor.keelY - keel / 2, (side * (keelWidth + plateSeam)) / 2],
          hull
        )
        slab([length, chine, 0.5], [x, 0.61, side * 0.98], pale, [side * 0.68, 0, 0])
        // The ventral chine lies at the chamfer's own 45 degrees, so the hull
        // has no shelf underneath when it stands on its keel.
        slab([length, chine * 0.85, 0.42], [x, -0.62, side * 0.98], pale, [
          -side * (Math.PI / 4),
          0,
          0,
        ])
      }
    }
    // The keel runs on aft under the afterbody to the drive block, so the
    // whole ship sits on one flat plane of plating.
    {
      const keelWidth = (CORVETTE.armor.keelWidth - plateSeam * 3) / 2
      const [x0, l0] = CORVETTE.armor.tiles[0]
      const fore = x0 - l0 / 2 - plateSeam
      const aft =
        (CORVETTE.drive.origin * config.length + CORVETTE.drive.block[1] * config.engineSize) /
        config.length
      for (const side of [-1, 1])
        slab(
          [fore - aft, keel, keelWidth],
          [(fore + aft) / 2, CORVETTE.armor.keelY - keel / 2, (side * (keelWidth + plateSeam)) / 2],
          hull
        )
    }
    // Command citadel: a recessed slit, armored eyebrow, and forward cheek plates.
    add(body, armoredSection(CORVETTE.citadel.stations.map(station => [...station])), pale, [
      0,
      CORVETTE.citadel.lift,
      0,
    ])
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
    // the cable runs, and grip strips for whoever is out on the hull.
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
      for (let i = 0; i < 6; i++)
        box(body, [0.055, 0.035, 0.3], [0.05 + i * 0.13, deckTop, side * 0.52], rubber)
    }
    // Fixed scoop on the ventral bow.
    plate(body, [...CORVETTE.scoop.size], [...CORVETTE.scoop.at], steel)
    box(body, [0.11, 0.18, 0.67], [3.16, -0.68, 0], rubber)
    for (const z of [-0.24, -0.08, 0.08, 0.24])
      box(body, [0.12, 0.15, 0.03], [3.22, -0.68, z], pale)

    // The afterbody is lofted in world space so it joins both the independently
    // scaled hull and the engine cluster without a step or a floating adapter.
    const driveOrigin = CORVETTE.drive.origin * config.length
    const engineScale = config.engineSize
    // The engine block stands taller than the hull it pushes, above the deck line
    // and below the keel, so the drive is the first thing the silhouette says.
    const sternHeight = CORVETTE.drive.sternHeight[config.engines] * engineScale
    const sternWidth = CORVETTE.drive.sternWidth[config.engines] * engineScale
    // The block's full section, held from where the flare ends to the thrust
    // plate so the shroud behind it carries on at the same size, not smaller.
    const [blockFore, blockAft] = CORVETTE.drive.block
    const blockHeight = sternHeight + CORVETTE.drive.blockAdds[0] * engineScale
    const blockWidth = sternWidth + CORVETTE.drive.blockAdds[1] * engineScale
    // The drive rides up off the hull's axis until the block's underside lies
    // on the plane the ship stands on (`CORVETTE.bed`, the bays' undersides),
    // so nothing of the drive is below it; the afterbody eases up from the
    // core to meet it.
    const bed = CORVETTE.bed
    const driveLift = Math.max(0, blockHeight + bed)
    const aftSections: [number, number, number, number][] = [
      [driveOrigin + blockFore * engineScale, blockHeight, blockWidth, driveLift],
      [driveOrigin + blockAft * engineScale, blockHeight, blockWidth, driveLift],
      ...CORVETTE.afterbody.joins.map(([x, h, w]): [number, number, number, number] => [
        x * config.length,
        h * config.armor,
        w * config.beam,
        0,
      ]),
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
          return {
            height: a[1] + (b[1] - a[1]) * t,
            width: a[2] + (b[2] - a[2]) * t,
            lift: a[3] + (b[3] - a[3]) * t,
          }
        }
      }
      const [, height, width, lift] = aftSections.at(-1)!
      return { height, width, lift }
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
        [seamX - 0.035, seam.height + 0.027, seam.width + 0.027, seam.lift],
        [seamX + 0.035, seam.height + 0.027, seam.width + 0.027, seam.lift],
      ]),
      dark
    )
    // Everything laid on the afterbody follows its loft station by station,
    // standing off the skin by its own half-thickness: a straight piece across
    // the flare would dip into it between the kinks. A clamp covers each bend.
    const aftStations = [
      -2.62 * config.length,
      CORVETTE.afterbody.joins[0][0] * config.length,
      driveOrigin + blockAft * engineScale,
      driveOrigin - 0.76 * engineScale,
    ]
    const run = (at: (x: number) => Vec3, lay: (from: Vec3, to: Vec3) => void) =>
      aftStations.slice(1).forEach((x, i) => lay(at(aftStations[i]), at(x)))
    for (const vertical of [-1, 1]) {
      // Structural armor along the dorsal and ventral centreline onto the thrust bulkhead.
      // The ventral one stops at the bed.
      run(
        x => [
          x,
          Math.max(
            vertical * (aftProfile(x).height + 0.074) + aftProfile(x).lift,
            vertical < 0 ? bed + 0.07 : -Infinity
          ),
          0,
        ],
        (from, to) => strake(from, to, 0.48 * config.beam, 0.14, pale)
      )
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const x = driveOrigin + (-0.44 + i * 0.17) * engineScale
        const { height, width, lift } = aftProfile(x)
        box(afterbody, [0.075, height * 0.43, 0.035], [x, lift, side * (width + 0.014)], dark)
      }
    }

    const drive = new Group()
    drive.name = 'fixed_engines'
    drive.position.set(driveOrigin, driveLift, 0)
    drive.scale.setScalar(engineScale)
    root.add(drive)
    // Recessed dark thrust plate and a painted perimeter lip carry the bells.
    add(
      drive,
      armoredSection([
        [
          CORVETTE.drive.thrustPlate,
          (sternHeight / engineScale) * 0.92,
          (sternWidth / engineScale) * 0.94,
        ],
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
          [
            -0.85,
            ((y * sternHeight) / engineScale) * 0.73,
            ((z * sternWidth) / engineScale) * 0.77,
          ],
          steel,
          [0, 0, Math.PI / 2],
          6
        )
      }
    }
    // The bells: the yard's de Laval nozzles (`parts.ts`), as on every hull,
    // each with its gimbal pair off the thrust plate.
    delavalBells(
      (geometry, mat, pos, rot, parent = drive) => add(parent as Group, geometry, mat, pos, rot),
      { dark, steel, cyan },
      drive,
      CORVETTE.drive.thrustPlate,
      CORVETTE.bells[config.engines]
    )

    // The engine room. A shroud carries the hull's own section on past the
    // thrust plate, so the bells sit back inside armour instead of hanging off
    // the stern. Everything that feeds a
    // bell is out where it can be serviced: turbopumps on the roof, their feed
    // lines running forward and down into the block, and the flank conduits
    // carried aft into the block.
    const H = blockHeight / engineScale
    const W = blockWidth / engineScale
    const chamfer = Math.min(H, W) * 0.35
    const { fore: shroudFore, aft: shroudAft, skin } = CORVETTE.drive.shroud
    const shroudLength = shroudFore - shroudAft
    const shroudX = (shroudFore + shroudAft) / 2
    // The roof's inside slopes down to the thrust plate as steeply as the
    // bells hung under it allow, up to 45 degrees, so the hull prints belly
    // down with no ceiling over the bay: each bell's chamber (where its print
    // plugs in) and its outside stay clear of the slope.
    const ceiling = H - skin
    const clearOf = (x: number) =>
      Math.max(
        -Infinity,
        ...CORVETTE.bells[config.engines].map(([y, , scale]) => {
          const d = (CORVETTE.drive.thrustPlate + 0.09 - x) / scale
          if (d < -0.12 || d > BELL_LENGTH) return -Infinity
          const outside = bellRadius(d)
          return y + (d <= 0.58 ? Math.max(0.3, outside) : outside) * scale + 0.03
        })
      )
    let drop = shroudLength
    for (let i = 0; i < 24; i++) {
      const x = shroudFore - (shroudLength * i) / 24
      const above = ceiling - (drop * (x - shroudAft)) / shroudLength
      if (above < clearOf(x))
        drop = Math.max(0, ((ceiling - clearOf(x)) * shroudLength) / (x - shroudAft))
    }
    fin(
      drive,
      [
        [shroudAft, H],
        [shroudFore, H],
        [shroudFore, ceiling - drop],
        [shroudAft, ceiling],
      ],
      (W - chamfer) * 2,
      hull
    )
    for (const s of [-1, 1]) {
      // The floor, the flanks, and a plate across each chamfer.
      if (s < 0)
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
          // The lower plates sit a hair higher, so their corners stay above the keel plane.
          [shroudX, s * (H - inset) + (s < 0 ? 0.025 : 0), t * (W - inset)],
          dark,
          [s * t * (Math.PI / 4), 0, 0],
          drive
        )
      }
    }
    // Frames round the shroud, where it takes the thrust into the hull.
    for (const x of [shroudFore - 0.08, shroudAft + 0.16]) {
      for (const s of [-1, 1]) {
        // The ventral bar is let into the shroud's floor, a hair above the keel plane.
        box(
          drive,
          [0.1, 0.06, (W - chamfer) * 2 + 0.1],
          [x, s < 0 ? -H + 0.04 : H + 0.03, 0],
          steel
        )
        box(drive, [0.1, (H - chamfer) * 2 + 0.1, 0.06], [x, 0, s * (W + 0.03)], steel)
      }
    }
    // Turbopumps on the roof, each with a feed line forward into the block.
    const roof = H + 0.02
    for (const z of [-0.55, 0.55]) {
      const pumpX = -1.05
      cylinder(drive, 0.17, 0.17, 0.52, [pumpX, roof + 0.19, z], dark, [0, 0, Math.PI / 2], 16)
      for (const dx of [-0.2, 0, 0.2])
        ring(drive, 0.175, 0.03, [pumpX + dx, roof + 0.19, z], steel, [0, Math.PI / 2, 0])
      box(drive, [0.3, 0.06, 0.3], [pumpX, roof + 0.03, z], steel)
      cylinder(
        drive,
        0.1,
        0.12,
        0.14,
        [pumpX - 0.34, roof + 0.19, z],
        steel,
        [0, 0, Math.PI / 2],
        16
      )
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
  }

  // Same paired magnet spacing and keyed interface on every mount.
  const magnetRadius =
    config.magnetMillimeters / (config.hullMillimeters / (8.5 * config.length)) / 2
  const magnetSpacing = 0.46
  const shoe = (p: Group, y: number, mat: Material, recessed: boolean) => {
    if (boardDetail) return // Mount interfaces are enclosed on assembled board miniatures.
    const shape = new Shape()
    const w = 0.9,
      d = 0.42,
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
    const geo = extrudeSolid(shape, { depth: 0.12, bevelEnabled: false, curveSegments: 20 })
    bake(geo, new Matrix4().makeRotationX(-Math.PI / 2))
    const meshes = [add(p, geo, mat, [0, y, 0])]
    for (const x of [-magnetSpacing, magnetSpacing]) {
      meshes.push(
        cylinder(
          p,
          magnetRadius * 0.96,
          magnetRadius * 0.96,
          0.06,
          [x, y + (recessed ? 0.045 : 0.06), 0],
          steel
        )
      )
      if (!resin) meshes.push(box(p, [magnetRadius * 0.6, 0.008, 0.025], [x, y + 0.078, 0], dark))
    }
    // Key at one end prevents a 180-degree reversed module.
    meshes.push(box(p, [0.27, 0.09, 0.1], [0, y + 0.12, -d + 0.1], dark))
    for (const mesh of meshes) mesh.name = 'mount_shoe'
  }

  const kit: ModuleKit = {
    add,
    box,
    plate,
    cylinder,
    ring,
    pipe,
    prism,
    frustum,
    fin,
    m: { hull, pale, dark, steel, rubber, copper, cyan, red },
  }
  const moduleGeometry = (p: Group, type: SubsystemType, forward: boolean) => {
    shoe(p, 0, dark, false)
    plate(p, [1.68, 0.12, 1.0], [0, 0.16, 0], hull)
    const build = MODULE_BUILDS[type]
    if (build) return build(kit, p, forward)
    switch (type) {
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
        break
      }
      case 'disruptor': {
        // An emitter, not a gun, and the same module in every mount: a low
        // faceted housing laid along the plate in a saddle that fills the
        // bay, with a finned capacitor block at its after end, two clamped
        // coils, armour panels and an aiming box, and at its fore end a squat
        // hex emitter head facing outboard: a recessed array of cyan cells in
        // a steel collar crowned with stubby electrode studs, braced by short
        // radiator vanes. No barrel: the burst goes out all round.
        const emitter = new Group()
        emitter.name = 'disruptor_emitter'
        p.add(emitter)
        emitter.position.y = 0.28
        // The saddle: a plinth across the bay and two chamfered cheeks the
        // capacitor and the coils lie between, ramping away before the head.
        plate(p, [1.64, 0.08, 1.06], [0, 0.26, 0], dark)
        for (const side of [-1, 1]) {
          add(
            p,
            armoredSection([
              [-0.84, 0.12, 0.13, 0.34],
              [0, 0.12, 0.13, 0.34],
              [0.28, 0.03, 0.1, 0.25],
            ]),
            pale,
            [0, 0, side * 0.42]
          )
          // Gussets from the cheeks up the housing's flanks.
          for (const x of [-0.08, 0.06])
            fin(
              p,
              [
                [0.16, 0.44],
                [0.36, 0.44],
                [0.19, 0.61],
              ],
              0.06,
              steel,
              [0, (-side * Math.PI) / 2, 0]
            ).position.x = x
          // Feet tying each coil clamp down to the cheek, bolted through.
          for (const x of [-0.36, -0.22]) {
            box(p, [0.07, 0.1, 0.15], [x, 0.49, side * 0.315], steel)
            prism(p, 6, 0.035, 0.03, [x, 0.555, side * 0.35], dark)
          }
          // The junction box on the cheek, its conduits into the capacitor.
          plate(p, [0.28, 0.16, 0.2], [-0.66, 0.53, side * 0.43], dark)
          box(p, [0.08, 0.03, 0.06], [-0.6, 0.62, side * 0.45], cyan)
          for (const x of [-0.74, -0.6])
            pipe(p, [x, 0.58, side * 0.34], [x, 0.58, side * 0.24], 0.028, copper)
        }
        // The housing's own frame: +X fore along the plate, +Y off its belly.
        const housing: Vec3[] = [
          [-0.48, 0.16, 0.2],
          [0.36, 0.145, 0.18],
        ]
        const across = (x: number) => {
          const [[x0, h0, w0], [x1, h1, w1]] = housing
          const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)))
          return [h0 + (h1 - h0) * t, w0 + (w1 - w0) * t]
        }
        const top = (x: number) => 2 * across(x)[0]
        const flat = (x: number, h: number, w: number): [number, number, number, number] => [
          x,
          h,
          w,
          h,
        ]
        add(emitter, armoredSection([flat(-0.84, 0.2, 0.25), flat(-0.44, 0.2, 0.25)]), dark)
        add(emitter, armoredSection(housing.map(([x, h, w]) => flat(x, h, w))), hull)
        // Two heavy clamp collars round the coils just ahead of the capacitor,
        // each with a dark coil showing through a slot in its face.
        for (const x of [-0.36, -0.22]) {
          const [h, w] = across(x)
          add(
            emitter,
            armoredSection([
              flat(x - 0.12, h - 0.005, w - 0.005),
              flat(x - 0.03, h + 0.045, w + 0.045),
              flat(x + 0.03, h + 0.045, w + 0.045),
            ]),
            steel
          )
          box(emitter, [0.03, 0.03, 0.16], [x, 2 * h + 0.095, 0], dark)
        }
        // Two armour panels on the spine with a break between them.
        for (const stations of [
          [-0.12, -0.07, 0.11, 0.14],
          [0.18, 0.23, 0.3, 0.34],
        ]) {
          const last = stations.length - 1
          add(
            emitter,
            armoredSection(
              stations.map((x, i): [number, number, number, number] =>
                i === 0
                  ? [x, 0.006, 0.1, top(x)]
                  : i === last
                    ? [x, 0.01, 0.1, top(x) + 0.005]
                    : [x, 0.025, 0.14, top(x) + 0.02]
              )
            ),
            pale
          )
        }
        // The aiming box on the after panel.
        fin(
          emitter,
          [
            [-0.04, 0.33],
            [0.12, 0.33],
            [0.12, 0.42],
            [0.05, 0.42],
          ],
          0.12,
          steel
        )
        box(emitter, [0.03, 0.04, 0.07], [0.13, 0.385, 0], cyan)
        // The capacitor: a row of cooling fins on top, slats down its flanks.
        for (const z of [-0.165, -0.055, 0.055, 0.165])
          fin(
            emitter,
            [
              [-0.82, 0.37],
              [-0.48, 0.37],
              [-0.48, 0.46],
              [-0.72, 0.46],
            ],
            0.06,
            steel
          ).position.z = z
        const [, aft] = across(-0.4),
          [, fore] = across(0.3)
        for (const side of [-1, 1]) {
          for (let i = 0; i < 5; i++)
            box(emitter, [0.035, 0.13, 0.03], [-0.78 + i * 0.07, 0.2, side * 0.255], steel)
          // A cyan conduit down each flank from the coils to the head.
          box(emitter, [0.7, 0.035, 0.03], [-0.05, 0.22, side * ((aft + fore) / 2 + 0.008)], cyan, [
            0,
            side * Math.atan((aft - fore) / 0.7),
            0,
          ])
        }
        // The head: a hex block, cyan slits in its forward faces, short
        // radiator vanes at its corners, and on top a steel collar round a
        // recessed array of cyan cells, crowned with electrode studs.
        const head = new Group()
        head.name = 'disruptor_head'
        head.position.x = 0.54
        emitter.add(head)
        prism(head, 6, 0.25, 0.34, [0, 0.17, 0], dark)
        for (const angle of [-Math.PI / 3, 0, Math.PI / 3]) {
          const face = new Group()
          face.rotation.y = angle
          head.add(face)
          box(face, [0.03, 0.18, 0.07], [0.222, 0.17, 0], cyan)
        }
        for (const angle of [-90, -30, 30, 90])
          fin(
            head,
            [
              [0.18, 0],
              [0.32, 0],
              [0.32, 0.1],
              [0.18, 0.24],
            ],
            0.06,
            steel,
            [0, (angle * Math.PI) / 180, 0]
          )
        prism(head, 6, 0.27, 0.06, [0, 0.37, 0], steel, [0, 0, 0], 0.19)
        prism(head, 6, 0.2, 0.04, [0, 0.35, 0], dark)
        for (let i = -1; i < 6; i++) {
          const a = (i * Math.PI) / 3
          const r = i < 0 ? 0 : 0.11
          prism(head, 6, 0.055, 0.03, [Math.cos(a) * r, 0.385, -Math.sin(a) * r], cyan)
        }
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + (i * Math.PI) / 3
          const [x, z] = [Math.cos(a) * 0.23, -Math.sin(a) * 0.23]
          prism(head, 6, 0.04, 0.09, [x, 0.445, z], steel)
          prism(head, 6, 0.03, 0.03, [x, 0.505, z], cyan)
        }
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
      // Shoulder armour above and below each module: a straight outboard
      // edge and a flat face to the bay, its ends bevelled at 45 degrees on
      // the outside face only (the ventral one stands on the bed), over the
      // full length of the bay's end plates.
      const BAY = 0.685
      for (const side of [-1, 1]) {
        add(
          cradle,
          armoredSection([
            [-1.045, 0.075, 0.32, BAY + 0.075],
            [-0.985, 0.135, 0.32, BAY + 0.135],
            [0.985, 0.135, 0.32, BAY + 0.135],
            [1.045, 0.075, 0.32, BAY + 0.075],
          ]),
          pale,
          [0, 0.08, 0],
          [(side * Math.PI) / 2, 0, 0]
        )
      }
      for (const x of [-1, 1]) plate(cradle, [0.09, 0.39, 1.35], [x, 0.025, 0], steel)
      // A 45-degree web under each shoulder, carrying on from the chamfer of
      // its outboard edge down into the hull: printed belly down, nothing
      // over the bay faces the bed. The modules' base plates and shoes are
      // narrow enough to clear it.
      const tip = 0.4 - 0.047
      for (const side of [-1, 1])
        fin(
          cradle,
          [
            [-side * BAY, tip],
            [-side * (BAY - tip - 0.05), -0.05],
            [-side * (BAY - tip - 0.05), -0.12],
            [-side * BAY, -0.12],
          ],
          2.0,
          pale,
          [0, Math.PI / 2, 0]
        )
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
    const highlight = material('highlight', HULL_INK.steel, 0.4)
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
      } else if (slot.type) moduleGeometry(module, slot.type, id === 'forward-0')
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
