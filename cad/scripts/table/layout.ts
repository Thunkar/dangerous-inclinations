// Lay the printed table kit out for a game state (state.json, from
// state.mjs): every printed piece as an STL in cad/out, its filament colour
// from cad/plates.mjs and a matrix from its print pose to the table. The
// table frame is in mm: x east, y north, z up, the table top at z = 0.
// Writes cad/shots/table/scene.json for render.js.
//
//   --state=<file>  lay out another state (default shots/table/state.json)
//   --out=<file>    write the scene there (default shots/table/scene.json)
//   --roll=<v>@<x>,<y>  the table's one d10 lying at (x, y) showing v
//   --poses=<v>@<x>,<y>;...  where else the film throws it: frames in `poses`, no pieces
//   --open-bays     every bay's door open, as a ship is before its build goes in
//
// A piece the film moves (film.mjs) carries an `id` stable across states;
// one printed in several parts (a die, a card) names its `group`, whose
// frame is in `groups`, so the parts move as one.
//
// Every assembly is read from the pieces' own code (wellOf, standOf, the
// module and hull print frames, the dice's resting frame, the base's bays and
// channels, the holders' bins and where their tokens lie).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Matrix4, Vector3, type Object3D } from 'three'
import {
  DEFAULT_SHIP_APPEARANCE,
  type Hull,
  type Missile,
  type Station,
  type SubsystemType,
  type Wreck,
} from '@dangerous-inclinations/engine'
import { COLOUR, PLAYER_COLOURS, PLANETS } from '../../colours.ts'
import { BOARD, CUBE, DICE, FDM, MOUNT, PRINT } from '../../spec.ts'
import { wellOf, type WellKind } from '../../pieces/well.ts'
import { bandPrints, bandPrintFrame } from '../../pieces/body.ts'
import { standOf } from '../../pieces/stand.ts'
import { HULL_PRINT } from '../../pieces/hull.ts'
import { layout as moduleLayout } from '../../pieces/module.ts'
import { printFrame } from '../../lib/kit.ts'
import { SOCKET, deckTop, bays, bayPlaces, channels, cubeCentres } from '../../pieces/base.ts'
import { bayOf } from '../../pieces/bay.ts'
import { die, restingFrame, numeralHeight } from '../../pieces/dice/d10.ts'
import { heights, pocket } from '../../pieces/dice/stand.ts'
import { CADDY, COUNTS, POOL, columns, lay, slots, type Bin } from '../../pieces/holder.ts'
import { CRATE } from '../../pieces/markers/crate.ts'
import { DATA } from '../../pieces/markers/data.ts'
import type { Point } from '../../lib/solids.ts'
import { createShip } from '../../../ui/src/ships/model.ts'
import { DEFAULT_CONFIG, setModule, type MountId } from '../../../ui/src/ships/config.ts'
import { MANTIS_ARM_FIN } from '../../../ui/src/ships/mantis.ts'

const OUT = join(import.meta.dirname, '../../shots/table')
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
/** state.json as tableState.mjs writes it: the parts of it read here. */
interface TableState {
  seed: number
  round: number
  stations: Station[]
  wrecks: Wreck[]
  missiles: Missile[]
  piles: Record<'primary' | 'secondary', number>
  players: TablePlayer[]
}
interface TablePlayer {
  id: string
  home: { wellId: string; ring: number; sector: number }
  ship: {
    wellId: string
    ring: number
    sector: number
    facing: string
    fuel: number
    hull: number
    heat: number
    subsystems: {
      id: string
      type: SubsystemType
      energy: number
      broken: boolean
      revealed: boolean
    }[]
  }
  moored: boolean
  cargo: { id: string; kind: string; loot: boolean }[]
  soldAt: string[]
  missions: { type: string; done: boolean; marked?: string; card: string }[]
}
const state: TableState = JSON.parse(readFileSync(arg('state') ?? join(OUT, 'state.json'), 'utf8'))
const S = PRINT.mmPerUnit
const DEG = Math.PI / 180

// ---- Choices that are not in the code ----------------------------------------

/** The hull each seat flies: bots fly no hull of their own, so it is chosen here. */
const HULLS: Hull[] = ['corvette', 'shrike', 'mantis', 'corvette']
/** Where each seat sits: the side of the table, in seat order. */
const SIDES = ['west', 'south', 'east', 'north'] as const
/** The board's colours: not chosen yet by the designer. */
const BOARD_COLOURS = {
  ring: COLOUR.black,
  /** The black hole's; each planet's numbers are in its colour (the designer, 1 Nov 2026). */
  numbers: COLOUR.white,
  hub: COLOUR.black,
  arm: COLOUR.black,
  horizon: COLOUR.black,
  disc: COLOUR.disc,
  streaks: COLOUR.white,
  bandLight: COLOUR.white,
}
const PLANET_COLOURS: Record<string, string> = Object.fromEntries(
  PLANETS.map(planet => [`planet-${planet}`, COLOUR[planet]])
)
const CUBE_COLOURS = { energy: '#e9c46a', heat: '#d9482b' }

