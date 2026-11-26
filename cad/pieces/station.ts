// The station that orbits each planet, printed from the game's own model
// (`ui/src/ships/station.ts`) in three parts and the plugs, each
// in the pose it stands in, every part as the board draws it but grown to
// join and thickened to print, the lights and windows left off:
//
// - the stem (`station_stem`), upright on its foot, a hex peg up its middle;
// - the habitat (`station_habitat`), flat on the underside of its ring,
//   spokes and hub: a hex bore through the hub drops it over the peg onto
//   the stem's shoulder;
// - the beam (`station_truss`), with the mast, radiators and dish on its
//   drum, flat on its underside: a hex socket in the drum drops onto the
//   peg's top, and the drum rests on the hub;
// - the plugs, one a berth: under each berth's floor lies a magnet the ship
//   token's screw sticks to (`BERTH`), slid in flat from the cradle's outer
//   face and closed by a plug glued in behind it.
//
// The habitat and the beam are glued on the peg, so lifting the station by
// its mast carries it whole.
import { createStation, STATION_PRINT, UNITS_PER_MM } from '../../ui/src/ships/station.ts'
import { placedSolids } from '../../ui/src/ships/solid.ts'
import { BERTH, FDM, MOUNT, STAND } from '../spec.ts'
import { subtract } from 'fluidcad/core'
import { placeSolid, printFrame, unite } from '../lib/kit.ts'
import { block, disc, move, prism, type Point, type Solid } from '../lib/solids.ts'

type Group = 'station_stem' | 'station_truss' | 'station_habitat'

/** The game's height (mm) each part's underside stands at: the bed in its print. */
const BED: Record<Group, number> = {
  station_stem: 0,
  station_habitat: STATION_PRINT.ringY,
  station_truss: STATION_PRINT.trussY,
}

/** The solids of one part, in its print frame, with the names the game gives them. */
function pieces(group: Group) {
  const model = createStation('#ffffff')
  const frame = printFrame(BED[group] * UNITS_PER_MM, 1 / UNITS_PER_MM)
  const out = placedSolids(model.root)
    .filter(p => p.spec.kind !== 'detail' && p.path.includes(group))
    .map(p => ({
      name: p.path.at(-1)!,
      s: placeSolid(p, frame, { min: FDM.minFeature, grow: FDM.join }),
    }))
    .filter((x): x is { name: string; s: Solid } => x.s !== null)
  model.dispose()
  return out
}

/**
 * Fuse a part round its core, its underside cut flat on the bed. One fuse:
 * the beam's pieces split into runs left a radiator's fins in a run
 * without their panel, and a fuse of solids that do not touch leaves them loose.
 */
function part(group: Group, core: string): Solid {
  const all = pieces(group)
  const at = all.findIndex(({ name }) => name === core)
  if (at < 0) throw new Error(`No ${core} in ${group}`)
  const fused = unite(
    all.map(({ s }) => s),
    all.length,
    at
  )
  // Everything grown to join reaches under the bed: cut it flat.
  return subtract(fused, block([-60, -60, -5], [60, 60, 0]))
}

/**
 * The hex the peg's bore and socket are cut to: the peg as printed (grown by
 * `FDM.join`) and the stand's clearance on every flat, a corner along ±y
 * as the peg has (three's six-sided cylinder, turned into the print).
 */
function hexTool(z0: number, z1: number): Solid {
  const flat = STATION_PRINT.peg.across / 2 + FDM.join + STAND.clearance
  const r = flat / Math.cos(Math.PI / 6)
  const points: Point[] = Array.from({ length: 6 }, (_, k) => {
    const a = ((30 + 60 * k) * Math.PI) / 180
    return [r * Math.cos(a), r * Math.sin(a)]
  })
  return move(prism(points, z1 - z0), 0, 0, z0)
}

/** The magnet's pocket: as wide and as tall as the magnet and its clearance, its roof `BERTH.seal` under the floor. */
const POCKET = {
  d: BERTH.magnet.diameter + MOUNT.magnetClearance,
  t: BERTH.magnet.thickness + MOUNT.magnetClearance,
}
/**
 * The station as it stands, mm over the stem's bed: the habitat's bed on the
 * stem's shoulder, the beam's on the hub, and the berths' floors. Heights are
 * the parts' own (each grown to join), so this is the fit as printed.
 */
