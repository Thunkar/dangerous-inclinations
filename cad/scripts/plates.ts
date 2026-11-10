// Pack the print plates of plates.mjs: `node --experimental-strip-types
// --import ./scripts/ts-hooks.mjs scripts/plates.ts` (it reads the game's
// colours from its TypeScript) writes
// out/plates/<plate>.3mf, one MK4S bed a file (PrusaSlicer has one bed a
// project), from the STLs `yarn export` writes. Each piece is an object of
// its own, its copies instances of it, laid out with the bed's margin and
// gap; a plate that overflows a bed goes on to <plate>-2 and so on. Run the
// export first.
import { readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'
import { BED, PLATES } from '../plates.mjs'
import { COLOUR } from '../colours.ts'

/** An STL's triangles as indexed vertices, its box moved to start at the origin. */
export interface Mesh {
  vertices: number[][]
  triangles: number[][]
  size: number[]
  lo: number[]
}

/**
 * A plate's entry (`plates.mjs`): a part and how many, "loose" for a set of
 * inlays packed body by body; or parts laid out together.
 */
type Entry =
  | [part: string, n: number, layout?: 'loose']
  | { concentric: string[]; nested?: undefined; n: number }
  | { nested: string[]; concentric?: undefined; n: number }

/** A plate as `plates.mjs` lists it. */
export interface Plate {
  id: string
  title: string
  colour: string
  parts: Entry[]
}

const plates = PLATES as Plate[]

/** A placement in the bed's plane, [a, b, c, d, tx, ty]: x' = a x + b y + tx, y' = c x + d y + ty. */
type Place = number[]
/** A part placed in a unit. */
interface Member {
  part: string
  m: Place
}
/** What the packer lays down as one: its members and its size. */
interface Unit {
  members: Member[]
  w: number
  h: number
}
/** A unit's footprint on the raster: its size in cells, its runs of cells a row, the placement onto it and its size in mm. */
interface Footprint {
  w: number
  h: number
  rows: [number, number][][]
  M: Place
  size: number[]
}
/** The meshes by part. */
type MeshOf = (part: string) => Mesh

/** An STL's triangles as indexed vertices, moved so its box starts at the origin. */
export function readStl(path: string): Mesh {
  const buf = readFileSync(path)
  const raw: number[][] = []
  if (buf.subarray(0, 5).toString() === 'solid' && buf.subarray(0, 400).includes('facet')) {
    for (const m of buf.toString().matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g))
      raw.push([+m[1], +m[2], +m[3]])
  } else {
    const n = buf.readUInt32LE(80)
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 3; k++) {
        const o = 84 + i * 50 + 12 + k * 12
        raw.push([buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)])
      }
  }
  const lo = [0, 1, 2].map(i => Math.min(...raw.map(p => p[i])))
  const hi = [0, 1, 2].map(i => Math.max(...raw.map(p => p[i])))
  const index = new Map<string, number>()
  const vertices: number[][] = []
  const ids = raw.map(p => {
    const q = p.map((v, i) => v - lo[i])
    const key = q.map(v => v.toFixed(4)).join(',')
    if (!index.has(key)) {
      index.set(key, vertices.length)
      vertices.push(q)
    }
    return index.get(key)!
  })
  const triangles: number[][] = []
  for (let i = 0; i < ids.length; i += 3) {
    const [a, b, c] = ids.slice(i, i + 3)
    if (a !== b && b !== c && a !== c) triangles.push([a, b, c])
  }
  return { vertices, triangles, size: hi.map((v, i) => v - lo[i]), lo }
}

/**
 * A mesh's separate bodies, those whose boxes come within `near` of each
 * other kept together (the digits of one number), each moved so its box
 * starts at the origin.
 */