/** How far each planet stands from the black hole, centre to centre (the printed board does not fix it). */
const PLANET_DISTANCE = 380
/** The game's board: Alpha up, Beta and Gamma at 120 degrees clockwise from it (ui/.../geometry.ts). */
const ORBIT_ANGLE: Record<string, number> = {
  'planet-alpha': 0,
  'planet-beta': 120,
  'planet-gamma': 240,
}
/** The table top. */
const TABLE = { x0: -650, x1: 650, y0: -545, y1: 795 }

// ---- Output ------------------------------------------------------------------

interface Instance {
  stl: string
  color: string
  matrix: number[]
  /** A treatment the renderer applies to the mesh first. */
  op?: Record<string, unknown>
  kind?: string
  /** The same piece in every state of a film. */
  id?: string
  /** The rigid assembly the piece moves with, its frame in `groups`. */
  group?: string
}
const instances: Instance[] = []
const groups: Record<string, number[]> = {}
const put = (stl: string, color: string, m: Matrix4, extra: Partial<Instance> = {}) =>
  instances.push({ stl, color, matrix: m.toArray(), ...extra })

const T = (x: number, y: number, z = 0) => new Matrix4().makeTranslation(x, y, z)
const Rz = (deg: number) => new Matrix4().makeRotationZ(deg * DEG)
const Rx = (deg: number) => new Matrix4().makeRotationX(deg * DEG)
const mul = (...ms: Matrix4[]) => ms.reduce((a, b) => a.clone().multiply(b), new Matrix4())
/** Hands are not jigs: a seeded wobble, in degrees or mm, for what is set down by hand. */
let wobbleSeed = 7
const jit = (a: number) => {
  wobbleSeed = (wobbleSeed * 16807) % 2147483647
  return a * (2 * (wobbleSeed / 2147483647) - 1)
}

// ---- The board -----------------------------------------------------------------

interface WellPlace {
  id: string
  kind: WellKind
  x: number
  y: number
  /** The printed well's frame turned this far anticlockwise onto the table. */
  turn: number
}
const WELLS: WellPlace[] = [
  { id: 'blackhole', kind: 'blackHole', x: 0, y: 0, turn: 0 },
  ...Object.entries(ORBIT_ANGLE).map(([id, a]) => ({
    id,
    kind: 'planet' as WellKind,
    x: PLANET_DISTANCE * Math.sin(a * DEG),
    y: PLANET_DISTANCE * Math.cos(a * DEG),
    // Sector 0's start edge (the print's +y) points back at the black hole, as the game draws it.
    turn: 180 - a,
  })),
]
const wellAt = (id: string) => WELLS.find(w => w.id === id)!
const wellFrame = (w: WellPlace) => mul(T(w.x, w.y), Rz(w.turn))

/** A sector's middle in the print's well frame, degrees (sectors clockwise, sector 0's start edge at 90). */
const middle = (s: number) => BOARD.startAngle - (s + 0.5) * (360 / BOARD.sectors)

/**
 * A point in a sector on the table: `along` mm round the ring (prograde
 * positive) and `out` mm outward from the ring's centre line; with the
 * heading (degrees) a token lies at facing prograde.
 */
function onBoard(wellId: string, ring: number, sector: number, along = 0, out = 0) {
  const w = wellAt(wellId)
  const geo = wellOf(w.kind)
  const r = geo.centre[ring - 1] + out
  const a = middle(sector) - (along / r) * (180 / Math.PI)
  const local = new Vector3(
    r * Math.cos(a * DEG),
    r * Math.sin(a * DEG),
    BOARD.thickness
  ).applyMatrix4(wellFrame(w))
  // Prograde is clockwise: the tangent a quarter turn back from the radius.
  return { x: local.x, y: local.y, z: local.z, prograde: a + w.turn - 90 }
}

