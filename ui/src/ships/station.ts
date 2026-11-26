/**
 * The station that orbits each planet, built in the yard that builds the
 * ships, and printed from the same geometry (`cad/pieces/station.ts`), so the
 * board's station and the table's are one piece.
 *
 * A stem stands on a foot in the station's sector, and the habitat ring
 * sits low round it on four broad spokes, just over the board's sector walls.
 * Over the ring a straight truss crosses the stem along the ring, out to the
 * far walls of the sectors either side (measured along x at the ring's
 * centre line). That is the docking reach (`STATION_REACH`, the engine's
 * `DOCKING_REACH`): a ship that ends its turn on the station's ring within
 * one sector of it docks, and stays on its own sector. The truss is straight
 * and does not follow the ring's curve, so the end cradles' inner tokens
 * overhang the ring's inner edge. A drum where the truss crosses the stem
 * carries the mast, two radiators along the truss and the dish.
 *
 * **Moored ships ride on six berths**: a cradle over each of the three
 * sectors, a berth either side of the truss (the ring's inner and outer
 * side), every token tangent, nose prograde, and nothing over any of them,
 * so a token drops in from above. At the ends the truss is the berths'
 * shared inner lip; in the middle the drum is. A berth takes the ship token
 * (`cad/pieces/token.ts`): a lip either side `ROOM` off the token's widest,
 * a floor `CLAMP.long` along it. The truss stands high enough that a token
 * on the board under it, on the next sector, clears it.
 *
 * **Modelled in millimetres, drawn in board units.** Every size below is the
 * print's; `root` scales it by `UNITS_PER_MM`, at which a token's length is a
 * hull's. Axes as the board's: y up with the foot on y = 0, x along the ring
 * (+x prograde), z across it with the planet's centre toward -z.
 *
 * **It prints in three parts and the plugs, each in the pose it stands in**
 * (`cad/pieces/station.ts`), so the 50-degree rule is read off the model as
 * drawn:
 *
 * - `station_stem`: the foot, the stem and its shoulder (flaring out at 52
 *   degrees), and a hexagonal peg up the middle; upright on the foot.
 * - `station_habitat`: the ring (twelve clipped segments), its four broad
 *   spokes and the hub; flat on the underside of the ring, spokes and hub.
 *   A hex bore through the hub drops it over the peg onto the shoulder.
 * - `station_truss`: the drum, the beam (a Warren truss in the vertical
 *   plane, diagonals at 60 degrees, the top chord bridging under 4 mm
 *   between nodes), the three cradles, the end posts, and the mast,
 *   radiators and dish on the drum; flat on its underside. A hex socket in
 *   the drum (its roof a bridge under 5 mm) drops onto the peg's top, and
 *   the drum rests on the hub. Each berth's 4x2 magnet slides into a slot
 *   from the cradle's outer face, `BERTH.seal` under the floor, behind a
 *   glued plug.
 *
 * The habitat and the beam are glued on the peg, whose hex keys stop either
 * turning, so lifting the station by its mast carries it whole, and the
 * moored ships on their magnets. The bores, socket and magnet slots are the
 * print's cuts and are not drawn; lights and windows are the game's alone.
 */
