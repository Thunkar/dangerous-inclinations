/**
 * The shared modular corvette display model. +X is the bow, +Y is dorsal, port is -Z.
 * All mount-local modules point along +Y and share one keyed magnetic shoe.
 * Named groups are deliberately a clean seam for eventual authored glTF parts.
 * These intersecting display meshes are NOT manufacturing solids.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  Shape,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { MOUNTS, mountTransform, type MountId, type Vec3, type WorkshopConfig } from './config'

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { visibleSlots, type VisibleSlots } from './visual'

type Material = MeshStandardMaterial
export interface ShipModel {
  root: Group
  mounts: Map<MountId, { frame: Group; module: Group; highlight: Material; labelPosition: Vector3 }>
  engineGlow: Material
  nozzles: Vector3[]
  /** Incremental editor updates; board batches are rebuilt from their visual spec. */
  update: (config: WorkshopConfig, slots?: VisibleSlots) => void
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
  config: WorkshopConfig,
  concealed = false,
  options: { slots?: VisibleSlots; detail?: 'hero' | 'board' } = {}
): ShipModel {
  const root = new Group()
  root.name = 'modular_corvette'
  root.userData = { units: 'concept units' }
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<CanvasTexture>()
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
  const hull = material(config.paint)
  const pale = material(
    config.appearance?.secondaryPaint ??
      new Color(config.paint).lerp(new Color('#ffffff'), 0.2).getStyle()
  )
  const dark = material('#242e33', 0.65)
  const steel = material('#647776', 0.75)
  const rubber = material('#11191d', 0.1)
  const accent = material(config.accent)
  const copper = material('#b78759', 0.72)
  const cyan = material('#76dcf3', 0.3, 1.4)
  const engineGlow = material('#98e8ff', 0.2, 3.2)
  const red = material('#d95b4a', 0.1, 1)

  const add = (
    parent: Group,
    geometry: BufferGeometry,
    mat: Material,
    pos: Vec3 = [0, 0, 0],
    rot: Vec3 = [0, 0, 0]
  ) => {
    geometries.add(geometry)
    const mesh = new Mesh(geometry, mat)
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
      [2.8, 0.64, 0.85],
      [3.04, 0.5, 0.77],
    ]),
    dark
  )
  // Armor relief: flush inset plating at one end of the dial, deep slab armor
  // with wide shadow channels at the other. Everything painted on the deck —
  // markings and spine — rides on top of the plate, so the armor is free to
  // grow; the bow tile grows least, to keep the citadel clear.
  const relief = config.appearance?.armorRelief ?? 0.5
  const deck = 0.05 + relief * 0.33
  const keel = 0.05 + relief * 0.3
  const chine = 0.07 + relief * 0.19
  const channel = 0.02 + relief * 0.15
  const deckTop = 0.8 + deck
  for (const [x, l, share] of [
    [-2.12, 0.93, 1],
    [-0.98, 1.25, 1],
    [0.43, 1.43, 1],
    [1.68, 0.91, 0.42],
  ] as [number, number, number][]) {
    const step = deck * share
    plate(body, [l - channel, step, 1.64 - channel * 2], [x, 0.8 + step / 2, 0], hull)
    plate(body, [l - channel, keel, 1.6 - channel * 2], [x, -0.79 - keel / 2, 0], hull)
    for (const side of [-1, 1]) {
      plate(body, [l - channel, chine, 0.5], [x, 0.61, side * 0.98], pale, [side * 0.68, 0, 0])
      plate(body, [l - channel, chine * 0.85, 0.42], [x, -0.62, side * 0.98], hull, [
        -side * 0.65,
        0,
        0,
      ])
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
    plate(body, [1.02, 0.13, 0.65], [2.66, 0.56, side * 0.7], accent, [
      side * 0.48,
      side * 0.17,
      -0.22,
    ])
    // Continuous service conduits under the armor shoulder.
    pipe(body, [-2.7, 0.44, side * 1.1], [1.82, 0.44, side * 1.1], 0.055, copper)
    for (const x of [-2.25, -1.45, 0, 0.85, 1.75])
      box(body, [0.12, 0.16, 0.17], [x, 0.45, side * 1.1], steel)
    // Maneuvering thrusters remain with the hull, regardless of loadout.
    for (const x of [-2.45, 2.7]) {
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
  // Dorsal profile: the spine runs from flush deck plating to a raised fin, and
  // carries the equipment cabinets with it. It stays inboard of the seat
  // markings, and the flanks are clear of it at every height.
  plate(body, [2.7, 0.16, 0.32], [-0.65, deckTop + 0.03, 0], dark)
  const spine = 0.07 + (config.appearance?.spineHeight ?? 0.5) * 0.62
  add(
    body,
    armoredSection([
      [-2.62, spine * 0.2, 0.1],
      [-2.32, spine * 0.5, 0.29],
      [0.52, spine * 0.5, 0.29],
      [0.98, spine * 0.22, 0.13],
    ]),
    pale,
    [0, deckTop + spine / 2, 0]
  )
  const crest = new Group()
  crest.name = 'dorsal_spine'
  crest.position.y = deckTop + spine
  body.add(crest)
  for (let i = 0; i < 8; i++) box(crest, [0.09, 0.1, 0.36], [-1.8 + i * 0.32, 0.03, 0], steel)
  plate(crest, [0.7, 0.2, 0.62], [-1.76, 0.1, 0], pale)
  box(crest, [0.13, 0.3, 0.71], [-1.76, 0.16, 0], accent)
  for (const side of [-1, 1]) {
    // Cable runs climb the spine cheeks, so a raised fin still reads as built.
    if (spine > 0.25)
      plate(body, [2.1, 0.06, spine * 0.62], [-1.1, deckTop + spine / 2, side * 0.3], dark, [
        (side * Math.PI) / 2,
        0,
        0,
      ])
    for (let i = 0; i < 6; i++)
      box(body, [0.055, 0.035, 0.38], [-0.93 + i * 0.13, deckTop, side * 0.5], rubber)
  }
  // Neutral backing keeps seat markings distinct from arbitrary hull paint.
  for (const side of [-1, 1]) {
    plate(body, [1.3, 0.026, 0.31], [-0.62, deckTop + 0.02, side * 0.59], dark)
    plate(body, [1.16, 0.028, 0.19], [-0.62, deckTop + 0.04, side * 0.59], accent)
  }
  // Fixed scoop on the ventral bow.
  plate(body, [1.2, 0.26, 0.92], [2.58, -0.69, 0], steel)
  box(body, [0.11, 0.18, 0.67], [3.16, -0.68, 0], rubber)
  for (const z of [-0.24, -0.08, 0.08, 0.24]) box(body, [0.12, 0.15, 0.03], [3.22, -0.68, z], pale)

  if (!resin) {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#192023'
    ctx.fillRect(0, 0, 512, 128)
    ctx.fillStyle = '#e5e8de'
    ctx.font = 'bold 70px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(config.identity ?? 'K—07', 256, 85)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    textures.add(texture)
    const ink = material('#ffffff', 0)
    ink.map = texture
    ink.transparent = true
    ink.depthWrite = false
    add(
      body,
      new PlaneGeometry(0.85, 0.24),
      ink,
      [0.56, deckTop + 0.012, -0.47],
      [-Math.PI / 2, 0, 0]
    )
  }

  // The afterbody is lofted in world space so it joins both the independently
  // scaled hull and the engine cluster without a step or a floating adapter.
  const driveOrigin = -3.13 * config.length
  const engineScale = config.engineSize
  const sternHeight =
    (config.engines === 5 ? 1.24 : config.engines === 1 ? 1.05 : 0.85) * engineScale
  const sternWidth = (config.engines === 1 ? 1.12 : 1.5) * engineScale
  const aftSections: [number, number, number][] = [
    [driveOrigin - 0.78 * engineScale, sternHeight, sternWidth],
    [
      driveOrigin - 0.22 * engineScale,
      sternHeight + 0.08 * engineScale,
      sternWidth + 0.03 * engineScale,
    ],
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
  for (const vertical of [-1, 1]) {
    // Structural armor follows the spine all the way onto the thrust bulkhead.
    strake(
      [-2.19 * config.length, vertical * 0.98 * config.armor, 0],
      [driveOrigin - 0.76 * engineScale, vertical * (sternHeight + 0.065), 0],
      0.48 * config.beam,
      0.14,
      pale
    )
    for (const side of [-1, 1]) {
      strake(
        [-2.23 * config.length, vertical * 0.6 * config.armor, side * 1.1 * config.beam],
        [
          driveOrigin - 0.77 * engineScale,
          vertical * 0.64 * sternHeight,
          side * (sternWidth + 0.025),
        ],
        0.19,
        0.17,
        pale
      )
      pipe(
        afterbody,
        [-2.57 * config.length, vertical * 0.35 * config.armor, side * 1.19 * config.beam],
        [
          driveOrigin - 0.59 * engineScale,
          vertical * 0.3 * sternHeight,
          side * (sternWidth + 0.035),
        ],
        0.06,
        copper
      )
    }
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const x = driveOrigin + (-0.44 + i * 0.17) * engineScale
      const { height, width } = aftProfile(x)
      box(afterbody, [0.075, height * 0.43, 0.035], [x, 0, side * (width + 0.014)], dark)
    }
    const markX = driveOrigin + 0.46 * engineScale
    const profile = aftProfile(markX)
    box(
      afterbody,
      [0.15, profile.height * 0.48, 0.04],
      [markX, 0, side * (profile.width + 0.019)],
      accent
    )
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
    box(p, [0.27, 0.09, 0.1], [0, y + 0.12, -0.55], accent)
  }

  const moduleGeometry = (p: Group, type: SubsystemType) => {
    shoe(p, 0, dark, false)
    plate(p, [1.68, 0.12, 1.14], [0, 0.16, 0], hull)
    for (const x of [-0.69, 0.69]) box(p, [0.09, 0.025, 0.88], [x, 0.235, 0], accent)
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
            cylinder(p, 0.143, 0.143, 0.08, [x, 0.65, z], accent)
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
        box(p, [0.085, 0.025, 0.98], [0, 0.595, 0], accent)
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
          box(p, [0.24, 0.025, 0.12], [0, 0.71, z], accent)
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
          box(panel, [0.21, 0.012, 0.04], [0.57, 0.04, side * 0.3], accent)
        }
        break
      }
      case 'fuel_compressor': {
        // The compressor sits on the bow hardpoint, whose frame sends local +Y
        // down the nose and local X across it. It holds no fuel of its own any
        // more — it buys a jump, it is not a tank — so the mass is a pump block
        // mated flat to the bow rather than cylinders reaching past it. The
        // drums stand dorsal-ventral (axis along local Z) to keep it shallow.
        plate(p, [1.04, 0.16, 0.76], [0, 0.08, 0], dark)
        for (const x of [-0.31, 0.31]) {
          const drum = new Group()
          drum.name = `compressor_drum_${x < 0 ? 0 : 1}`
          p.add(drum)
          cylinder(drum, 0.25, 0.25, 0.6, [x, 0.36, 0], pale, [Math.PI / 2, 0, 0])
          // Flanged end caps, and one accent band around the barrel.
          for (const z of [-0.3, 0.3])
            cylinder(drum, 0.28, 0.28, 0.07, [x, 0.36, z], steel, [Math.PI / 2, 0, 0])
          ring(drum, 0.255, 0.035, [x, 0.36, 0], accent, [0, 0, 0])
        }
        // Manifold across the pair, with the feed running back into the hull.
        pipe(p, [-0.31, 0.63, 0], [0.31, 0.63, 0], 0.06, copper)
        pipe(p, [0, 0.63, 0], [0, 0.63, -0.34], 0.06, copper)
        plate(p, [0.3, 0.18, 0.2], [0, 0.56, -0.4], dark)
        // Intake trunking low on the mating face, between the drums.
        plate(p, [0.34, 0.26, 0.42], [0, 0.22, 0], hull)
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
          cylinder(
            traverse,
            0.075,
            0.075,
            0.13,
            [0, 0.63, z * 1.24],
            accent,
            [Math.PI / 2, 0, 0],
            8
          )
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
        plate(gun, [0.075, 0.32, 0.32], [-0.45, 0.07, 0], accent)
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
    // Mount-local +Z is dorsal on every mount, so the secondary-painted
    // shoulder is the upper one on the bow and on both flanks alike.
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
          z > 0 ? pale : hull,
          [0, 0, z],
          [0, 0, Math.PI / 2]
        )
        // Paint follows the collar instead of adding another detached plate.
        plate(cradle, [0.12, 0.42, 0.025], [0.54, 0.05, z + Math.sign(z) * 0.135], accent)
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
          z > 0 ? pale : hull,
          [0, 0.08, z]
        )
        plate(cradle, [0.14, 0.025, 0.2], [-0.58, 0.415, z], accent)
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
    const highlight = material('#647776', 0.4)
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
  function update(next: WorkshopConfig, slots = visibleSlots(next, concealed)) {
    if (!resin) {
      hull.color.set(next.paint)
      pale.color.set(
        next.appearance?.secondaryPaint ?? new Color(next.paint).lerp(new Color('#ffffff'), 0.2)
      )
      accent.color.set(next.accent)
      for (const m of [hull, pale]) {
        m.roughness = next.appearance?.finish === 'metal' ? 0.34 : 0.62
        m.metalness = next.appearance?.finish === 'metal' ? 0.8 : 0.35
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
        box(module, [0.18, 0.02, 0.8], [0, 0.43, 0], accent)
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
    for (const mat of [hull, pale, steel, accent]) {
      mat.emissive.copy(mat.color)
      mat.emissiveIntensity = mat === accent ? 0.35 : 0.16
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
      textures.forEach(t => t.dispose())
    },
  }
}

export function poseShip(model: ShipModel, exploded: number, selected: MountId | null) {
  for (const [id, mount] of model.mounts) {
    mount.module.position.y = 0.12 + exploded * 2.2
    mount.highlight.color.set(id === selected ? '#ffc078' : '#647776')
    mount.highlight.emissive.set(id === selected ? '#f8914d' : '#000000')
    mount.highlight.emissiveIntensity = id === selected ? 0.5 : 0
  }
  model.root.updateMatrixWorld(true)
}