function board() {
  for (const w of WELLS) {
    const geo = wellOf(w.kind)
    const F = wellFrame(w)
    const dir = w.kind === 'blackHole' ? 'blackHole' : 'planet'
    // The rings: the shared inner ones, then the well's own, segment by segment.
    for (let i = 0; i < geo.n; i++) {
      const sharedRing = i < 3
      const name = sharedRing ? `board/shared/ring-${i + 1}` : `board/${dir}/ring-${i + 1}`
      const segs = geo.segments[i]
      for (let j = 0; j < segs; j++) {
        const file = segs === 1 ? name : `${name}.${j + 1}`
        put(`${file}.stl`, BOARD_COLOURS.ring, F, { kind: 'board' })
      }
      // The numbers: one set laid out as ring 1's, moved out to this ring.
      put(
        'board/shared/numbers.stl',
        w.kind === 'planet' ? PLANET_COLOURS[w.id] : BOARD_COLOURS.numbers,
        F,
        {
          op: { numbers: { from: geo.centre[0], to: geo.centre[i] } },
          kind: 'board',
        }
      )
    }
    put(`board/${dir}/hub.stl`, BOARD_COLOURS.hub, F, { kind: 'board' })
    for (let j = 0; j < BOARD.arm.count; j++)
      put(`board/${dir}/arm.stl`, BOARD_COLOURS.arm, mul(F, Rz(-j * (360 / BOARD.arm.count))), {
        kind: 'board',
      })
    // Lane markers in the colour of the planet each lane runs to or from.
    geo.lanes.forEach((lane, k) => {
      const planet =
        w.kind === 'planet'
          ? w.id
          : `planet-${['beta', 'alpha', 'gamma', 'beta', 'alpha', 'gamma'][k]}`
      const first = geo.lanes[0].first
      put(`board/${dir}/lane.stl`, PLANET_COLOURS[planet], mul(F, Rz(-(lane.first - first) * 15)), {
        kind: 'board',
      })
    })
    if (w.kind === 'blackHole') {
      put('board/blackHole/horizon.stl', BOARD_COLOURS.horizon, F, { kind: 'board' })
      put('board/blackHole/accretion-disc.stl', BOARD_COLOURS.disc, F, { kind: 'board' })
      put('board/blackHole/streak-inlay.stl', BOARD_COLOURS.streaks, F, { kind: 'board' })
    } else {
      for (let b = 1; b <= 4; b++)
        for (const half of bandPrints(b))
          put(
            `board/planet/band-${b}${half === 'whole' ? '' : `-${half}`}.stl`,
            b % 2 ? PLANET_COLOURS[w.id] : BOARD_COLOURS.bandLight,
            mul(F, bandPrintFrame(b, half)),
            {
              kind: 'board',
            }
          )
    }
  }
}

// ---- The tokens on the board -----------------------------------------------------

const playerColour = (i: number) => PLAYER_COLOURS[i]
const seatOf = (id: string) => state.players.findIndex((p: { id: string }) => p.id === id)

/** Everything in a sector is laid along it, centred; collect first, then place. */
interface OnRing {
  wellId: string
  ring: number
  sector: number
  width: number
  place: (along: number) => void
}
const onRing: OnRing[] = []

function tokens() {
  const { stations, wrecks, missiles, players } = state
  // Stations, each turned with its ring (the yard's +x along the ring, prograde), and moored ships on its clamps.
  for (const st of stations) {
    const p = onBoard(st.planetId, st.ring, st.sector)
    const S0 = mul(T(p.x, p.y, p.z), Rz(p.prograde))
    put('tokens/station.stl', PLANET_COLOURS[st.planetId], S0, {
      kind: 'token',
      id: `station:${st.planetId}`,
    })
    const moored = players.filter(
      (pl: { moored: boolean; ship: { wellId: string; sector: number; ring: number } }) =>
        pl.moored &&
        pl.ship.wellId === st.planetId &&
        pl.ship.ring === st.ring &&
        pl.ship.sector === st.sector
    )
    moored.forEach((pl: { id: string; ship: { facing: string } }, k: number) => {
      // ui/src/ships/station.ts: berth k at 12 mm from the spine, on the clamp's floor at 18,
      // arm k at 90 + 120k degrees in the yard's (x, z), which the print turns to (x, -z).
      const a = (90 + 120 * k) * DEG
      const [bx, by] = [12 * Math.cos(a), -12 * Math.sin(a)]
      // Tangent to the station, the way nearer the ship's facing (+x is prograde).
      let yaw = Math.atan2(by, bx) / DEG + 90
      const want = pl.ship.facing === 'prograde' ? 0 : 180
      if (Math.cos((yaw - want) * DEG) < 0) yaw += 180
      put('tokens/ship-token.stl', playerColour(seatOf(pl.id)), mul(S0, T(bx, by, 18), Rz(yaw)), {
        kind: 'token',
        id: `ship:${seatOf(pl.id)}`,
      })
    })
  }
  // Ships in their sectors, nose the way they face.
  players.forEach((pl, i) => {
    if (pl.moored) return
    const s = pl.ship
    onRing.push({
      wellId: s.wellId,
      ring: s.ring,
      sector: s.sector,
      width: 21,
      place: along => {
        const p = onBoard(s.wellId, s.ring, s.sector, along)
        const yaw = p.prograde + (s.facing === 'prograde' ? 0 : 180)
        put('tokens/ship-token.stl', playerColour(i), mul(T(p.x, p.y, p.z), Rz(yaw + jit(4))), {
          kind: 'token',
          id: `ship:${i}`,
        })
      },
    })
  })
  // Home markers, roof toward the well's centre.
  players.forEach((pl, i) => {
    const h = pl.home
    onRing.push({
      wellId: h.wellId,
      ring: h.ring,
      sector: h.sector,
      width: 10,
      place: along => {
        const p = onBoard(h.wellId, h.ring, h.sector, along)
        put(
          'tokens/home-marker.stl',
          playerColour(i),
          mul(T(p.x, p.y, p.z), Rz(p.prograde + 90 + jit(5))),
          { kind: 'token', id: `home:${i}` }
        )
      },
    })
  })
  // Wrecks.
  for (const w of wrecks) {
    onRing.push({
      wellId: w.wellId,
      ring: w.ring,
      sector: w.sector,
      width: 21,
      place: along => {
        const p = onBoard(w.wellId, w.ring, w.sector, along)
        put('tokens/wreck-token.stl', COLOUR.black, mul(T(p.x, p.y, p.z), Rz(p.prograde + 25)), {
          kind: 'token',
          id: `wreck:${w.id}`,
        })
      },
    })
  }
  // Missiles: those that fly together (one owner, one target, one place, one
  // flight) are a salvo, one token of up to four, nose prograde.
  const groups = new Map<string, Missile[]>()
  for (const m of missiles) {
    const key = `${m.ownerId}|${m.targetId}|${m.wellId}|${m.ring}|${m.sector}|${m.movesMade}`
    groups.set(key, [...(groups.get(key) ?? []), m])
  }
  for (const g of groups.values()) {
    for (let k = 0; k < g.length; k += 4) {
      const n = Math.min(4, g.length - k)
      const m = g[0]
      const seat = seatOf(m.ownerId)
      salvosUsed[seat][n] = (salvosUsed[seat][n] ?? 0) + 1
      onRing.push({
        wellId: m.wellId,
        ring: m.ring,
        sector: m.sector,
        width: 13,
        place: along => {
          const p = onBoard(m.wellId, m.ring, m.sector, along)
          const file = n === 1 ? 'tokens/missile-token' : `tokens/salvo-${n}`
          put(`${file}.stl`, playerColour(seat), mul(T(p.x, p.y, p.z), Rz(p.prograde + jit(4))), {
            kind: 'token',
            id: `salvo:${m.id}:${k}`,
          })
        },
      })
    }
  }
  // Lay each sector's crowd along it, centred, with a little air between.
  const bySector = new Map<string, OnRing[]>()
  for (const o of onRing) {
    const key = `${o.wellId}/${o.ring}/${o.sector}`
    bySector.set(key, [...(bySector.get(key) ?? []), o])
  }
  for (const list of bySector.values()) {
    const gap = 1.5
    const total = list.reduce((s, o) => s + o.width, 0) + gap * (list.length - 1)
    let at = -total / 2
    for (const o of list) {
      o.place(at + o.width / 2)
      at += o.width + gap
    }
  }
}
const salvosUsed: Record<number, number>[] = state.players.map(() => ({}))