export const STACK = (() => {
  const shoulder = STATION_PRINT.ringY + FDM.join
  const hubTop = shoulder + (STATION_PRINT.trussY - STATION_PRINT.ringY) + FDM.join
  return {
    shoulder,
    hubTop,
    floor: hubTop + STATION_PRINT.floorY - STATION_PRINT.trussY + FDM.join,
  }
})()

/** How deep the drum's socket runs: past the peg's top (grown), from the drum's underside on the hub. */
const SOCKET = STATION_PRINT.peg.top + FDM.join - STACK.hubTop + 0.4

/** The floor's top in the beam's print (grown to join), and the pocket's roof under it. */
const FLOOR = STATION_PRINT.floorY - STATION_PRINT.trussY + FDM.join
const ROOF = FLOOR - BERTH.seal

/**
 * Each berth in the beam's print: the middle of its floor, which way (±y)
 * its slot runs out, and its cradle's outer face (grown to join), where the
 * slot comes out and the plug ends flush.
 */
function berths(): { x: number; y: number; out: 1 | -1; face: number }[] {
  return STATION_PRINT.cradles.flatMap(({ x, off, half }) =>
    ([1, -1] as const).map(out => ({ x, y: out * off, out, face: half + FDM.join }))
  )
}

export function buildStationStem(): Solid {
  return part('station_stem', 'station_stem_column')
}

export function buildStationBeam(): Solid {
  let beam = subtract(part('station_truss', 'station_node'), hexTool(-1, SOCKET))
  const { d, t } = POCKET
  // A cut by several solids that do not touch cuts nothing: one berth at a time.
  for (const b of berths()) {
    beam = subtract(beam, move(disc(d, t), b.x, b.y, ROOF - t))
    const [y0, y1] = b.out > 0 ? [b.y, b.face + 2] : [-b.face - 2, b.y]
    beam = subtract(beam, block([b.x - d / 2, y0, ROOF - t], [b.x + d / 2, y1, ROOF]))
  }
  return beam
}

export function buildStationHabitat(): Solid {
  return subtract(part('station_habitat', 'station_hub'), hexTool(-1, 20))
}

/**
 * The plugs that close the berths' slots behind their magnets: the slot less
 * the plug's fit, from the magnet's outer edge (pushed home against the far
 * wall of its pocket; `from`, off the berth's middle) to the cradle's face,
 * flush. Every cradle's face is flat and as far off its tokens' centre lines
 * (half a token, the room and a lip), so the six are alike: each lies on its
 * widest side.
 */
const PLUG = (() => {
  const fit = MOUNT.plugFit
  const from = -POCKET.d / 2 + BERTH.magnet.diameter + fit.length
  const [{ off, half }] = STATION_PRINT.cradles
  return {
    from,
    long: half + FDM.join - off - from,
    wide: POCKET.d - 2 * fit.side,
    thick: POCKET.t - 2 * fit.side,
  }
})()

export function buildStationPlugs(): Solid[] {
  return berths().map((_, i) =>
    block([0, i * (PLUG.wide + 3), 0], [PLUG.long, i * (PLUG.wide + 3) + PLUG.wide, PLUG.thick])
  )
}

/** The station as it stands (`STACK`), for the viewer, a plug in each slot. */
export function showStation(): void {
  const { shoulder, hubTop } = STACK
  buildStationStem()
  move(buildStationHabitat(), 0, 0, shoulder)
  move(buildStationBeam(), 0, 0, hubTop)
  const fit = MOUNT.plugFit
  for (const b of berths()) {
    const [y0, y1] = b.out > 0 ? [b.y + PLUG.from, b.face] : [-b.face, b.y - PLUG.from]
    block(
      [b.x - PLUG.wide / 2, y0, hubTop + ROOF - POCKET.t + fit.side],
      [b.x + PLUG.wide / 2, y1, hubTop + ROOF - fit.side]
    )
  }
}
