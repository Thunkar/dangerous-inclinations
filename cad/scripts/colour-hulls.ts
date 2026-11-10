// Paint a hull's print in the game's colours for a multi-material printer:
//
//   yarn workspace @dangerous-inclinations/cad colour-hulls
//
// writes out/colour/<hull>-<accent>.3mf from the STLs `yarn export` writes:
// the hull painted, its stand, plugs and fins beside it; and
// out/colour/subsystems.3mf, the subsystems plate (`plates.mjs`) painted.
// The geometry is the hull print as it is; the colour is painted on its
// faces as a slicer's paint tool stores it (PrusaSlicer's
// slic3rpe:mmu_segmentation, Bambu Studio's and Orca's paint_color), so the
// mesh is not cut and the slicer carries each colour a little into the wall.
// Every flat face takes one material, the one of the game's meshes most of
// its area is nearest to (`createShip`'s names, mapped to a filament), so
// materials meet only at the print's edges. The livery, which the game
// paints with a shader over the hull paint, is painted across the hull
// paint's faces as the game masks it, from the same formula. The game's details are left off the print but keep their
// colour on the faces under them: the drive's glow lights the intakes. A
// face the print made (a slot, the bed) is far from every game mesh and
// keeps the base colour, and so does a mount's recess, where a subsystem
// stands.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BufferAttribute, BufferGeometry, Matrix4, Vector3, type Mesh, type Object3D } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { zipSync, strToU8 } from 'fflate'
import {
  DEFAULT_SHIP_APPEARANCE,
  type Hull,
  type Livery,
  type SubsystemType,
} from '@dangerous-inclinations/engine'
import { createShip } from '../../ui/src/ships/model.ts'
import { DEFAULT_CONFIG } from '../../ui/src/ships/config.ts'
import { HULL_INFO } from '../../ui/src/ships/hulls.ts'
import { printFrame } from '../lib/kit.ts'
import { HULL_PRINT, finFrame, mountFrame, slitFins } from '../pieces/hull.ts'
import { standOf } from '../pieces/stand.ts'
import { SOCKET, deckTop } from '../pieces/base.ts'
import { SHRIKE_BLADE } from '../../ui/src/ships/shrike.ts'
import { FDM, MOUNT } from '../spec.ts'
import { MOUNTS } from '../../ui/src/ships/config.ts'
import { readStl } from './plates.mjs'
import { PLATES } from '../plates.mjs'
import { layout } from '../pieces/module.ts'

const CAD = join(import.meta.dirname, '..')

/** The filaments, in slot order: slot 1 is the base, which an unpainted face takes. */
type Filament = { name: string; hex: string }
const BLACK: Filament = { name: 'black', hex: '#1e2024' }
const WHITE: Filament = { name: 'white', hex: '#f2efe6' }
const BLUE: Filament = { name: 'blue', hex: '#3fb0c8' }
const BROWN: Filament = { name: 'brown', hex: '#b78759' }
const RED: Filament = { name: 'red', hex: '#d21b33' }

/**
 * The game's materials (`ui/src/ships/palette.ts`) on the nearest filament:
 * the paint is the base and the secondary paint white; steel has no grey,
 * so it goes black with the recesses; the copper plumbing brown, anything
 * energised (the drive's glow, coils, windows) blue and the beacons red.
 */
const MATERIAL: Record<string, Filament> = {
  hull: BLACK,
  pale: WHITE,
  dark: BLACK,
  rubber: BLACK,
  steel: BLACK,
  copper: BROWN,
  cyan: BLUE,
  red: RED,
}

/** The subsystems carry no seat colour: their file keeps the seat's slot empty. */
const SEAT: Filament = { name: 'seat colour (unused)', hex: '#7a7a7a' }

/**
 * The slots, the same in every file: the base, the secondary paint, the
 * seat's colour, then the rest of the materials' filaments.
 */
const slotsFor = (accent: Filament) => [
  ...new Set([BLACK, WHITE, accent, ...Object.values(MATERIAL)]),
]

/** What prints, each in a seat's colour (`ui/src/utils/playerColors.ts`) and a livery. */
const SHIPS: { hull: Hull; livery: Livery; accent: Filament }[] = [
  { hull: 'corvette', livery: 'band', accent: { name: 'orange', hex: '#d08a1e' } },
  { hull: 'shrike', livery: 'chevron', accent: { name: 'green', hex: '#3d9a5c' } },
  { hull: 'mantis', livery: 'spine', accent: { name: 'purple', hex: '#9a62c8' } },
]