// ---- The players' places -----------------------------------------------------------

/** A seat's frame: its origin on the table's edge, +y into the table, +x to the player's right. */
function seatFrame(i: number): Matrix4 {
  const cy = 160
  switch (SIDES[i]) {
    case 'south':
      return T(0, TABLE.y0)
    case 'north':
      return mul(T(0, TABLE.y1), Rz(180))
    case 'east':
      return mul(T(TABLE.x1, cy), Rz(90))
    case 'west':
      return mul(T(TABLE.x0, cy), Rz(-90))
  }
}

/** The base's bays and its channels' cube centres (pieces/base.ts), the heat track's two rows as one. */
function baseLayout() {
  const centres: Record<string, Point[]> = Object.fromEntries(
    channels().map(c => [c.id, cubeCentres(c)])
  )
  centres.heat = [...centres['heat-0'], ...centres['heat-1']]
  return { b: bayOf(), flank: bays().flank, bays: bayPlaces(), channels: centres, deck: deckTop() }
}

/** An object's matrix relative to the ship's root (pieces/hull.ts: inShip). */
function inShip(object: Object3D, root: Object3D): Matrix4 {
  root.updateMatrixWorld(true)
  return root.matrixWorld.clone().invert().multiply(object.matrixWorld)
}

/** Where a side mount sits on a hull's print (x, y), to match it to its bay. */
function mountAt(hull: Hull, id: MountId): Vector3 {
  const model = createShip({ ...DEFAULT_CONFIG, appearance: { ...DEFAULT_SHIP_APPEARANCE, hull } })
  return new Vector3().applyMatrix4(
    mul(printFrame(HULL_PRINT[hull].bed), inShip(model.mounts.get(id)!.frame, model.root))
  )
}

/**
 * A module's print (cad/out/modules/<type>.stl) onto a hull's print, on mount
 * `id`: the game's module group on that mount (the hull's print frame) from
 * the module print's frame (pieces/module.ts: layout). A starboard mount is
 * the port one mirrored; the printed module is symmetric dorsal to ventral,
 * so the mirror is taken across its own dorsal axis and the matrix stays a
 * rotation.
 */
function moduleOnHull(hull: Hull, id: MountId, type: SubsystemType): Matrix4 {
  const config = setModule(
    { ...DEFAULT_CONFIG, appearance: { ...DEFAULT_SHIP_APPEARANCE, hull } },
    id,
    type
  )
  const model = createShip(config)
  const group = model.mounts.get(id)!.module
  const onHull = mul(printFrame(HULL_PRINT[hull].bed), inShip(group, model.root))
  const m = mul(onHull, moduleLayout(type).frame.clone().invert())
  if (m.determinant() < 0) m.multiply(new Matrix4().makeScale(1, -1, 1))
  return m
}

