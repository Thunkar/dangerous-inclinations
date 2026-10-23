/**
 * The station that orbits each planet, built in the yard that builds the
 * ships, and printed from the same geometry (`cad/pieces/station.ts`), so the
 * board's station and the table's are one piece.
 *
 * A spindle: a spine standing on a foot in its sector, a habitat drum low on
 * it, three radiator wings canted up off it, a dish on its top, and three
 * docking arms climbing out of it at 45 degrees to clamps. **Moored ships
 * ride on the clamps**, one each, lying tangent to the station: at the table
 * a ship token drops into a clamp, and lifting the station to advance it
 * carries whoever is moored.
 *
 * **Modelled in millimetres, drawn in board units.** Every size below is the
 * print's; `root` scales it by `UNITS_PER_MM`, at which a token's length is a
 * hull's. Axes as the board's: y up, x along the ring, z across it, the foot
 * on y = 0.
 *
 * It prints in one piece, upright on its foot: the spine and the drum turn
 * in and out at 45 degrees, the arms climb at 45 and flare at 45 into the
 * clamps, and the radiators stand at 55 degrees off the spine, so nothing
 * hangs; lights and windows are the game's alone.
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
  type BufferGeometry,
  type Material,
} from 'three'
import { armoredSection } from './loft'
import { HULL_INK } from './palette'
import { boxSolid, cylinderSolid, extrudeSolid } from './parts'
import { bake, describe } from './solid'

type V2 = [number, number]
type V3 = [number, number, number]

/** The ship token a clamp holds (`cad/pieces/token.ts`), and the room round it. */
const TOKEN = { long: 21, wide: 7.5 }
const ROOM = 0.3

/** Board units per millimetre: a token's 21 mm is a hull's 40 units. */
export const UNITS_PER_MM = 40 / TOKEN.long

/** The foot on the board: octagonal, across its flats. */
const FOOT = { across: 13, high: 1.6, chamfer: 0.6 }
/** The spine and the drum, as [radius, height] up the station's axis. */
const SPINE: V2[] = [
  [2.2, FOOT.high - 0.1],
  [2.2, 2.4],
  [4.8, 5.6],
  [4.8, 8],
  [2.2, 10.6],
  [2.2, 15],
  [1.6, 15.6],
  [1.6, 19.6],
  [0.8, 20.4],
]
/** The docking arms: how many, how thick, and where their clamps stand (radius, floor). */
const ARM = { count: 3, half: [1.5, 1.8] as V2, at: 12, floor: 18 }
/** A clamp: a lip either side of the token, as long along it as holds it level. */
const CLAMP = { lip: 1.2, high: 1.6, long: 8 }
/** The radiators: where they leave the spine, how long and wide, and how far they are canted up from flat. */
const RADIATOR = { from: 10.4, long: 9, wide: 6.4, thick: 0.8, cant: 55 }

/** The angle of arm i round the station from +x, in the board's (x, z) plane: the first points across the ring. */
function armAngle(i: number): number {
  return Math.PI / 2 + (i / ARM.count) * Math.PI * 2
}

/** Where the berths are in board units over the foot, and each one's heading: tangent to the station. */
export const STATION_BERTHS = Array.from({ length: ARM.count }, (_, i) => {
  const a = armAngle(i)
  return {
    x: Math.cos(a) * ARM.at * UNITS_PER_MM,
    z: Math.sin(a) * ARM.at * UNITS_PER_MM,
    y: ARM.floor * UNITS_PER_MM,
    heading: a + Math.PI / 2,
  }
})

export interface StationModel {
  root: Group
  dispose: () => void
}