/** Faces further than this from every game mesh (mm) are the print's own. */
const NEAR = 1.2
/** Neighbours within about 1 degree of each other are one flat face. */
const FLAT = Math.cos((1 * Math.PI) / 180)
/** A band within this of a face (mm) is painted on it. */
const BAND = 0.3
/** ...and only this far below the bed (mm), clear of the arm's own plates where a fin's root meets them. */
const BAND_CLEAR = 2.5
/** How far apart a face's material is sampled (mm). */
const SAMPLE = 0.4
/** A face of hull paint is split down to this edge (mm) for its livery, and down to `FINE` where the livery's edge crosses it. */
const COARSE = 2
const FINE = 0.3

/** `LIVERY_GLSL` in `ui/src/ships/model.ts`, at a point in the ship's frame (hull units): does the livery cover it? */
function liveryAt(livery: Livery, hull: Hull, p: Vector3): boolean {
  const at = HULL_INFO[hull].livery
  const band = (v: number, a: number, b: number) => v >= a && v <= b
  switch (livery) {
    case 'band': {
      const u = (p.x + at.band[0]) * 0.848 + (p.y + at.band[1]) * 0.53
      return band(u, 2.05, 2.55) || band(u, 2.66, 2.76)
    }
    case 'split': {
      const y = p.y + at.split
      return y < -0.12 || band(y, -0.05, 0.01)
    }
    case 'chevron': {
      const v = p.x + at.chevron - Math.abs(p.z) * at.beam * 1.1
      return band(v, 2.15, 2.75) || band(v, 1.8, 1.94)
    }
    case 'stern': {
      const x = p.x + at.stern
      return band(x, -3.45, -3.05) || band(x, -2.95, -2.84)
    }
    case 'spine': {
      const y = p.y + at.spine
      const z = Math.abs(Math.abs(p.z) - at.spineZ)
      return y >= 0.72 && (z < 0.36 || band(z, 0.44, 0.5))
    }
  }
}

/**
 * The game's meshes under `root` that `keep` takes, in `root`'s frame: one
 * triangle soup with each triangle's material, and a BVH over it.
 */
function gameSurface(root: Object3D, keep: (name: string, path: string[]) => boolean) {
  root.updateMatrixWorld(true)
  const toShip = root.matrixWorld.clone().invert()
  const names: string[] = []
  const positions: number[] = []
  const materials: number[] = []
  root.traverse(o => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const name = (mesh.material as { name: string }).name
    const path: string[] = []
    for (let p: typeof o | null = mesh; p && p !== root; p = p.parent) path.unshift(p.name)
    if (!keep(name, path)) return
    if (!(name in MATERIAL)) throw new Error(`No filament for the game's ${name}`)
    if (!names.includes(name)) names.push(name)
    const m = toShip.clone().multiply(mesh.matrixWorld)
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry
    const pos = g.attributes.position
    const v = new Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m)
      positions.push(v.x, v.y, v.z)
      materials.push(names.indexOf(name))
    }
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setIndex([...Array(positions.length / 3).keys()])
  const bvh = new MeshBVH(geometry)
  const index = geometry.index!
  /** One material's meshes alone, for a band laid over another (`over`). */
  const only = (name: string) => {
    const g = new BufferGeometry()
    const k = names.indexOf(name)
    const mine = positions.filter((_, i) => materials[Math.floor(i / 3)] === k)
    g.setAttribute('position', new BufferAttribute(new Float32Array(mine), 3))
    g.setIndex([...Array(mine.length / 3).keys()])
    return new MeshBVH(g)
  }
  return { bvh, only, material: (face: number) => names[materials[index.getX(face * 3)]] }
}

/**
 * What the game draws at a point of the print (mm, the hull's print frame):
 * the material of the nearest game mesh, or null on a face the print made
 * (far from every game mesh, or in a mount's recess); and whether the
 * livery covers it.
 */