/** The die's ten inlays (cad/out/dice/d10-numbers.stl, laid flat in two rows) onto their faces, in the die's frame. */
function inlayFrames(): Record<number, number[]> {
  const d = die()
  const out: Record<number, number[]> = {}
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  values.forEach((v, i) => {
    const f = d.faces.find(x => x.value === v)!
    const [ox, oy] = [(i % 5) * 14, -Math.floor(i / 5) * 14]
    const c = numeralHeight(v, d)!
    const face = new Matrix4().makeBasis(f.right, f.up, f.n).setPosition(f.mid)
    out[v] = mul(face, T(0, c, -BOARD.number.depth + 0.02), T(-ox, -oy, 0)).toArray()
  })
  return out
}
const INLAYS = inlayFrames()

/** A die standing on a stand at `at` showing `top`, or lying on the table beside it. */
function dice(counter: 'hull' | 'fuel', value: number, at: Matrix4, seat: number) {
  // The designer's colours (1 Nov 2026): black dice and stands, the numbers and the stand's icon in the die's accent.
  const colour = COLOUR.black
  const ink = counter === 'hull' ? COLOUR.hull : COLOUR.fuel
  const inlays = `dice/${counter}-inlays.stl`
  put(`dice/${counter}-stand.stl`, COLOUR.black, at, { kind: 'piece' })
  // The inlay set (pieces/dice/stand.ts: buildInlaySet, showOnStand): the
  // icon printed at (icon / 2, -30), inlaid at the stand's top past the
  // pocket's tail; the fuel stand's 0 printed at (14 + icon / 2, -30),
  // inlaid in the pocket's floor turned a quarter.
  const { top, floor } = heights(counter)
  const { rim } = pocket(counter)
  const ix = Math.max(...rim.map(p => p[0])) + DICE.stand.iconGap + DICE.stand.icon / 2
  const depth = BOARD.number.depth
  put(inlays, ink, mul(at, T(ix - DICE.stand.icon / 2, 30, top - depth + 0.02)), {
    op: { inlay: 'icon' },
    kind: 'piece',
  })
  if (counter === 'fuel')
    put(
      inlays,
      ink,
      mul(at, T(0, 0, floor - depth + 0.02), Rz(90), T(-(14 + DICE.stand.icon / 2), 30, 0)),
      { op: { inlay: 'zero' }, kind: 'piece' }
    )
  // An empty tank: the die is off its stand, lying beside it on its 10.
  const frame =
    value > 0
      ? mul(at, restingFrame(value, floor))
      : mul(at, T(-4, -34, 0), Rz(35), restingFrame(10, 0))
  d10(`die:${seat}:${counter}`, colour, ink, inlays, frame)
}

/** A d10 at `frame`, its parts one group: the two poles and the ten numbers. */
function d10(group: string, colour: string, ink: string, inlays: string, frame: Matrix4) {
  groups[group] = frame.toArray()
  put('dice/d10-pole-odd.stl', colour, frame, { kind: 'piece', id: `${group}:odd`, group })
  // The even pole prints turned over about x: turned back.
  put('dice/d10-pole-even.stl', colour, mul(frame, Rx(180)), {
    kind: 'piece',
    id: `${group}:even`,
    group,
  })
  for (let v = 1; v <= 10; v++)
    put(inlays, ink, mul(frame, new Matrix4().fromArray(INLAYS[v])), {
      op: { dieNumber: v },
      kind: 'piece',
      id: `${group}:${v}`,
      group,
    })
}

/** The table's one d10 (RULES §Components), lying where `--roll` puts it with its value up. */
const rollFrame = (spec: string) => {
  const [v, at] = spec.split('@')
  const [x, y] = at.split(',').map(Number)
  return mul(T(x, y), Rz(20), restingFrame(Number(v), 0))
}
function rollDie() {
  const roll = arg('roll')
  if (!roll) return
  // Not chosen by the designer: a white die with black numbers, apart from the hull and fuel dice.
  d10('die:roll', COLOUR.white, COLOUR.black, 'dice/hull-inlays.stl', rollFrame(roll))
}
/** Frames the film throws the d10 to between the states, by spec. */
const poses = Object.fromEntries(
  (arg('poses') ?? '')
    .split(';')
    .filter(Boolean)
    .map(p => [p, rollFrame(p).toArray()])
)

/** `count` tokens into a bin, layer by layer from the back, in the holder's frame (pieces/holder.ts). */
function fill(bin: Bin, at: Point, top: number, count: number, each: (m: Matrix4) => void) {
  for (const [x, y, z] of slots({ bin, at }, top, count)) each(T(x, y, z))
}