import {
  Color,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Shape,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three'
import { DOCKING_REACH } from '@dangerous-inclinations/engine'
import { hullOf, type Half } from './engines'
import { HULL_INK } from './palette'
import { boxSolid, cylinderSolid, extrudeSolid } from './parts'
import { bake, describe, solidOf } from './solid'

type V2 = [number, number]
type V3 = [number, number, number]

/** The ship token a berth holds (`cad/pieces/token.ts`), and the room round it. */
export const TOKEN = { long: 21, wide: 7.5 }
export const ROOM = 0.3
/** A berth's clamp: a lip either side of the token, as long along it as holds it level. */
export const CLAMP = { lip: 1.2, high: 1.6, long: 8 }

/** Board units per millimetre: a token's 21 mm is a hull's 40 units. */
export const UNITS_PER_MM = 40 / TOKEN.long

/** Planet ring 2 on the printed board (`cad/spec.ts` BOARD): centre radius, width, sectors. */
export const RING_MM = { radius: 92, width: 20, sectors: 24 }
export const SECTOR_ANGLE = (2 * Math.PI) / RING_MM.sectors
/** How many sectors either side of its own the station reaches: the sectors a ship docks from. */
export const STATION_REACH = DOCKING_REACH

/** The foot on the board: octagonal, across its flats. */
const FOOT = { across: 13, high: 1.6, chamfer: 0.6 }
/** Facets round every turned part: round, as the print turns it. */
const SIDES = 32
/**
 * The habitat ring, low round the stem: underside (the stem's shoulder),
 * inner and outer apothem, height, top clip; the spokes' height. Its
 * underside stands 3.6 over the board's sector walls (1.2) and clears the
 * 3D board's funnel where it rises outside ring 2; its corners (12.0 out)
 * stay inside the walls of its own sector at the ring's centre line, so it
 * clears a token on the next sector.
 */
const RING = { y: 4.8, inner: 8.4, outer: 11.6, high: 4.4, clip: 1.0, facets: 12, spoke: 1.8 }
/** The stem's shoulder the habitat's hub rests on. */
const SHOULDER = { r: 3.2 }
/**
 * The truss, over the ring: its underside (the hub's top), chord size,
 * total height, half width; narrower than the shared inner lip, so a
 * token's stern clears it along its whole length.
 */
const TRUSS = { y: 10.2, chord: 1.4, high: 5.8, half: 0.9 }
/** The habitat's hub, from the shoulder up to the truss. */
const HUB = { r: 4 }
/** The drum the beam crosses, up to the crown the mast stands on, its top clipped to 2.8. */
const DRUM = { r: 3.8, top: TRUSS.y + 7, clip: 1 }
/** The peg the habitat and beam key on (across its flats), from the shoulder up into the drum. */
const PEG = { across: 4.4, top: TRUSS.y + 3 }
/** The mast's top, over the drum. */
const MAST_TOP = DRUM.top + 7
/** The radiators: where they leave the mast, how long and wide, canted up from flat. */
const RADIATOR = { from: DRUM.top + 1.6, long: 7, wide: 5, thick: 0.8, cant: 55 }
/** The shoulder's flare, steeper than the 50 degrees a print needs. */
const FLARE = (52 * Math.PI) / 180

/** Along x, the far wall of the last sector reached at the ring's centre line: the truss's end. */
const REACH_END = RING_MM.radius * Math.sin((STATION_REACH + 0.5) * SECTOR_ANGLE)
/** Along x, that sector's centre: where the cradle stands. */
const CRADLE_AT = RING_MM.radius * Math.sin(STATION_REACH * SECTOR_ANGLE)
/** A token's centre line off the truss's at an end cradle: the inner lip, the room and half a token. */
const BERTH_OFF = CLAMP.lip + ROOM + TOKEN.wide / 2
/** A token's centre line off the truss's at the middle cradle: the drum is the inner lip there. */
const MIDDLE_OFF = DRUM.r + ROOM + TOKEN.wide / 2
/** Out from a token's centre line to its cradle's outer face: half a token, the room and the outer lip. */
const OUTER = TOKEN.wide / 2 + ROOM + CLAMP.lip
/** The cradle floor's thickness: the magnet sealed in it, with plastic under it. */
const FLOOR = 3.2

/**
 * The three cradles, each a floor across the truss with a berth either side:
 * `x` along the ring in mm, `sector` the one it stands over (its offset from
 * the station's, +1 prograde), `off` each token's centre line off the truss.
 */
const CRADLES = [-STATION_REACH, 0, STATION_REACH].map(sector => ({
  sector,
  x: Math.sign(sector) * CRADLE_AT,
  off: sector === 0 ? MIDDLE_OFF : BERTH_OFF,
}))

/** A place on the station a moored ship rides, in board units over the foot. */
export interface StationBerth {
  x: number
  y: number
  z: number
  /** The token's heading round y: 0 lies along +x, prograde. */
  heading: number
  /** The sector it stands over, as an offset from the station's: 0, or ±`STATION_REACH`. */
  sector: number
}

/**
 * The six berths, two to a cradle, retrograde to prograde, the inner side
 * (toward the planet, -z) of each cradle first. The end cradles' inner tokens
 * overhang the ring's inner edge.
 */
export const STATION_BERTHS: StationBerth[] = CRADLES.flatMap(({ sector, x, off }) =>
  [-1, 1].map(side => ({
    x: x * UNITS_PER_MM,
    y: (TRUSS.y + FLOOR) * UNITS_PER_MM,
    z: side * off * UNITS_PER_MM,
    heading: 0,
    sector,
  }))
)

/** Half a board hull's beam (26, `three/scene/Ships.tsx`) and a unit of air; the crowd's step (`board/geometry.ts`). */
const BESIDE = { clear: 14, step: 30 }

/**
 * Where the board stands the `index`th ship (in seat order) moored over
 * sector offset `sector` of the station: that cradle's berths, inner then
 * outer; then, one ship too many, on the ring beside the cradle on its
 * inner side, half a hull's beam and some air off the cradle's face and a
 * crowd's step further in for each ship more.
 */
export function mooringSpot(sector: number, index: number): StationBerth {
  const berths = STATION_BERTHS.filter(b => b.sector === sector)
  if (index < berths.length) return berths[index]
  const cradle = CRADLES.find(c => c.sector === sector)!
  return {
    x: cradle.x * UNITS_PER_MM,
    y: 0,
    z: -(
      (cradle.off + OUTER) * UNITS_PER_MM +
      BESIDE.clear +
      (index - berths.length) * BESIDE.step
    ),
    heading: 0,
    sector,
  }
}

export interface StationModel {
  root: Group
  dispose: () => void
}

/**
 * Where the board lays a row of marks on the station, mm: along the prograde
 * arm's top chord from the node out, open from above between the berths.
 */
export const STATION_TOP_CHORD = { y: TRUSS.y + TRUSS.high, from: 6.2 }

/** What the print needs to know of the station, in mm, in the game's frame (y up, the foot at 0). */
export const STATION_PRINT = {
  ringY: RING.y,
  trussY: TRUSS.y,
  floorY: TRUSS.y + FLOOR,
  /** Each cradle: along the ring, each token's centre line off the truss, and its outer faces. */
  cradles: CRADLES.map(({ x, off }) => ({ x, off, half: off + OUTER })),
  peg: PEG,
}

/** A closed [radius, height] outline turned round y: described. */
function lathe(profile: V2[], segments = SIDES): BufferGeometry {
  const points = [...profile, profile[0]].map(([r, y]) => new Vector2(r, y))
  return describe(new LatheGeometry(points, segments), {
    kind: 'lathe',
    profile: profile.map(p => [...p] as V2),
  })
}

/** What the game draws and the print leaves off: lights, windows, stripes. */
function light(geometry: BufferGeometry): BufferGeometry {
  return describe(geometry, { kind: 'detail' })
}

/** A band round a face at radius r from y0 to y1: a light, a window, a stripe. */
function band(r: number, y0: number, y1: number, segments = SIDES): BufferGeometry {
  return light(
    lathe(
      [
        [r - 0.05, y0],
        [r + 0.06, y0],
        [r + 0.06, y1],
        [r - 0.05, y1],
      ],
      segments
    )
  )
}

/**
 * A bar along x from x0 to x1, flat underneath from y = 0, its top corners
 * clipped: the yard's section with nothing that looks down, so it prints
 * standing on its underside or bridging on it.
 */
function bar(x0: number, x1: number, hw: number, h: number, clip = Math.min(hw, h) * 0.35) {
  const profile = new Shape()
  profile.moveTo(-hw, 0)
  profile.lineTo(hw, 0)
  profile.lineTo(hw, h - clip)
  profile.lineTo(hw - clip, h)
  profile.lineTo(-hw + clip, h)
  profile.lineTo(-hw, h - clip)
  profile.closePath()
  const geometry = extrudeSolid(profile, { depth: x1 - x0, bevelEnabled: false })
  return bake(
    geometry,
    new Matrix4().makeTranslation(x0, 0, 0).multiply(new Matrix4().makeRotationY(Math.PI / 2))
  )
}

/**
 * One facet of the habitat ring, centred on +x: the ring's section (flat
 * underneath, its top corners clipped) pulled along the facet and mitred at
 * half a facet's angle either side. Drawn from its bounding planes, printed
 * as the section's extrusion less the far side of each mitre.
 */
function ringSegment(): BufferGeometry {
  const { inner: ai, outer: ao, y, high: h, clip: c, facets } = RING
  const half = Math.PI / facets
  const shape = new Shape()
  shape.moveTo(ai, y)
  shape.lineTo(ao, y)
  shape.lineTo(ao, y + h - c)
  shape.lineTo(ao - c, y + h)
  shape.lineTo(ai + c, y + h)
  shape.lineTo(ai, y + h - c)
  shape.closePath()
  const depth = 2 * ao * Math.tan(half) + 2
  const solid = extrudeSolid(shape, { depth, bevelEnabled: false })
  bake(solid, new Matrix4().makeTranslation(0, 0, -depth / 2))
  const s2 = Math.SQRT1_2
  const plane = (n: V3, d: number): Half => ({ n: new Vector3(...n), d })
  const mitres = [
    plane([-Math.sin(half), 0, Math.cos(half)], 0),
    plane([-Math.sin(half), 0, -Math.cos(half)], 0),
  ]
  const geometry = hullOf([
    plane([0, -1, 0], -y),
    plane([0, 1, 0], y + h),
    plane([1, 0, 0], ao),
    plane([-1, 0, 0], -ai),
    plane([s2, s2, 0], (ao + y + h - c) * s2),
    plane([-s2, s2, 0], (-ai + y + h - c) * s2),
    ...mitres,
  ])
  describe(geometry, {
    kind: 'clipped',
    solid: solidOf(solid)!,
    planes: mitres.map(({ n, d }) => ({
      normal: n.toArray() as V3,
      at: n.clone().multiplyScalar(d).toArray() as V3,
    })),
  })
  solid.dispose()
  return geometry
}

/**
 * One station, in the planet's colour where the board's camera looks. Plain
 * three.js, as the missile is: the caller mounts `root` and calls `dispose()`.
 */
export function createStation(identity: string): StationModel {
  const root = new Group()
  root.name = 'station'
  const body = new Group()
  body.name = 'station_body'
  body.scale.setScalar(UNITS_PER_MM)
  root.add(body)

  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const material = (name: string, color: string, metalness: number, emissive = 0) => {
    const made = new MeshStandardMaterial({
      color,
      roughness: 0.52,
      metalness,
      flatShading: true,
      emissive: new Color(color),
      emissiveIntensity: emissive,
    })
    made.name = name
    materials.add(made)
    return made
  }
  const m = {
    hull: material('hull', HULL_INK.paint, 0.35),
    pale: material('pale', '#ece5d3', 0.25),
    dark: material('dark', HULL_INK.dark, 0.65),
    steel: material('steel', HULL_INK.steel, 0.75),
    copper: material('copper', HULL_INK.copper, 0.72),
    cyan: material('cyan', HULL_INK.cyan, 0.3, 1.2),
    warn: material('red', HULL_INK.warn, 0.1, 0.8),
    identity: material('identity', identity, 0.3, 0.6),
  }
  const put = (
    parent: Group,
    name: string,
    geometry: BufferGeometry,
    mat: Material,
    at: V3 = [0, 0, 0],
    rot: V3 = [0, 0, 0]
  ) => {
    geometries.add(geometry)
    const mesh = new Mesh(geometry, mat)
    mesh.name = name
    mesh.position.set(...at)
    mesh.rotation.set(...rot)
    parent.add(mesh)
    return mesh
  }
  /** A group turned to `heading` round y: its +x points along (cos, sin) of it in (x, z). */
  const group = (parent: Group, name: string, heading = 0) => {
    const g = new Group()
    g.name = name
    g.rotation.y = -heading
    parent.add(g)
    return g
  }

  // ---- The stem: foot, stem, shoulder and the peg the other two parts key on.
  const stem = group(body, 'station_stem')
  const radius = FOOT.across / 2 / Math.cos(Math.PI / 8)
  const cut = FOOT.chamfer / Math.cos(Math.PI / 8)
  const flat = FOOT.high - FOOT.chamfer
  const eighth: V3 = [0, Math.PI / 8, 0]
  put(
    stem,
    'station_foot',
    cylinderSolid(radius, radius, flat, 8),
    m.dark,
    [0, flat / 2, 0],
    eighth
  )
  put(
    stem,
    'station_foot_chamfer',
    cylinderSolid(radius - cut, radius, FOOT.chamfer, 8),
    m.dark,
    [0, flat + FOOT.chamfer / 2, 0],
    eighth
  )
  const flare = (SHOULDER.r - 2.4) * Math.tan(FLARE)
  put(
    stem,
    'station_stem_column',
    lathe([
      [0, FOOT.high - 0.1],
      [2.4, FOOT.high - 0.1],
      [2.4, RING.y - 0.4 - flare],
      [SHOULDER.r, RING.y - 0.4],
      [SHOULDER.r, RING.y],
      [0, RING.y],
    ]),
    m.hull
  )
  put(stem, 'station_stem_collar', band(2.4, 1.9, 2.3), m.copper)
  const pegR = PEG.across / 2 / Math.cos(Math.PI / 6)
  put(stem, 'station_stem_peg', cylinderSolid(pegR, pegR, PEG.top - RING.y, 6), m.steel, [
    0,
    (RING.y + PEG.top) / 2,
    0,
  ])

  // ---- The truss: the drum, the beam, the cradles, an end post at each end,
  // and over the drum the mast, its radiators and the dish.
  const truss = group(body, 'station_truss')
  const y0 = TRUSS.y
  put(
    truss,
    'station_drum',
    lathe([
      [0, y0],
      [DRUM.r, y0],
      [DRUM.r, DRUM.top - DRUM.clip],
      [DRUM.r - DRUM.clip, DRUM.top],
      [0, DRUM.top],
    ]),
    m.hull
  )
  put(truss, 'station_drum_windows', band(DRUM.r, DRUM.top - 2.9, DRUM.top - 2.3), m.cyan)
  put(truss, 'station_drum_collar', band(DRUM.r, DRUM.top - 1.6, DRUM.top - 1.1), m.copper)
  // The node where the beam crosses the drum: the truss reads through.
  put(truss, 'station_node', bar(-5.4, 5.4, 2.0, TRUSS.high + 0.4, 0.9), m.pale, [0, y0, 0])

  const top = y0 + TRUSS.high
  const lower = y0 + TRUSS.chord / 2
  const upper = top - TRUSS.chord / 2
  const rise = upper - lower
  const run = rise / Math.tan(Math.PI / 3)
  const floorTop = y0 + FLOOR
  const postEnd = REACH_END
  const postLong = 3
  const postHigh = TRUSS.high + 1.6
  const chordEnd = postEnd - postLong + 0.3
  // The floor's ends are clipped: the lips stand on what is left of its top.
  const floorClip = 0.8
  const lipLong = CLAMP.long - 2 * floorClip
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'pro' : 'retro'
    const arm = group(truss, `station_arm_${tag}`, s > 0 ? 0 : Math.PI)
    for (const [k, y] of [y0, top - TRUSS.chord].entries())
      put(
        arm,
        `station_arm_${tag}_chord_${k ? 'high' : 'low'}`,
        bar(3, chordEnd, TRUSS.half, TRUSS.chord),
        m.pale,
        [0, y, 0]
      )
    // A dark stripe along the top chord's crown.
    put(
      arm,
      `station_arm_${tag}_crown`,
      light(boxSolid([chordEnd - DRUM.r - 2, 0.06, 0.6])),
      m.dark,
      [(chordEnd + DRUM.r + 2) / 2, top + 0.03, 0]
    )
    // Warren diagonals at 60 degrees, node to node, from the node block to the post.
    const length = rise / Math.sin(Math.PI / 3) + 0.6
    const first = 5.4 - run / 2
    const count = Math.floor((chordEnd - 0.6 - first) / run)
    for (let k = 0; k < count; k++) {
      const x = first + (k + 0.5) * run
      const lean = k % 2 === 0 ? Math.PI / 3 : -Math.PI / 3
      put(
        arm,
        `station_arm_${tag}_diagonal_${k}`,
        boxSolid([length, 1.0, 1.6]),
        m.steel,
        [x, (lower + upper) / 2, 0],
        [0, 0, lean]
      )
    }

    // The end post at the reach, on the far wall of sector ±1: a dark block
    // as wide as the truss (the tokens lie either side of it), a red light on top.
    put(
      arm,
      `station_post_${tag}`,
      bar(postEnd - postLong, postEnd, TRUSS.half, postHigh, 0.6),
      m.dark,
      [0, y0, 0]
    )
    put(arm, `station_post_${tag}_beacon`, light(boxSolid([1.2, 0.12, 1.2])), m.warn, [
      postEnd - postLong / 2,
      y0 + postHigh + 0.06,
      0,
    ])
    put(arm, `station_post_${tag}_band`, light(boxSolid([0.1, 0.5, 1.6])), m.cyan, [
      postEnd + 0.05,
      top - 0.6,
      0,
    ])
  }

  // The cradles, one over each sector the station reaches: a floor across the
  // truss with a berth either side and an outer lip each. Between the berths
  // the truss (at the ends) or the drum (in the middle) is their inner lip, a
  // lip a berth squared off back to back.
  for (const { sector, x, off } of CRADLES) {
    const tag = sector > 0 ? 'pro' : sector < 0 ? 'retro' : 'middle'
    const half = off + OUTER
    const floor = bar(-half, half, CLAMP.long / 2, FLOOR, floorClip)
    put(truss, `station_cradle_${tag}`, floor, m.pale, [x, y0, 0], [0, Math.PI / 2, 0])
    put(
      truss,
      `station_cradle_${tag}_spine`,
      boxSolid([lipLong, CLAMP.high, 2 * (off - TOKEN.wide / 2 - ROOM)]),
      m.steel,
      [x, floorTop + CLAMP.high / 2, 0]
    )
    for (const side of [1, -1]) {
      const name = `station_cradle_${tag}_${side > 0 ? 'outer' : 'inner'}`
      put(truss, `${name}_bed`, light(boxSolid([lipLong - 0.4, 0.1, TOKEN.wide - 0.4])), m.dark, [
        x,
        floorTop + 0.05,
        side * off,
      ])
      const lipZ = side * (half - CLAMP.lip / 2)
      put(truss, `${name}_lip`, boxSolid([lipLong, CLAMP.high, CLAMP.lip]), m.steel, [
        x,
        floorTop + CLAMP.high / 2,
        lipZ,
      ])
      put(truss, `${name}_lights`, light(boxSolid([lipLong - 1, 0.15, 0.3])), m.cyan, [
        x,
        floorTop + CLAMP.high + 0.07,
        lipZ,
      ])
      put(truss, `${name}_stripe`, light(boxSolid([lipLong - 0.8, 0.3, 0.1])), m.identity, [
        x,
        y0 + FLOOR / 2,
        side * (half + 0.05),
      ])
    }
  }

  // ---- Over the drum: the mast, its radiators and the dish, none of them
  // over a berth (the dish's 3 and the radiators' 2.9 either side of the
  // truss are inside the middle tokens' 4.1).
  const crown = DRUM.top
  put(
    truss,
    'station_mast',
    lathe([
      [0, crown - 0.1],
      [2.0, crown - 0.1],
      [2.0, crown + 4.2],
      [1.5, crown + 4.8],
      [1.5, MAST_TOP - 0.8],
      [0.8, MAST_TOP],
      [0, MAST_TOP],
    ]),
    m.hull
  )
  // The radiators' collar: it stands on the drum's top and takes the panels'
  // roots, whose end faces would otherwise look down at 35 degrees.
  put(
    truss,
    'station_radiator_collar',
    lathe([
      [0, crown - 0.1],
      [DRUM.r - DRUM.clip, crown - 0.1],
      [DRUM.r - DRUM.clip, crown],
      [3.2, crown + 0.4 * Math.tan(FLARE)],
      [3.2, crown + 1.9],
      [2.0, crown + 2.6],
      [0, crown + 2.6],
    ]),
    m.copper
  )
  put(truss, 'station_mast_windows', band(1.5, crown + 5.2, crown + 5.9), m.cyan)
  // The dish opens at 55 degrees: its facets stay steeper than the 50 a print needs.
  const dishRim = 2.1 * Math.tan((55 * Math.PI) / 180) - 0.4
  put(
    truss,
    'station_dish',
    lathe([
      [0, MAST_TOP - 0.4],
      [0.9, MAST_TOP - 0.4],
      [3, MAST_TOP + dishRim],
      [3, MAST_TOP + dishRim + 0.4],
      [2.4, MAST_TOP + dishRim + 0.4],
      [0, MAST_TOP + 0.1],
    ]),
    m.pale
  )
  put(truss, 'station_dish_feed', cylinderSolid(0.25, 0.45, 3.2, 6), m.steel, [
    0,
    MAST_TOP + 1.6,
    0,
  ])
  put(truss, 'station_beacon', light(boxSolid([0.6, 0.6, 0.6])), m.warn, [0, MAST_TOP + 3.5, 0])

  // Two radiators along the truss, canted up off the mast: they stay over the
  // truss, clear of the middle berths either side of it.
  const cant = (RADIATOR.cant * Math.PI) / 180
  const { long, wide, thick } = RADIATOR
  for (const [i, a] of [0, Math.PI].entries()) {
    const g = group(truss, `station_radiator_${i}`, a)
    const panel = new Group()
    panel.name = `station_radiator_${i}_panel`
    panel.position.set(1.2, RADIATOR.from, 0)
    panel.rotation.z = cant
    g.add(panel)
    const sunk = 1.2
    put(panel, `station_radiator_${i}_plate`, boxSolid([long + sunk, thick, wide]), m.steel, [
      (long - sunk) / 2,
      0,
      0,
    ])
    put(panel, `station_radiator_${i}_face`, light(boxSolid([long - 1, 0.1, wide - 0.8])), m.dark, [
      long / 2 + 0.3,
      thick / 2 + 0.05,
      0,
    ])
    const rib = new Shape()
    rib.moveTo(-0.45, 0)
    rib.lineTo(0.35, 0)
    rib.lineTo(0.35, 0.5)
    rib.lineTo(0.05, 0.5)
    rib.closePath()
    for (let k = 0; k < 4; k++) {
      const geometry = extrudeSolid(rib, { depth: wide - 0.8, bevelEnabled: false })
      bake(geometry, new Matrix4().makeTranslation(0, 0, -(wide - 0.8) / 2))
      put(panel, `station_radiator_${i}_rib_${k}`, geometry, m.steel, [
        2 + k * 1.4,
        thick / 2 - 0.02,
        0,
      ])
    }
    for (const side of [-1, 1])
      put(
        panel,
        `station_radiator_${i}_header_${side}`,
        cylinderSolid(0.4, 0.4, long - 0.4 + sunk, 8),
        m.copper,
        [(long - sunk) / 2 + 0.2, 0.15, side * (wide / 2)],
        [0, 0, Math.PI / 2]
      )
    put(panel, `station_radiator_${i}_coolant`, light(boxSolid([long - 1.5, 0.12, 0.3])), m.cyan, [
      long / 2 + 0.5,
      thick / 2 + 0.06,
      wide / 2 - 0.7,
    ])
    for (let k = 0; k < 4; k++)
      put(
        panel,
        `station_radiator_${i}_fin_${k}`,
        boxSolid([long - 0.6 + sunk, 1.0, 0.45]),
        m.steel,
        [(long - 0.6 - sunk) / 2, -thick / 2 - 0.45, (k - 1.5) * ((wide - 1.2) / 3)]
      )
  }

  // ---- The habitat, low round the stem: ring, spokes and hub.
  const habitat = group(body, 'station_habitat')
  const ry = RING.y
  // Twelve facets, one centred every 30 degrees from 15: a facet over each spoke.
  for (let k = 0; k < RING.facets; k++) {
    const g = group(
      habitat,
      `station_ring_${k}`,
      Math.PI / RING.facets + (k * 2 * Math.PI) / RING.facets
    )
    put(g, `station_ring_${k}_segment`, ringSegment(), m.hull)
  }
  // The bands are turned with a vertex on each mitre, so their faces lie on the facets.
  const onFacets = (apothem: number) => apothem / Math.cos(Math.PI / RING.facets)
  const ringBand = (name: string, y0: number, y1: number, mat: Material) =>
    put(habitat, name, band(onFacets(RING.outer), y0, y1, RING.facets), mat)
  ringBand('station_ring_windows_low', ry + 0.9, ry + 1.3, m.cyan)
  ringBand('station_ring_stripe', ry + 1.5, ry + 1.85, m.identity)
  ringBand('station_ring_windows_high', ry + 2.0, ry + 2.5, m.cyan)
  // A dark hatch on the ring's outer face over each spoke.
  for (let i = 0; i < 4; i++) {
    const g = group(habitat, `station_hatch_${i}`, Math.PI / 4 + (i * Math.PI) / 2)
    put(g, `station_hatch_${i}_plate`, light(boxSolid([0.1, 2.8, 2.4])), m.dark, [
      RING.outer + 0.14,
      ry + 1.9,
      0,
    ])
  }
  put(
    habitat,
    'station_hub',
    lathe([
      [0, ry],
      [HUB.r, ry],
      [HUB.r, TRUSS.y],
      [0, TRUSS.y],
    ]),
    m.hull
  )
  for (let i = 0; i < 4; i++) {
    const g = group(habitat, `station_spoke_${i}`, Math.PI / 4 + (i * Math.PI) / 2)
    put(g, `station_spoke_${i}_web`, bar(HUB.r - 1, RING.inner + 0.6, 2, RING.spoke, 0.6), m.pale, [
      0,
      ry,
      0,
    ])
    put(
      g,
      `station_spoke_${i}_stripe`,
      light(boxSolid([RING.inner - HUB.r - 0.6, 0.06, 0.8])),
      m.dark,
      [(RING.inner + HUB.r) / 2, ry + RING.spoke + 0.03, 0]
    )
  }
  return {
    root,
    dispose: () => {
      geometries.forEach(g => g.dispose())
      materials.forEach(mat => mat.dispose())
    },
  }
}