function painter(ship: (typeof SHIPS)[number]): Painter {
  const ship3d = createShip({
    ...DEFAULT_CONFIG,
    appearance: { ...DEFAULT_SHIP_APPEARANCE, hull: ship.hull },
  })
  // What `pieces/hull.ts` prints, and the details on it: no modules or highlights.
  const { bvh, only, material } = gameSurface(
    ship3d.root,
    (name, path) => name !== 'highlight' && !path.some(n => n.startsWith('module_'))
  )
  const bands = new Map<string, MeshBVH>()
  const toShip = printFrame(HULL_PRINT[ship.hull].bed).invert()
  const near = NEAR / (printFrame(0).elements[0] || 1)
  const model = createShip({
    ...DEFAULT_CONFIG,
    appearance: { ...DEFAULT_SHIP_APPEARANCE, hull: ship.hull },
  })
  const frame = printFrame(HULL_PRINT[ship.hull].bed)
  const mounts = MOUNTS.map(({ id }) => mountFrame(model, frame, id).invert())
  const m = new Vector3()
  /** In a mount's recess or on its walls: its outline and a hair round it, from the floor to just over the face. */
  const inRecess = (p: Vector3) =>
    mounts.some(inv => {
      m.copy(p).applyMatrix4(inv)
      return (
        Math.abs(m.x) <= MOUNT.halfLength + 0.3 &&
        Math.abs(m.y) <= MOUNT.halfHeight + 0.3 &&
        m.z >= -MOUNT.recessDepth - 0.5 &&
        m.z <= 0.1
      )
    })
  const q = new Vector3()
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 }
  // A BVH's closest point may lie past the threshold it is given (which only
  // prunes its boxes), so the distance is checked here.
  const within = (b: MeshBVH, p: Vector3, d: number) =>
    !!b.closestPointToPoint(q.copy(p).applyMatrix4(toShip), hit, 0, d) && hit.distance <= d
  return {
    material: (p: Vector3, reach = 1): string | null =>
      !inRecess(p) && within(bvh, p, near * reach) ? material(hit.faceIndex) : null,
    livery: (p: Vector3) => liveryAt(ship.livery, ship.hull, q.copy(p).applyMatrix4(toShip)),
    /** Is a mesh of `name` within `mm`: a band the game lays a hair proud of a face the print draws flat? */
    over: (p: Vector3, name: string, mm: number) => {
      if (!bands.has(name)) bands.set(name, only(name))
      return within(bands.get(name)!, p, mm / S)
    },
  }
}

/** What the game draws at a point of a print: see `painter`. */
interface Painter {
  material: (p: Vector3, reach?: number) => string | null
  livery: (p: Vector3) => boolean
  over: (p: Vector3, name: string, mm: number) => boolean
}

/**
 * A module's painter: the game's module as the print stands it
 * (`pieces/module.ts` `layout`). It carries no livery: a module moves from
 * mount to mount and ship to ship.
 */
function modulePainter(type: SubsystemType): Painter {
  const { group, frame } = layout(type)
  const { bvh, material } = gameSurface(group, () => true)
  const toGroup = frame.clone().invert()
  const near = NEAR / S
  const q = new Vector3()
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 }
  return {
    material: (p, reach = 1) =>
      bvh.closestPointToPoint(q.copy(p).applyMatrix4(toGroup), hit, 0, near * reach) &&
      hit.distance <= near * reach
        ? material(hit.faceIndex)
        : null,
    livery: () => false,
    over: () => false,
  }
}

/** A livery tree: a leaf's slot, or four children (PrusaSlicer's TriangleSelector, split on all three sides). */
type Tree = number | Tree[]

/**
 * A painted face's livery: split in four (corners first, then the middle,
 * as `TriangleSelector::perform_split` numbers them) until each piece is
 * one colour at its corners, edges' middles and centre, or `FINE` long.
 */
function liveryFace(a: Vector3, b: Vector3, c: Vector3, at: (p: Vector3) => number): Tree {
  const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a))
  const ab = a.clone().add(b).multiplyScalar(0.5)
  const bc = b.clone().add(c).multiplyScalar(0.5)
  const ca = c.clone().add(a).multiplyScalar(0.5)
  const mid = a.clone().add(b).add(c).divideScalar(3)
  const s = [a, b, c, ab, bc, ca, mid].map(at)
  if ((s.every(x => x === s[0]) && longest <= COARSE) || longest <= FINE) return at(mid)
  const children = [
    liveryFace(a, ab, ca, at),
    liveryFace(ab, b, bc, at),
    liveryFace(bc, c, ca, at),
    liveryFace(ab, bc, ca, at),
  ]
  // Four leaves of one colour are one leaf.
  return children.every(t => t === children[0]) ? children[0] : children
}

/**
 * The mesh's flat faces: triangles joined across a shared edge when they lie
 * in one plane. Each is painted one colour, the one most of its area takes.
 */