function players() {
  const L = baseLayout()
  state.players.forEach((pl, i) => {
    const hull = HULLS[i]
    const colour = playerColour(i)
    const seat = seatFrame(i)
    // The base, bow toward the board, its middle 175 in from the edge.
    const B = mul(seat, T(0, 175), Rz(90))
    // The loadout slots: which bay each side mount's module hides in.
    const sides = (['side-0', 'side-1', 'side-2', 'side-3'] as MountId[]).map(id => ({
      id,
      at: mountAt(hull, id),
    }))
    const bayOfMount: Record<string, number> = { 'forward-0': 4 }
    for (const port of [1, -1]) {
      const mine = sides.filter(s => Math.sign(s.at.y) === port).sort((a, b) => b.at.x - a.at.x)
      const bays = L.flank
        .map((f, k) => ({ ...f, k }))
        .filter(f => f.side === port)
        .sort((a, b) => b.x - a.x)
      mine.forEach((s, j) => (bayOfMount[s.id] = bays[j].k))
    }
    const subs = pl.ship.subsystems as {
      id: string
      type: SubsystemType
      energy: number
      broken: boolean
      revealed: boolean
    }[]
    const slots = subs.filter(s => s.id === 'forward-0' || s.id.startsWith('side-'))
    // A face-down module hides in its bay, door shut; a face-up one is on
    // the ship, its bay open; a broken one is off the ship and the base.
    const closed = process.argv.includes('--open-bays')
      ? []
      : slots.filter(s => !s.revealed && !s.broken).map(s => bayOfMount[s.id])
    put('base/base.stl', COLOUR.grey, B, {
      op: { closeBays: closed.map(k => L.bays[k]), bay: bayGeometry() },
      kind: 'piece',
      id: `base:${i}`,
    })
    // The stand (printed lowered, its tenon's foot on the bed) and the hull on it.
    const st = standOf(hull)
    put(
      `${hull}/${hull}-stand.stl`,
      COLOUR.grey,
      mul(B, T(0, 0, deckTop() - SOCKET.depth + SOCKET.room)),
      { kind: 'piece' }
    )
    const H = mul(B, T(st.head - st.at, 0, st.bed))
    put(`${hull}/${hull}-hull.stl`, COLOUR.grey, H, { kind: 'piece' })
    if (hull === 'mantis') {
      // pieces/hull.ts: slitFins, finFrame and buildArmFins; fin 0 is the one at s = -1.
      const { points, thick, cant, z } = MANTIS_ARM_FIN
      const minY = Math.min(...points.map(([, y]) => y * S))
      const t = thick * S + 2 * FDM.join
      ;[-1, 1].forEach((s, k) => {
        const finFrame = mul(
          printFrame(HULL_PRINT.mantis.bed),
          T(0, 0, s * z),
          new Matrix4().makeRotationX(-s * cant),
          new Matrix4().makeScale(1 / S, 1 / S, 1 / S)
        )
        put(
          'mantis/mantis-fins.stl',
          COLOUR.grey,
          mul(H, finFrame, T(0, -(k * 14 - minY), -t / 2)),
          { op: { fin: k }, kind: 'piece' }
        )
      })
    }
    for (const s of slots) {
      if (s.broken) continue
      if (s.revealed) {
        put(
          `modules/${s.type}.stl`,
          COLOUR.grey,
          mul(H, moduleOnHull(hull, s.id as MountId, s.type)),
          { kind: 'piece', id: `module:${i}:${s.id}` }
        )
        continue
      }
      // Face-down: on its side on the bay's wall mount, behind the shut door
      // (pieces/bay.ts: showBay, the module as it prints turned onto the wall).
      const bay = L.bays[bayOfMount[s.id]]
      const inBay = mul(
        B,
        T(bay.x, bay.y, 0),
        Rz(bay.turn),
        T(0, -MOUNT.recessDepth, L.b.centre),
        Rz(180),
        Rx(90)
      )
      put(`modules/${s.type}.stl`, COLOUR.grey, inBay, { kind: 'piece', id: `module:${i}:${s.id}` })
    }
    // Energy cubes on their channels, heat cubes on the track.
    const cubes = (pts: [number, number][], n: number, c: string, name: string) =>
      pts.slice(0, n).forEach(([x, y], k) =>
        put(
          '@cube',
          c,
          mul(
            B,
            T(x + jit(0.12), y + jit(0.15), L.deck - CUBE.pocketDepth + CUBE.size / 2),
            Rz(jit(1.5))
          ),
          {
            kind: 'cube',
            id: `cube:${i}:${name}:${k}`,
          }
        )
      )
    for (const s of subs) {
      if (!s.energy) continue
      const ch = s.id.startsWith('side-')
        ? L.channels[`flank-${bayOfMount[s.id]}`]
        : L.channels[s.id]
      if (ch) cubes(ch, s.energy, CUBE_COLOURS.energy, s.id)
    }
    cubes(L.channels.heat, pl.ship.heat, CUBE_COLOURS.heat, 'heat')
    // The dice to the player's right, the caddy to the left.
    dice('hull', pl.ship.hull, mul(seat, T(96, 222), Rz(90)), i)
    dice('fuel', pl.ship.fuel, mul(seat, T(132, 222), Rz(90)), i)
    const caddyAt = mul(seat, T(-162, 150))
    put('holder/caddy.stl', colour, caddyAt, { kind: 'piece' })
    const caddy = lay(CADDY)
    const used = salvosUsed[i]
    const escortsOut = pl.missions.filter(m => m.type === 'escort' && m.marked).length
    for (const { bin, at } of caddy.bins) {
      if (bin.kind === 'salvo') {
        const n = bin.n!
        const file = n === 1 ? 'tokens/missile-token' : `tokens/salvo-${n}`
        fill(bin, at, caddy.height, 3 - (used[n] ?? 0), m =>
          put(`${file}.stl`, colour, mul(caddyAt, m, Rz(90)), { kind: 'token' })
        )
      } else
        fill(bin, at, caddy.height, COUNTS.escort - escortsOut, m =>
          put('tokens/escort-marker.stl', colour, mul(caddyAt, m), { kind: 'token' })
        )
    }
    // The hold: what the ship carries, by the base (loot shows its skull).
    pl.cargo.forEach((c, k) => {
      const m = mul(seat, T(-140 + k * 24, 118), Rz(10 * k - 5))
      const file = c.kind === 'crate' ? 'tokens/crate-token' : 'tokens/data-token'
      const t = c.kind === 'crate' ? CRATE.thickness : DATA.thickness
      put(`${file}.stl`, COLOUR.white, c.loot ? mul(m, T(0, 0, t), Rx(180)) : m, {
        kind: 'token',
        id: `hold:${i}:${c.id}`,
      })
    })
    // Sale chips the player took, beside the base on the right.
    pl.soldAt.forEach((planet: string, k: number) => {
      const name = planet.replace('planet-', '')
      put(
        `tokens/sale-chip-${name}.stl`,
        PLANET_COLOURS[planet],
        mul(seat, T(96 + k * 19, 150), Rz(-20)),
        { kind: 'token', id: `chip:${i}:${planet}` }
      )
    })
  })
  // Escort markers, face-up beside the base of the ship they escort.
  state.players.forEach((pl, i) => {
    pl.missions
      .filter(m => m.type === 'escort' && m.marked)
      .forEach((m, k) => {
        const target = seatOf(m.marked!)
        put(
          'tokens/escort-marker.stl',
          playerColour(i),
          mul(seatFrame(target), T(-128 + k * 24, 232), Rz(8)),
          { kind: 'token' }
        )
      })
  })
}