export function loose(mesh: Mesh, near = 1.5): Omit<Mesh, 'lo'>[] {
  const parent = mesh.vertices.map((_, i) => i)
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])))
  for (const [a, b, c] of mesh.triangles) {
    parent[root(b)] = root(a)
    parent[root(c)] = root(a)
  }
  const bodies = new Map<number, number[][]>()
  mesh.triangles.forEach(t => {
    const r = root(t[0])
    if (!bodies.has(r)) bodies.set(r, [])
    bodies.get(r)!.push(t)
  })
  const box = (tris: number[][]) => {
    const pts = tris.flat().map(i => mesh.vertices[i])
    return [0, 1, 2].map(d => [Math.min(...pts.map(p => p[d])), Math.max(...pts.map(p => p[d]))])
  }
  let groups = [...bodies.values()].map(tris => ({ tris, box: box(tris) }))
  type Group = { tris: number[][]; box: number[][] }
  const touch = (a: Group, b: Group) =>
    [0, 1].every(d => a.box[d][0] - near <= b.box[d][1] && b.box[d][0] - near <= a.box[d][1])
  for (let merged = true; merged; ) {
    merged = false
    for (let i = 0; i < groups.length && !merged; i++)
      for (let j = i + 1; j < groups.length && !merged; j++)
        if (touch(groups[i], groups[j])) {
          const tris = [...groups[i].tris, ...groups[j].tris]
          groups = [...groups.filter((_, k) => k !== i && k !== j), { tris, box: box(tris) }]
          merged = true
        }
  }
  return groups.map(({ tris, box: b }) => {
    const index = new Map<number, number>()
    const vertices: number[][] = []
    const triangles = tris.map(t =>
      t.map(i => {
        if (!index.has(i)) {
          index.set(i, vertices.length)
          vertices.push(mesh.vertices[i].map((v, d) => v - b[d][0]))
        }
        return index.get(i)!
      })
    )
    return { vertices, triangles, size: b.map(([lo, hi]) => hi - lo) }
  })
}

const I: Place = [1, 0, 0, 1, 0, 0]
const mul = (P: Place, Q: Place): Place => [
  P[0] * Q[0] + P[1] * Q[2],
  P[0] * Q[1] + P[1] * Q[3],
  P[2] * Q[0] + P[3] * Q[2],
  P[2] * Q[1] + P[3] * Q[3],
  P[0] * Q[4] + P[1] * Q[5] + P[4],
  P[2] * Q[4] + P[3] * Q[5] + P[5],
]
const shift = (x: number, y: number): Place => [1, 0, 0, 1, x, y]
const spin = (deg: number): Place => {
  const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)]
  return [c, -s, s, c, 0, 0]
}
const apply = (m: Place, [x, y]: number[]) => [
  m[0] * x + m[1] * y + m[4],
  m[2] * x + m[3] * y + m[5],
]

/** The raster the packer lays footprints on, mm a cell. */
const CELL = 0.5

const footprints = new WeakMap<Unit, Map<string, Footprint>>()

/**
 * A unit's footprint turned by `rot` degrees: its triangles seen from above,
 * filled cell by cell and grown by `pad` all round, as runs of filled cells
 * a row; with `M`, which takes the unit's points onto it (cell (i, j) spans
 * i to i + 1 cells from the origin), and the turned piece's size in mm.
 */