function flatFaces(vertices: Vector3[], triangles: number[][]): number[] {
  const normal = triangles.map(([a, b, c]) =>
    new Vector3()
      .subVectors(vertices[b], vertices[a])
      .cross(new Vector3().subVectors(vertices[c], vertices[a]))
      .normalize()
  )
  const byEdge = new Map<string, number[]>()
  triangles.forEach((t, i) =>
    t.forEach((a, k) => {
      const b = t[(k + 1) % 3]
      const key = a < b ? `${a},${b}` : `${b},${a}`
      byEdge.set(key, [...(byEdge.get(key) ?? []), i])
    })
  )
  const face = triangles.map(() => -1)
  let n = 0
  for (let seed = 0; seed < triangles.length; seed++) {
    if (face[seed] >= 0) continue
    const plane = { n: normal[seed], d: normal[seed].dot(vertices[triangles[seed][0]]) }
    const stack = [seed]
    face[seed] = n
    while (stack.length) {
      const t = triangles[stack.pop()!]
      t.forEach((a, k) => {
        const b = t[(k + 1) % 3]
        for (const o of byEdge.get(a < b ? `${a},${b}` : `${b},${a}`)!) {
          if (face[o] >= 0 || normal[o].dot(plane.n) < FLAT) continue
          if (triangles[o].some(v => Math.abs(plane.n.dot(vertices[v]) - plane.d) > 0.01)) continue
          face[o] = n
          stack.push(o)
        }
      })
    }
    n++
  }
  return face
}

/** Points spread over a triangle, each standing for an equal share of its area. */
function samples(a: Vector3, b: Vector3, c: Vector3): Vector3[] {
  const k = Math.min(
    24,
    Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / SAMPLE))
  )
  const out: Vector3[] = []
  const at = (i: number, j: number) =>
    a
      .clone()
      .addScaledVector(b.clone().sub(a), i / k)
      .addScaledVector(c.clone().sub(a), j / k)
  for (let i = 0; i < k; i++)
    for (let j = 0; i + j < k; j++) {
      out.push(at(i + 1 / 3, j + 1 / 3))
      if (i + j < k - 1) out.push(at(i + 2 / 3, j + 2 / 3))
    }
  return out
}

/** A tree as the 3MF's paint string: a nibble a node (a leaf's slot, or a split and its children last to first), written backwards. */
function encode(tree: Tree): string {
  const nibbles: number[] = []
  const walk = (t: Tree) => {
    if (typeof t === 'number') nibbles.push(...(t < 3 ? [t << 2] : [0b1100, t - 3]))
    else {
      // Three sides split, special side 0.
      nibbles.push(3)
      for (let i = 3; i >= 0; i--) walk(t[i])
    }
  }
  walk(tree)
  return nibbles
    .map(n => n.toString(16).toUpperCase())
    .reverse()
    .join('')
}

interface Piece {
  name: string
  mesh: { vertices: number[][]; triangles: number[][]; size: number[] }
  paint?: string[]
  at: [number, number]
}