/** What render.js needs to shut a bay's door: the hinge in the bay's frame (pieces/bay.ts: bayOf, bayDoor). */
function bayGeometry() {
  const b = bayOf()
  return { axis: b.axis, half: b.half, front: b.front, deckFront: b.deckFront }
}

// ---- The pool tray ------------------------------------------------------------------

function pool() {
  const at = mul(T(TABLE.x0 + 30, TABLE.y0 + 28), Rz(0))
  put('holder/pool-tray.stl', COLOUR.white, at, { kind: 'piece' })
  const cols = columns(POOL)
  const aboard = (kind: string) =>
    state.players.reduce((n, p) => n + p.cargo.filter(c => c.kind === kind).length, 0)
  cols.forEach((c, k) => {
    const bin = POOL[k]
    const top = c.height
    const place = c.bin.at
    if (bin.kind === 'crate')
      fill(bin, place, top, COUNTS.crate - aboard('crate'), m =>
        put('tokens/crate-token.stl', COLOUR.white, mul(at, m), { kind: 'token' })
      )
    if (bin.kind === 'data')
      fill(bin, place, top, COUNTS.data - aboard('data'), m =>
        put('tokens/data-token.stl', COLOUR.white, mul(at, m), { kind: 'token' })
      )
    if (bin.kind === 'wreck') {
      let n = 0
      fill(bin, place, top, COUNTS.wreck - state.wrecks.length, m =>
        put('tokens/wreck-token.stl', COLOUR.black, mul(at, m), {
          kind: 'token',
          id: `pool:wreck:${n++}`,
        })
      )
    }
    if (bin.kind === 'chip') {
      const planet = `planet-${bin.planet}`
      const sold = state.players.filter(p => p.soldAt.includes(planet)).length
      let n = 0
      fill(bin, place, top, COUNTS.chip - sold, m =>
        put(`tokens/sale-chip-${bin.planet}.stl`, PLANET_COLOURS[planet], mul(at, m), {
          kind: 'token',
          id: `pool:chip:${planet}:${n++}`,
        })
      )
    }
  })
}

// ---- The cards ----------------------------------------------------------------------

/** The printed cards (ui/src/site/missions/sheet.ts, card/cardStyles.ts), mm; card stock 0.3 thick. */
const MISSION_CARD = { w: 63, h: 88 }
const TURN_CARD = { w: 70, h: 120 }
const STOCK = 0.3
/** Card stock's colour at its edges: the press's paper. */
const CARD_EDGE = '#efe8d6'

/**
 * A card lying on whatever is under it at `z`: its face up, or turned over
 * about its long axis to show its back. Textures are cards.mjs's photographs
 * of the site's /card page, in cad/shots/table/cards/.
 */
function card(
  size: { w: number; h: number },
  front: string,
  back: string,
  faceUp: boolean,
  at: Matrix4,
  z = 0,
  id?: string
) {
  const turn = faceUp ? new Matrix4() : new Matrix4().makeRotationY(Math.PI)
  put('@card', CARD_EDGE, mul(at, T(0, 0, z + STOCK / 2), turn), {
    kind: 'card',
    id,
    op: {
      card: {
        size: [size.w, size.h, STOCK],
        front: `cards/${front}.png`,
        back: `cards/${back}.png`,
      },
    },
  })
}