function footprint(unit: Unit, rot: number, pad: number, mesh: MeshOf): Footprint {
  const key = `${rot}:${pad}`
  const cache = footprints.get(unit) ?? footprints.set(unit, new Map()).get(unit)!
  const known = cache.get(key)
  if (known) return known
  const turn = spin(rot)
  const tris = unit.members.flatMap(({ part, m }) => {
    const g = mesh(part)
    const pts = g.vertices.map(v => apply(mul(turn, m), v))
    return g.triangles.map(t => t.map(i => pts[i]))
  })
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of tris.flat())
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)]
  const p = Math.ceil(pad / CELL)
  const [w, h] = [Math.ceil((x1 - x0) / CELL) + 2 * p + 1, Math.ceil((y1 - y0) / CELL) + 2 * p + 1]
  let grid = new Uint8Array(w * h)
  const cell = (x: number, y: number) => [
    Math.floor((x - x0) / CELL) + p,
    Math.floor((y - y0) / CELL) + p,
  ]
  for (const [a, b, c] of tris) {
    // Every corner's cell, so a sliver too thin to cover a cell's centre still counts.
    for (const q of [a, b, c]) {
      const [i, j] = cell(q[0], q[1])
      grid[j * w + i] = 1
    }
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    if (Math.abs(area) < 1e-9) continue
    const [i0, j0] = cell(Math.min(a[0], b[0], c[0]), Math.min(a[1], b[1], c[1]))
    const [i1, j1] = cell(Math.max(a[0], b[0], c[0]), Math.max(a[1], b[1], c[1]))
    const edge = (u: number[], v: number[], x: number, y: number) =>
      ((v[0] - u[0]) * (y - u[1]) - (v[1] - u[1]) * (x - u[0])) * Math.sign(area)
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const [x, y] = [x0 + (i - p + 0.5) * CELL, y0 + (j - p + 0.5) * CELL]
        if (edge(a, b, x, y) >= 0 && edge(b, c, x, y) >= 0 && edge(c, a, x, y) >= 0)
          grid[j * w + i] = 1
      }
  }
  // Grow by p cells: along each row, then down each column.
  const lines: [number, number, (r: number, k: number) => number][] = [
    [h, w, (r, k) => r * w + k],
    [w, h, (r, k) => k * w + r],
  ]
  for (const [n, len, at] of lines) {
    const out = new Uint8Array(w * h)
    for (let r = 0; r < n; r++) {
      let count = 0
      for (let k = 0; k < Math.min(p, len); k++) count += grid[at(r, k)]
      for (let k = 0; k < len; k++) {
        if (k + p < len) count += grid[at(r, k + p)]
        if (k - p - 1 >= 0) count -= grid[at(r, k - p - 1)]
        out[at(r, k)] = count > 0 ? 1 : 0
      }
    }
    grid = out
  }
  const rows = Array.from({ length: h }, (_, j) => {
    const runs: [number, number][] = []
    for (let i = 0; i < w; i++)
      if (grid[j * w + i] && (i === 0 || !grid[j * w + i - 1])) {
        let e = i
        while (e + 1 < w && grid[j * w + e + 1]) e++
        runs.push([i, e])
      }
    return runs
  })
  const fp: Footprint = {
    w,
    h,
    rows,
    M: mul(shift(-x0 + p * CELL, -y0 + p * CELL), turn),
    size: [x1 - x0, y1 - y0],
  }
  cache.set(key, fp)
  return fp
}

/** A bed's raster: which cells are taken, each row's running count of them for an at-a-glance test, and what stands on it. */
function bedRaster(bw: number, bh: number) {
  const occ = new Uint8Array(bw * bh)
  const pre = new Int32Array(bh * (bw + 1))
  const fits = (fp: Footprint, X: number, Y: number) => {
    for (let r = 0; r < fp.h; r++) {
      const base = (Y + r) * (bw + 1)
      for (const [a, b] of fp.rows[r]) if (pre[base + X + b + 1] - pre[base + X + a]) return false
    }
    return true
  }
  const take = (fp: Footprint, X: number, Y: number) => {
    for (let r = 0; r < fp.h; r++) {
      const y = Y + r
      for (const [a, b] of fp.rows[r]) occ.fill(1, y * bw + X + a, y * bw + X + b + 1)
      const base = y * (bw + 1)
      for (let x = 0; x < bw; x++) pre[base + x + 1] = pre[base + x] + occ[y * bw + x]
    }
  }
  /** The lowest, then leftmost, place the footprint fits, or null. */
  const find = (fp: Footprint): [number, number] | null => {
    for (let Y = 0; Y + fp.h <= bh; Y++)
      for (let X = 0; X + fp.w <= bw; X++) if (fits(fp, X, Y)) return [X, Y]
    return null
  }
  const placed: { i: number; place: Place; box: number[] }[] = []
  return { find, take, placed }
}

