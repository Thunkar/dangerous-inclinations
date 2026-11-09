// The station that orbits each planet, printed from the game's own model
// (`ui/src/ships/station.ts`): upright on its foot, every part as the board
// draws it but grown to join and thickened to print, the lights and windows
// left off. One piece, for all three planets. Under each clamp's floor lies
// a magnet the ship token's screw sticks to (`BERTH`), slid in flat from the
// clamp's outer face and closed by a plug (`buildStationPlugs`).
import { createStation, STATION_BERTHS, UNITS_PER_MM } from "../../ui/src/ships/station.ts";
import { placedSolids } from "../../ui/src/ships/solid.ts";
import { BERTH, FDM, MOUNT } from "../spec.ts";
import { common, fuse, subtract } from "fluidcad/core";
import { placeSolid, printFrame, unite } from "../lib/kit.ts";
import { block, disc, move, turn, type Solid } from "../lib/solids.ts";

/**
 * The station's pieces in the print (those `only` names, if given), each
 * with the name the game gives it. Only what is asked for is built: FluidCAD
 * keeps every solid a part builds.
 */
function pieces(only?: string) {
  const model = createStation("#ffffff");
  // The model is in mm, drawn at UNITS_PER_MM: the print undoes that and stands it up.
  const frame = printFrame(0, 1 / UNITS_PER_MM);
  return placedSolids(model.root)
    .filter((p) => p.spec.kind !== "detail" && (!only || p.path.at(-1) === only))
    .map((p) => ({ name: p.path.at(-1)!, s: placeSolid(p, frame, { min: FDM.minFeature, grow: FDM.join }) }))
    .filter((x): x is { name: string; s: Solid } => x.s !== null);
}

/** Each berth in the print: the middle of its clamp's floor (mm) and the way out from the spine (degrees about z). */
function berths() {
  return STATION_BERTHS.map((b) => {
    const [x, y] = [b.x / UNITS_PER_MM, -b.z / UNITS_PER_MM];
    return { x, y, floor: b.y / UNITS_PER_MM + FDM.join, angle: (Math.atan2(y, x) * 180) / Math.PI };
  });
}

/** The magnet's pocket: as wide and as tall as the magnet and its clearance, its roof `BERTH.seal` under the floor. */
const POCKET = {
  d: BERTH.magnet.diameter + MOUNT.magnetClearance,
  t: BERTH.magnet.thickness + MOUNT.magnetClearance,
  roof: -BERTH.seal,
};
/** How far out from the berth's middle the slot runs: past the clamp's outer face. */
const SLOT_OUT = 12;

/** In a berth's frame (x out from the spine, z up, the floor at z = 0): the pocket and the slot out to the clamp's face. */
function slotTool(): Solid {
  const { d, t, roof } = POCKET;
  return fuse(move(disc(d, t), 0, 0, roof - t), block([0, -d / 2, roof - t], [SLOT_OUT, d / 2, roof]));
}

type Berth = ReturnType<typeof berths>[number];
const toBerth = (s: Solid, b: Berth) => move(turn(s, "z", b.angle), b.x, b.y, b.floor);
const fromBerth = (s: Solid, b: Berth) => turn(move(s, -b.x, -b.y, -b.floor), "z", -b.angle);

export function buildStation(): Solid {
  const all = pieces();
  // Everything touches the spine: it anchors the fuse.
  const spine = all.findIndex(({ name }) => name === "station_spine");
  let station = unite(
    all.map(({ s }) => s),
    60,
    spine
  );
  // The foot grown to join reaches under the bed: cut it flat.
  station = subtract(station, block([-60, -60, -5], [60, 60, 0]));
  for (const b of berths()) station = subtract(station, toBerth(slotTool(), b));
  return station;
}

/**
 * The plugs that close the berths' slots behind their magnets, one a berth:
 * the slot less the plug's fit, from the magnet's outer edge (pushed home
 * against the far wall of its pocket) to the clamp's face, which it follows
 * flush. Each lies on its side, its face's profile on the bed.
 */
export function buildStationPlugs(): Solid[] {
  const { d, t, roof } = POCKET;
  const fit = MOUNT.plugFit;
  const b = berths()[0];
  const from = -d / 2 + BERTH.magnet.diameter + fit.length;
  const w = d / 2 - fit.side;
  // The berths are alike: each plug is the first's.
  return berths().map((_, i) => {
    const clamp = fromBerth(pieces("station_arm_0_clamp")[0].s, b);
    const plug = common(block([from, -w, roof - t + fit.side], [SLOT_OUT, w, roof - fit.side]), clamp);
    return move(turn(plug, "x", 90), 0, i * (t + 3), w);
  });
}