function cards() {
  state.players.forEach((pl, i) => {
    const seat = seatFrame(i)
    // The three missions in a row between the base and the edge: primary, then the secondaries.
    pl.missions.forEach((m, k) => {
      const pile = m.card.startsWith('primary') ? 'primary' : 'secondary'
      card(
        MISSION_CARD,
        m.card,
        `back-${pile}`,
        m.done,
        mul(seat, T((k - 1) * 72 + jit(2), 58 + jit(2)), Rz(jit(3))),
        0,
        `card:${i}:${k}`
      )
    })
    // The player card, "your turn" up, on the right past the dice.
    card(
      TURN_CARD,
      'turn-front',
      'turn-back',
      true,
      mul(seat, T(188 + jit(2), 84 + jit(2)), Rz(jit(3)))
    )
  })
  // The two draw piles beside the pool tray, face down: what the deal left.
  ;(['primary', 'secondary'] as const).forEach((pile, k) => {
    const at = mul(T(TABLE.x0 + 285 + k * 76, TABLE.y0 + 55), Rz(jit(2)))
    for (let n = 0; n < state.piles[pile]; n++)
      card(
        MISSION_CARD,
        `back-${pile}`,
        `back-${pile}`,
        false,
        mul(at, T(jit(0.6), jit(0.6)), Rz(jit(1.2))),
        n * STOCK
      )
  })
}

// ---- Cameras ------------------------------------------------------------------------

function cameras() {
  // The close-up: the south seat's ship, low, from just off the table's edge behind its stern.
  const seat = seatFrame(SIDES.indexOf('south'))
  const at = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(seat).toArray()
  const mid = (TABLE.y0 + TABLE.y1) / 2
  return {
    seated: { position: [0, TABLE.y0 - 380, 950], target: [0, 70, 0], fov: 48, size: [2560, 1440] },
    top: {
      position: [0, mid, 4100],
      target: [0, mid, 0],
      fov: 21,
      up: [0, 1, 0],
      size: [2400, 2400],
    },
    closeup: {
      position: at(260, 40, 130),
      target: at(-10, 200, 55),
      fov: 36,
      focus: at(10, 185, 88),
      aperture: 0.00004,
      maxblur: 0.012,
      size: [2560, 1440],
      dof: true,
    },
    // The web set: a corner, a banner and close-ups of what the round left on the table.
    // From the south-west corner, about 40 degrees down, the board and all four seats filling the frame.
    corner: { position: [-1120, -1010, 1330], target: [-5, 105, 0], fov: 29, size: [2560, 1440] },
    'corner-low': {
      position: [TABLE.x1 + 380, TABLE.y0 - 330, 330],
      target: [-30, 60, 30],
      fov: 36,
      focus: [330, -190, 10],
      aperture: 0.000012,
      maxblur: 0.006,
      size: [2560, 1440],
      dof: true,
    },
    banner: {
      position: [0, TABLE.y0 - 760, 540],
      target: [0, 120, 0],
      fov: 34,
      size: [3200, 1100],
    },
    'black-hole': {
      position: [-170, -500, 240],
      target: [-10, -60, 10],
      fov: 30,
      focus: [-20, -157, 5],
      aperture: 0.00003,
      maxblur: 0.01,
      size: [2560, 1440],
      dof: true,
    },
    station: {
      position: [600, -560, 150],
      target: [395, -240, 22],
      fov: 26,
      focus: [400, -243, 22],
      aperture: 0.00004,
      maxblur: 0.012,
      size: [2560, 1440],
      dof: true,
    },
    'over-the-shoulder': {
      position: [-140, TABLE.y1 + 60, 170],
      target: [0, 380, 20],
      fov: 38,
      focus: [0, 612, 60],
      aperture: 0.00003,
      maxblur: 0.01,
      size: [2560, 1440],
      dof: true,
    },
    'empty-tank': {
      position: [TABLE.x1 - 10, 360, 150],
      target: [425, 272, 8],
      fov: 28,
      focus: [428, 292, 6],
      aperture: 0.00005,
      maxblur: 0.012,
      size: [2000, 2000],
      dof: true,
    },
    'pool-tray': {
      position: [-400, TABLE.y0 - 220, 190],
      target: [-510, -490, 6],
      fov: 30,
      focus: [-510, -490, 6],
      aperture: 0.00005,
      maxblur: 0.012,
      size: [2560, 1440],
      dof: true,
    },
  }
}

board()
tokens()
players()
pool()
cards()
rollDie()
writeFileSync(
  arg('out') ?? join(OUT, 'scene.json'),
  JSON.stringify({
    seed: state.seed,
    round: state.round,
    table: TABLE,
    instances,
    groups,
    poses,
    cameras: cameras(),
    cube: CUBE.size,
  })
)
console.log(`scene.json: ${instances.length} instances, seed ${state.seed} round ${state.round}`)