/** The 3MF model of a bed: one object per piece, an item per placement. */
function model(pieces: { name: string; mesh: Mesh; at: Place[] }[], colour: string) {
  const objects = pieces
    .map(({ name, mesh }, k) => {
      const v = mesh.vertices
        .map(([x, y, z]) => `<vertex x="${x.toFixed(4)}" y="${y.toFixed(4)}" z="${z.toFixed(4)}"/>`)
        .join('')
      const t = mesh.triangles
        .map(([a, b, c]) => `<triangle v1="${a}" v2="${b}" v3="${c}"/>`)
        .join('')
      return `<object id="${k + 2}" type="model" name="${name}" pid="1" pindex="0"><mesh><vertices>${v}</vertices><triangles>${t}</triangles></mesh></object>`
    })
    .join('\n')
  const items = pieces
    .flatMap(({ at }, k) =>
      at.map(([a, b, c, d, tx, ty]) => {
        // Row vectors: p' = p M.
        const m = [a, c, 0, b, d, 0, 0, 0, 1, tx, ty, 0].map(v => v.toFixed(6)).join(' ')
        return `<item objectid="${k + 2}" transform="${m}"/>`
      })
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<resources>
<basematerials id="1"><base name="filament" displaycolor="${colour.toUpperCase()}FF"/></basematerials>
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

/** Gaps tried before the bed's least one, widest first. */
const SPREAD = [20, 15, 10]

/**
 * The board's plates against its part files: every piece the files name, as
 * many times as each name says to print ("(print 17", else once), and no more.
 */
function checkBoard() {
  const want = new Map<string, number>()
  for (const dir of readdirSync('parts/board'))
    for (const file of readdirSync(`parts/board/${dir}`)) {
      const name = readFileSync(`parts/board/${dir}/${file}`, 'utf8').match(
        /part\(\s*(['"`])(.*?)\1/s
      )![2]
      want.set(
        `board/${dir}/${file.replace('.part.js', '')}`,
        +(name.match(/\(print (\d+)/)?.[1] ?? 1)
      )
    }
  const have = new Map<string, number>()
  for (const plate of plates)
    for (const [part, n] of counts(plate))
      if (part.startsWith('board/')) have.set(part, (have.get(part) ?? 0) + n)
  for (const part of new Set([...want.keys(), ...have.keys()]))
    if (want.get(part) !== have.get(part))
      throw new Error(
        `${part}: the plates print ${have.get(part) ?? 0}, the part file asks for ${want.get(part) ?? 0}`
      )
}

/** A mesh's points in the board's plane, where the part was built. */
const built = (mesh: Mesh) => mesh.vertices.map(([x, y]) => [x + mesh.lo[0], y + mesh.lo[1]])

/** A unit moved so its footprint starts at the origin, with that footprint's size. */
function settle(members: Member[], mesh: MeshOf): Unit {
  const pts = members.flatMap(({ part, m }) => mesh(part).vertices.map(v => apply(m, v)))
  const [x0, y0] = [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1]))]
  const [x1, y1] = [Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]
  return {
    members: members.map(({ part, m }) => ({ part, m: mul(shift(-x0, -y0), m) })),
    w: x1 - x0,
    h: y1 - y0,
  }
}

/**
 * Pieces that sit one round another on the board (a hub, rings 1 and 2),
 * printed as they sit: their own gaps apart, centred together.
 */
function concentric(parts: string[], mesh: MeshOf): Unit {
  const radii = parts
    .map(part => {
      const r = built(mesh(part)).map(([x, y]) => Math.hypot(x, y))
      return { part, lo: Math.min(...r), hi: Math.max(...r) }
    })
    .sort((a, b) => a.lo - b.lo)
  radii.slice(1).forEach((o, k) => {
    if (o.lo - radii[k].hi < 1) throw new Error(`${o.part} does not clear ${radii[k].part}`)
  })
  return settle(
    parts.map(part => ({ part, m: shift(mesh(part).lo[0], mesh(part).lo[1]) })),
    mesh
  )
}

/**
 * The segments of one ring, each turned about the well's centre to face
 * the same way (its middle toward +y) and stacked one over the next, the
 * widest at the bottom, each moved up just enough that its inner edge, its
 * ends included, keeps `gap` off the outer edge below it.
 */
function nested(parts: string[], mesh: MeshOf, gap: number): Unit {
  const arcs = parts
    .map(part => {
      const pts = built(mesh(part))
      const mid = Math.atan2(
        pts.reduce((s, p) => s + p[1], 0),
        pts.reduce((s, p) => s + p[0], 0)
      )
      const r = pts.map(([x, y]) => Math.hypot(x, y))
      const span = Math.max(
        ...pts.map(([x, y]) =>
          Math.abs(Math.atan2(Math.sin(Math.atan2(y, x) - mid), Math.cos(Math.atan2(y, x) - mid)))
        )
      )
      return { part, mid, lo: Math.min(...r), hi: Math.max(...r), span }
    })
    .sort((a, b) => b.span - a.span)
  let up = 0
  return settle(
    arcs.map((a, k) => {
      if (k > 0) {
        const below = arcs[k - 1]
        // The inner circle, moved up by d, clears the outer one below by the gap out to the arc's ends.
        const d =
          -a.lo * Math.cos(a.span) +
          Math.sqrt((below.hi + gap) ** 2 - (a.lo * Math.sin(a.span)) ** 2)
        up += Math.max(d, gap / Math.sin(a.span))
      }
      return {
        part: a.part,
        m: mul(
          shift(0, up),
          mul(spin(90 - (a.mid * 180) / Math.PI), shift(mesh(a.part).lo[0], mesh(a.part).lo[1]))
        ),
      }
    }),
    mesh
  )
}

/** A plate's entries as [part, copies], whatever their layout. */
export function counts(plate: Plate): [string, number][] {
  return plate.parts.flatMap((e): [string, number][] =>
    Array.isArray(e) ? [[e[0], e[1]]] : (e.concentric ?? e.nested).map(part => [part, e.n])
  )
}

/** Lay out every plate and write its beds; returns what was written, for the sheet. */
export function buildPlates() {
  checkBoard()
  rmSync('out/plates', { recursive: true, force: true })
  mkdirSync('out/plates', { recursive: true })
  const meshes = new Map<string, Mesh>()
  const mesh: MeshOf = part =>
    meshes.get(part) ?? meshes.set(part, readStl(`out/${part}.stl`)).get(part)!
  const { x: W, y: H, margin, gap } = BED
  const written: {
    plate: Plate
    file: string
    pieces: number
    used: [number, number]
    gap: number
  }[] = []
  for (const plate of plates) {
    // The units packed: a piece, a body of a "loose" set of inlays (laid out
    // as they go on, so packed one by one), or pieces laid out together.
    const single = (part: string): Unit => ({
      members: [{ part, m: I }],
      w: mesh(part).size[0],
      h: mesh(part).size[1],
    })
    const units = plate.parts.flatMap(e => {
      const n = Array.isArray(e) ? e[1] : e.n
      let one: Unit[]
      if (!Array.isArray(e))
        one = e.concentric ? [concentric(e.concentric, mesh)] : [nested(e.nested, mesh, BED.nest)]
      else if (e[2] === 'loose')
        one = loose(mesh(e[0])).map((m, k) => {
          meshes.set(`${e[0]}#${k + 1}`, { ...m, lo: [0, 0, 0] })
          return single(`${e[0]}#${k + 1}`)
        })
      else one = [single(e[0])]
      return Array.from({ length: n }, () => one).flat()
    })
    // A unit that fits the bed only without its margin (the board's ring 2)
    // gets a bed of its own, centred, turned if it fits only turned.
    const within = ({ w, h }: Unit, x: number, y: number) =>
      (w <= x && h <= y) || (h <= x && w <= y)
    const alone = units.flatMap((u, i) => {
      if (within(u, W - 2 * margin, H - 2 * margin)) return []
      if (!within(u, W, H))
        throw new Error(`${u.members.map(m => m.part).join(' + ')} does not fit the bed`)
      const turned = !(u.w <= W && u.h <= H)
      return [
        { g: 0, items: [{ i, x: 0, y: 0, w: turned ? u.h : u.w, h: turned ? u.w : u.h, turned }] },
      ]
    })
    const rest = units.map((u, i) => i).filter(i => !alone.some(a => a.items[0].i === i))
    // Each unit's footprint grown by half the gap, laid on a raster of the
    // bed inside its margin, largest first, at the lowest place it fits in
    // any of four turns, on the first bed it fits.
    // The widest gap that still packs onto as few beds as the least gap does, so a sparse plate spreads out.
    const packed = (g: number) => {
      const inset = margin - g / 2
      const [bw, bh] = [Math.floor((W - 2 * inset) / CELL), Math.floor((H - 2 * inset) / CELL)]
      const order = [...rest].sort((a, b) => units[b].w * units[b].h - units[a].w * units[a].h)
      const beds: ReturnType<typeof bedRaster>[] = []
      for (const i of order) {
        let spot: {
          raster: ReturnType<typeof bedRaster>
          fp: Footprint
          at: [number, number]
        } | null = null
        for (const bed of [...beds, null]) {
          const raster = bed ?? bedRaster(bw, bh)
          for (const rot of [0, 90, 180, 270]) {
            const fp = footprint(units[i], rot, g / 2, mesh)
            const at = raster.find(fp)
            if (at && (!spot || at[1] < spot.at[1] || (at[1] === spot.at[1] && at[0] < spot.at[0])))
              spot = { raster, fp, at }
          }
          if (spot) {
            if (!bed) beds.push(raster)
            break
          }
        }
        if (!spot)
          throw new Error(`${units[i].members.map(m => m.part).join(' + ')} does not fit the bed`)
        const { raster, fp, at } = spot
        raster.take(fp, at[0], at[1])
        // The unit's box on the bed, without the half gap round it.
        const [x, y] = [inset + at[0] * CELL, inset + at[1] * CELL]
        const box = [x + g / 2, y + g / 2, x + fp.w * CELL - g / 2, y + fp.h * CELL - g / 2]
        raster.placed.push({ i, place: mul(shift(x, y), fp.M), box })
      }
      return beds.map(r => ({ g, items: r.placed }))
    }
    const tight = packed(gap)
    const soloBeds = alone.map(({ items: [{ i, turned }] }) => {
      const fp = footprint(units[i], turned ? 90 : 0, 0, mesh)
      const [sw, sh] = fp.size
      const [x, y] = [(W - sw) / 2, (H - sh) / 2]
      return { g: 0, items: [{ i, place: mul(shift(x, y), fp.M), box: [x, y, x + sw, y + sh] }] }
    })
    const beds = [
      ...(SPREAD.map(packed).find(p => p.length === tight.length) ?? tight),
      ...soloBeds,
    ]
    beds.forEach(({ g, items }, b) => {
      // Centre what was placed on the bed.
      const lo = [Math.min(...items.map(r => r.box[0])), Math.min(...items.map(r => r.box[1]))]
      const hi = [Math.max(...items.map(r => r.box[2])), Math.max(...items.map(r => r.box[3]))]
      const [ux, uy] = [hi[0] - lo[0], hi[1] - lo[1]]
      const centre = shift((W - ux) / 2 - lo[0], (H - uy) / 2 - lo[1])
      const byPart = new Map<string, Place[]>()
      for (const r of items)
        for (const { part, m } of units[r.i].members) {
          if (!byPart.has(part)) byPart.set(part, [])
          byPart.get(part)!.push(mul(centre, mul(r.place, m)))
        }
      const pieces = [...byPart].map(([part, at]) => ({
        name: part.split('/').pop()!,
        mesh: mesh(part),
        at,
      }))
      const colour = (COLOUR as Record<string, string>)[plate.colour] ?? COLOUR.grey
      const file = `out/plates/${plate.id}${beds.length > 1 ? `-${b + 1}` : ''}.3mf`
      writeFileSync(
        file,
        zipSync({
          '[Content_Types].xml': strToU8(CONTENT_TYPES),
          '_rels/.rels': strToU8(RELS),
          '3D/3dmodel.model': strToU8(model(pieces, colour)),
        })
      )
      written.push({
        plate,
        file,
        pieces: pieces.reduce((n, p) => n + p.at.length, 0),
        used: [ux, uy],
        gap: g,
      })
    })
  }
  return written
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const w of buildPlates())
    console.log(
      `${w.file}: ${w.pieces} pieces, ${w.used.map(v => v.toFixed(0)).join(' x ')} mm, ${w.gap} mm apart`
    )
}