/** A closed [radius, height] outline turned round y, faceted: described. */
function lathe(profile: V2[], segments = 32): BufferGeometry {
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
function band(r: number, y0: number, y1: number): BufferGeometry {
  return light(
    lathe([
      [r - 0.05, y0],
      [r + 0.06, y0],
      [r + 0.06, y1],
      [r - 0.05, y1],
    ])
  )
}

/**
 * The yard's clipped section stood upright: [height, half out, half across,
 * distance out] with "out" along +x, so leaning sections make a leaning arm.
 */
function column(sections: [number, number, number, number][]): BufferGeometry {
  const geometry = armoredSection(sections.map(([y, hx, hz, out]) => [y, hx, hz, -out]))
  return bake(geometry, new Matrix4().makeRotationZ(Math.PI / 2))
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
  /** A mesh in `parent` (a group turned round the axis, or the body). */
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
  /** A group turned to angle a round the axis: its +x points out that way. */
  const toward = (name: string, a: number) => {
    const g = new Group()
    g.name = name
    g.rotation.y = -a
    body.add(g)
    return g
  }

  // The foot: an octagon on the board, flats along and across the ring.
  const radius = FOOT.across / 2 / Math.cos(Math.PI / 8)
  const cut = FOOT.chamfer / Math.cos(Math.PI / 8)
  const flat = FOOT.high - FOOT.chamfer
  const eighth: V3 = [0, Math.PI / 8, 0]
  put(
    body,
    'station_foot',
    cylinderSolid(radius, radius, flat, 8),
    m.dark,
    [0, flat / 2, 0],
    eighth
  )
  put(
    body,
    'station_foot_chamfer',
    cylinderSolid(radius - cut, radius, FOOT.chamfer, 8),
    m.dark,
    [0, flat + FOOT.chamfer / 2, 0],
    eighth
  )

  // The spine and the drum, turned; the drum's windows and the planet's
  // stripe round it, a copper collar under the radiators.
  const top = SPINE.at(-1)![1]
  put(body, 'station_spine', lathe([[0, SPINE[0][1]], ...SPINE, [0, top]]), m.hull)
  put(body, 'station_drum_windows_low', band(4.8, 5.85, 6.25), m.cyan)
  put(body, 'station_drum_stripe', band(4.8, 6.4, 6.75), m.identity)
  put(body, 'station_drum_windows_high', band(4.8, 6.9, 7.4), m.cyan)
  put(body, 'station_collar', band(2.2, RADIATOR.from - 0.9, RADIATOR.from - 0.3), m.copper)
  put(body, 'station_mast_windows', band(1.6, 16.4, 17.2), m.cyan)
  // The dish on the spine's top, opening up at 45 degrees, and its feed.
  put(
    body,
    'station_dish',
    lathe([
      [0, top - 0.4],
      [0.9, top - 0.4],
      [3, top + 2],
      [3, top + 2.4],
      [2.4, top + 2.4],
      [0, top + 0.1],
    ]),
    m.pale
  )
  put(body, 'station_dish_feed', cylinderSolid(0.25, 0.45, 2.6, 6), m.steel, [0, top + 1.3, 0])
  put(body, 'station_beacon', light(boxSolid([0.6, 0.6, 0.6])), m.warn, [0, top + 2.9, 0])

  // The docking arms: out of the spine low in the drum, climbing at 45
  // degrees, flaring at 45 into the clamps; the token lies tangent.
  const [hx, hz] = ARM.half
  const halfOut = TOKEN.wide / 2 + ROOM + CLAMP.lip
  const half = CLAMP.long / 2
  // Every face that looks down stands at 50 degrees, not 45: a print reads 45 as an overhang.
  const STEEP = 1.2
  const step = 0.65
  const flare = Math.max(halfOut - step - hx, half - step - hz) * STEEP + 0.8 + 0.05
  const under = ARM.floor - 0.4 - flare
  const start = 1.8
  const climb = (ARM.at - start) * STEEP
  const clip = Math.min(halfOut, half) * 0.35
  const lipLong = CLAMP.long - 2 * clip
  for (let i = 0; i < ARM.count; i++) {
    const g = toward(`station_arm_${i}`, armAngle(i))
    put(
      g,
      `station_arm_${i}_strut`,
      column([
        [under - climb, hx, hz, start],
        [under, hx, hz, ARM.at],
      ]),
      m.pale
    )
    // A dark stripe up the strut's crown.
    const stripe = column([
      [under - climb + 1, 0.08, hz * 0.5, start + 1 + hx],
      [under, 0.08, hz * 0.5, ARM.at + hx],
    ])
    put(g, `station_arm_${i}_stripe_up`, light(stripe), m.dark)
    put(
      g,
      `station_arm_${i}_clamp`,
      column([
        [under, hx, hz, ARM.at],
        [ARM.floor - 1.2, halfOut - step, half - step, ARM.at],
        [ARM.floor - 0.4, halfOut, half, ARM.at],
        [ARM.floor, halfOut, half, ARM.at],
      ]),
      m.pale
    )
    // The clamp's collar: a dark band round the flare's top.
    put(
      g,
      `station_arm_${i}_collar`,
      light(
        column([
          [ARM.floor - 1.2, halfOut - step + 0.05, half - step + 0.05, ARM.at],
          [ARM.floor - 0.4, halfOut + 0.05, half + 0.05, ARM.at],
        ])
      ),
      m.dark
    )
    // The clamp's bed and lips, short of its clipped corners, lights along the lips.
    put(
      g,
      `station_arm_${i}_bed`,
      light(boxSolid([2 * (halfOut - CLAMP.lip), 0.1, lipLong])),
      m.dark,
      [ARM.at, ARM.floor + 0.05, 0]
    )
    for (const s of [-1, 1]) {
      const x = ARM.at + s * (halfOut - CLAMP.lip / 2)
      put(g, `station_arm_${i}_lip_${s}`, boxSolid([CLAMP.lip, CLAMP.high, lipLong]), m.steel, [
        x,
        ARM.floor + CLAMP.high / 2,
        0,
      ])
      put(g, `station_arm_${i}_lights_${s}`, light(boxSolid([0.3, 0.15, lipLong - 1])), m.cyan, [
        x,
        ARM.floor + CLAMP.high + 0.07,
        0,
      ])
    }
    // The planet's colour on the clamp's outer face.
    put(
      g,
      `station_arm_${i}_stripe`,
      light(boxSolid([0.1, 0.3, 2 * half - 2 * clip])),
      m.identity,
      [ARM.at + halfOut + 0.05, ARM.floor - 0.2, 0]
    )
  }

  // The radiators, between the arms: a panel canted up off the spine, ribs
  // across its upper face and fins down its underside, copper headers down
  // both edges, a coolant line down its inner edge.
  const cant = (RADIATOR.cant * Math.PI) / 180
  const { long, wide, thick } = RADIATOR
  for (let i = 0; i < ARM.count; i++) {
    const g = toward(`station_radiator_${i}`, armAngle(i) + Math.PI / ARM.count)
    const panel = new Group()
    panel.name = `station_radiator_${i}_panel`
    panel.position.set(1.4, RADIATOR.from, 0)
    panel.rotation.z = cant
    g.add(panel)
    // Everything on the panel starts `sunk` behind its root, well inside the drum.
    const sunk = 1.5
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
    // Ribs across the upper face, each a ramp up from the spine's side and
    // square on the tip's: a square face toward the spine would look down.
    const rib = new Shape()
    rib.moveTo(-0.45, 0)
    rib.lineTo(0.35, 0)
    rib.lineTo(0.35, 0.5)
    rib.lineTo(0.05, 0.5)
    rib.closePath()
    for (let k = 0; k < 6; k++) {
      const geometry = extrudeSolid(rib, { depth: wide - 0.8, bevelEnabled: false })
      bake(geometry, new Matrix4().makeTranslation(0, 0, -(wide - 0.8) / 2))
      put(panel, `station_radiator_${i}_rib_${k}`, geometry, m.steel, [
        2 + k * 1.35,
        thick / 2 - 0.02,
        0,
      ])
    }
    for (const s of [-1, 1])
      put(
        panel,
        `station_radiator_${i}_header_${s}`,
        cylinderSolid(0.4, 0.4, long - 0.4 + sunk, 8),
        m.copper,
        [(long - sunk) / 2 + 0.2, 0.15, s * (wide / 2)],
        [0, 0, Math.PI / 2]
      )
    put(panel, `station_radiator_${i}_coolant`, light(boxSolid([long - 1.5, 0.12, 0.3])), m.cyan, [
      long / 2 + 0.5,
      thick / 2 + 0.06,
      wide / 2 - 0.7,
    ])
    // Heat-sink fins down the underside, from the spine to the tip: they run
    // along the panel, so nothing on the underside faces the spine.
    for (let k = 0; k < 5; k++)
      put(
        panel,
        `station_radiator_${i}_fin_${k}`,
        boxSolid([long - 0.6 + sunk, 1.2, 0.45]),
        m.steel,
        [(long - 0.6 - sunk) / 2, -thick / 2 - 0.55, (k - 2) * ((wide - 1.2) / 4)]
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