function model3mf(pieces: Piece[], filaments: Filament[]): string {
  const materials = filaments
    .map(f => `<base name="${f.name}" displaycolor="${f.hex.toUpperCase()}FF"/>`)
    .join('')
  const objects = pieces
    .map(({ name, mesh, paint }, k) => {
      const v = mesh.vertices
        .map(([x, y, z]) => `<vertex x="${x.toFixed(4)}" y="${y.toFixed(4)}" z="${z.toFixed(4)}"/>`)
        .join('')
      const t = mesh.triangles
        .map(([a, b, c], i) => {
          const s = paint?.[i]
          const painted =
            s && s !== '4' ? ` slic3rpe:mmu_segmentation="${s}" paint_color="${s}"` : ''
          return `<triangle v1="${a}" v2="${b}" v3="${c}"${painted}/>`
        })
        .join('')
      return `<object id="${k + 2}" type="model" name="${name}" pid="1" pindex="0"><mesh><vertices>${v}</vertices><triangles>${t}</triangles></mesh></object>`
    })
    .join('\n')
  const items = pieces
    .map(
      ({ at: [x, y] }, k) =>
        `<item objectid="${k + 2}" transform="1 0 0 0 1 0 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)} 0"/>`
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">
<metadata name="slic3rpe:Version3mf">1</metadata>
<metadata name="slic3rpe:MmPaintingVersion">1</metadata>
<resources>
<basematerials id="1">${materials}</basematerials>
${objects}
</resources>
<build>
${items}
</build>
</model>
`
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>
`
const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>
`

/** Where a point of a piece is in the hull's print (mm), and how far from the game's meshes it may look; null keeps the base colour. */
type ToHull = (p: Vector3) => { p: Vector3; reach?: number } | null

const S = printFrame(0).elements[0]
/** How far the printed stands sit below their own frame (`printStand`). */
const STAND_DROP = deckTop() - SOCKET.depth + SOCKET.room

/**
 * The shrike's stand: its blade is what hangs below the hull, carried as it
 * prints with the hull. Below the blade its edges run on down to the
 * collar, painted as the blade's bottom is; the collar is the base colour.
 */
function shrikeStand(): ToHull {
  const { bed, at } = standOf('shrike')
  const bottom = (SHRIKE_BLADE.bottom - HULL_INFO.shrike.keel) * S
  const band = ((SHRIKE_BLADE.thick + SHRIKE_BLADE.proud) * S) / 2 + 0.3
  return p => {
    const h = new Vector3(p.x + at, p.y, p.z - bed + STAND_DROP)
    if (h.z >= bottom) return { p: h }
    if (Math.abs(h.y) > band) return null
    return { p: h.setZ(bottom + 0.05), reach: 12 }
  }
}

/** The mantis's stand: its keel fin as the hull carries it, the web and column under it the base colour. */
function mantisStand(): ToHull {
  const { bed, at, head } = standOf('mantis')
  return p => ({ p: new Vector3(p.x - (head - at), p.y, p.z - bed + STAND_DROP) })
}

/** The mantis's arm fins as they print, flat side by side (`buildArmFins`), each back under its arm. */
function mantisFins(): ToHull {
  const fins = slitFins('mantis').arms.map((f, i) => {
    const minY = Math.min(...f.points.map(([, y]) => y * S))
    const thick = f.thick * S + 2 * FDM.join
    return finFrame('mantis', f).multiply(
      new Matrix4().makeTranslation(0, -(i * 14 - minY), -thick / 2)
    )
  })
  return p => ({ p: p.clone().applyMatrix4(fins[p.y < 14 - 0.01 ? 0 : 1]) })
}

/**
 * What prints with each hull: its parts, and how each painted one maps onto
 * the hull. The mantis's arm fins print flat, without the pale band the game
 * lays a hair proud down their leading edge, so it is painted on them as a
 * livery is (`band`).
 */
const PARTS: Record<Hull, { part: string; toHull?: () => ToHull; band?: string }[]> = {
  corvette: [{ part: 'hull', toHull: () => p => ({ p }) }, { part: 'stand' }, { part: 'plugs' }],
  shrike: [
    { part: 'hull', toHull: () => p => ({ p }) },
    { part: 'stand', toHull: shrikeStand },
    { part: 'plugs' },
  ],
  mantis: [
    { part: 'hull', toHull: () => p => ({ p }) },
    { part: 'stand', toHull: mantisStand },
    { part: 'plugs' },
    { part: 'fins', toHull: mantisFins, band: 'pale' },
  ],
}

const GAP = 6

/** The Prusa CORE One's bed. */
const MODULE_BED = { x: 250, y: 220, margin: 6, gap: 5 }

/**
 * A piece's triangles painted: each flat face takes the material most of its
 * area is nearest to, and a face of hull paint carries the livery.
 */
function paintPiece(
  accent: Filament,
  mesh: ReturnType<typeof readStl>,
  filaments: Filament[],
  at: Painter,
  toHull: ToHull,
  band?: string
) {
  const slot = (f: Filament) => filaments.indexOf(f) + 1
  const lo = new Vector3(...mesh.lo)
  const vertices = mesh.vertices.map((v: number[]) => new Vector3(...v).add(lo))
  const face = flatFaces(vertices, mesh.triangles)
  const votes = new Map<number, Map<string | null, number>>()
  mesh.triangles.forEach(([a, b, c]: number[], i: number) => {
    const points = samples(vertices[a], vertices[b], vertices[c])
    const share =
      new Vector3()
        .subVectors(vertices[b], vertices[a])
        .cross(new Vector3().subVectors(vertices[c], vertices[a]))
        .length() /
      2 /
      points.length
    const v = votes.get(face[i]) ?? new Map<string | null, number>()
    for (const p of points) {
      const h = toHull(p)
      const name = h && at.material(h.p, h.reach)
      v.set(name, (v.get(name) ?? 0) + share)
    }
    votes.set(face[i], v)
  })
  const material = new Map(
    [...votes].map(([f, v]) => [f, [...v].reduce((best, e) => (e[1] > best[1] ? e : best))[0]])
  )
  const livery = (p: Vector3) => {
    const h = toHull(p)
    if (h && band && h.p.z < -BAND_CLEAR && at.over(h.p, band, BAND)) return slot(MATERIAL[band])
    return h && at.livery(h.p) ? slot(accent) : slot(MATERIAL.hull)
  }
  return mesh.triangles.map(([a, b, c]: number[], i: number): Tree => {
    const name = material.get(face[i])
    if (name === 'hull') return liveryFace(vertices[a], vertices[b], vertices[c], livery)
    return slot(name ? MATERIAL[name] : filaments[0])
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(join(CAD, 'out/colour'), { recursive: true })
  for (const ship of SHIPS) {
    const filaments = slotsFor(ship.accent)
    const at = painter(ship)
    const pieces: (Piece & { trees?: Tree[] })[] = []
    let y = 0
    for (const { part, toHull, band } of PARTS[ship.hull]) {
      const mesh = readStl(join(CAD, `out/${ship.hull}/${ship.hull}-${part}.stl`))
      const trees = toHull && paintPiece(ship.accent, mesh, filaments, at, toHull(), band)
      pieces.push({ name: `${ship.hull}-${part}`, mesh, trees, at: [0, y] })
      y += mesh.size[1] + GAP
    }
    // Centred on a 256 mm bed; any slicer arranges it again.
    const w = Math.max(...pieces.map(p => p.mesh.size[0]))
    for (const p of pieces) p.at = [128 - w / 2 + p.at[0], 128 - y / 2 + p.at[1]]
    write(`out/colour/${ship.hull}-${ship.accent.name}.3mf`, pieces, filaments)
  }
  // The subsystems plate (`plates.mjs`), painted: each module once, laid out
  // in rows on the CORE One's bed.
  const filaments = slotsFor(SEAT)
  const plate = PLATES.find((p: { id: string }) => p.id === 'subsystems')!
  const modules: (Piece & { trees?: Tree[] })[] = []
  for (const [part, count] of plate.parts as [string, number][]) {
    const type = part.split('/')[1] as SubsystemType
    const mesh = readStl(join(CAD, `out/${part}.stl`))
    const trees = paintPiece(BLACK, mesh, filaments, modulePainter(type), p => ({ p }))
    for (let i = 0; i < count; i++)
      modules.push({ name: `${type}-${i + 1}`, mesh, trees, at: [0, 0] })
  }
  shelve(modules, MODULE_BED)
  write('out/colour/subsystems.3mf', modules, filaments)
}

/** Pieces in rows, tallest first, on a bed (mm, with a margin and a gap), centred. */
function shelve(pieces: Piece[], bed: { x: number; y: number; margin: number; gap: number }) {
  const order = [...pieces].sort((a, b) => b.mesh.size[1] - a.mesh.size[1])
  let [x, y, row] = [0, 0, 0]
  let wide = 0
  for (const p of order) {
    if (x && x + p.mesh.size[0] > bed.x - 2 * bed.margin) [x, y, row] = [0, y + row + bed.gap, 0]
    p.at = [x, y]
    x += p.mesh.size[0] + bed.gap
    wide = Math.max(wide, x - bed.gap)
    row = Math.max(row, p.mesh.size[1])
  }
  const tall = y + row
  if (tall > bed.y - 2 * bed.margin)
    throw new Error(`The pieces need ${tall.toFixed(0)} mm of the bed's ${bed.y}`)
  for (const p of pieces) p.at = [(bed.x - wide) / 2 + p.at[0], (bed.y - tall) / 2 + p.at[1]]
}

/** Write a painted 3MF with every slot, used or not, so a printer loaded for one file is loaded for all. */
function write(file: string, pieces: (Piece & { trees?: Tree[] })[], slots: Filament[]) {
  for (const p of pieces) p.paint = p.trees?.map(encode)
  writeFileSync(
    join(CAD, file),
    zipSync({
      '[Content_Types].xml': strToU8(CONTENT_TYPES),
      '_rels/.rels': strToU8(RELS),
      '3D/3dmodel.model': strToU8(model3mf(pieces, slots)),
    })
  )
  console.log(`${file}: slots ${slots.map((f, i) => `${i + 1} ${f.name}`).join(', ')}`)
}
