// Each hull's display stand, printed on its own, upright: a tenon that plugs
// into the base's socket (keyed, so the ship faces the bow), a column, and
// at its top what holds that hull. The corvette takes a peg in the socket
// under its core; the shrike's blade hangs where a peg would go, so its
// stand grips the blade's flat bottom; the mantis's belly stands on its head
// with the keel fin under the core dropped into a slot. Each stands its
// hull high enough to clear the base: the mantis's arms over the side slots'
// pockets with a hand's room under them.
import { subtract, fuse } from "fluidcad/core";
import type { Hull } from "@dangerous-inclinations/engine";
import { HULL_INFO } from "../../ui/src/ships/hulls.ts";
import { SHRIKE_BLADE } from "../../ui/src/ships/shrike.ts";
import { MANTIS_FIN } from "../../ui/src/ships/mantis.ts";
import { FDM, PRINT } from "../spec.ts";
import { block, prism, move, taper, turn, type Point, type Solid } from "../lib/solids.ts";
import { Box3, Vector3 } from "three";
import { placedSolids } from "../../ui/src/ships/solid.ts";
import { printFrame } from "../lib/kit.ts";
import { HULL_PRINT, shipModel } from "./hull.ts";
import { SOCKET, socketOutline, deckTop } from "./base.ts";

const S = PRINT.mmPerUnit;
/** The column, inside the socket's outline. */
const COLUMN = { long: 12, wide: 8 };
/** Room round what a stand holds, beyond the print's own growth. */
const FIT = 0.15;

/** How far the shrike's blade hangs below its keel, mm. */
const BLADE_DROP = (HULL_INFO.shrike.keel - SHRIKE_BLADE.bottom) * S;
/** How far the mantis's keel fin hangs below its keel, mm. */
const FIN_DROP = (HULL_INFO.mantis.keel - MANTIS_FIN.bottom) * S;
/** The mantis stand's head under the belly, mm: its length, its width (the column's) and its floor under the slot. */
const BELLY = { long: 14, wide: COLUMN.wide, floor: 3 };

/** The middle of the hull's length as it prints (mm, its print's x), modules and all. */
function middleOf(hull: Hull): number {
  const frame = printFrame(HULL_PRINT[hull].bed);
  const box = new Box3();
  for (const p of placedSolids(shipModel(hull).root))
    box.union(new Box3(new Vector3(...p.bounds[0]), new Vector3(...p.bounds[1])).applyMatrix4(frame));
  return (box.min.x + box.max.x) / 2;
}

/**
 * How each hull stands: its keel's height above the table, where along the
 * ship (mm, the hull print's x) the stand meets it, and how far along the
 * base's x the stand's head stands from the socket (its column leaning to
 * get there), so the ship is centred over the base.
 */
export function standOf(hull: Hull): { bed: number; at: number; head: number } {
  const deck = deckTop();
  switch (hull) {
    case "corvette":
      return { bed: 34, at: HULL_PRINT.corvette.socket!.x * S, head: 0 };
    case "mantis": {
      // Held under the core along the fin's leading edge, aft of the
      // ship's middle: the column leans aft to centre the ship, no more than
      // 45 degrees over its height.
      const at = ((MANTIS_FIN.fore + MANTIS_FIN.lead) / 2) * S;
      return { bed: 54, at, head: at - middleOf(hull) };
    }
    case "shrike":
      // The blade's bottom 8 mm off the deck, gripped at its middle (the
      // pale band along its leading edge left out of the grip).
      return {
        bed: deck + 8 + BLADE_DROP,
        at: ((SHRIKE_BLADE.aft + SHRIKE_BLADE.fore - SHRIKE_BLADE.band) / 2) * S,
        head: 0,
      };
  }
}

/** The peg up into the hull's socket from its keel at `bed`, 0.5 short of the socket's depth. */
function peg(hull: Hull, bed: number): Solid {
  const { peg: side, depth } = HULL_PRINT[hull].socket!;
  return block([-side / 2, -side / 2, bed - 0.01], [side / 2, side / 2, bed + depth - 0.5]);
}

/**
 * A block [x0, x1] x [y0, y1] from z0 to z1 that the column carries: under
 * it a flare at 45 degrees down to the column, so it has no shelf to print.
 */
function head([x0, x1]: [number, number], [y0, y1]: [number, number], z0: number, z1: number): Solid {
  const rise = Math.max(x1 - x0 - COLUMN.long, y1 - y0 - COLUMN.wide) / 2;
  const outline: Point[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  // Turned over about x the flare would land at -y; it is symmetric in y, and
  // its outline is centred on (cx, 0) before the turn.
  const cx = (x0 + x1) / 2;
  const centred: Point[] = outline.map(([x, y]) => [x - cx, y]);
  const flare = move(turn(taper(centred, rise), "x", 180), cx, 0, z0 + 0.01);
  return fuse(flare, block([x0, y0, z0], [x1, y1, z1]));
}

/** The stand for `hull`, in the base's frame: its axis on z, the deck at deckTop(). */
export function buildStand(hull: Hull): Solid {
  const deck = deckTop();
  const { bed, at, head: hx } = standOf(hull);
  const tenon = move(prism(socketOutline(), SOCKET.depth - 0.3 + 0.01), 0, 0, deck - SOCKET.depth + 0.3);
  // The column, from the socket to the head, leaning to it if the head stands off the socket.
  const column = (to: number) => {
    if (!hx) return block([-COLUMN.long / 2, -COLUMN.wide / 2, deck], [COLUMN.long / 2, COLUMN.wide / 2, to + 0.01]);
    const rise = to + 0.01 - deck;
    if (Math.abs(hx) > rise) throw new Error(`The ${hull} stand leans past 45 degrees`);
    const profile: Point[] = [
      [-COLUMN.long / 2, 0],
      [COLUMN.long / 2, 0],
      [COLUMN.long / 2 + hx, rise],
      [-COLUMN.long / 2 + hx, rise],
    ];
    // Drawn in (x, z) and pulled along y: a quarter turn about x stands it up.
    return move(turn(prism(profile, COLUMN.wide), "x", 90), 0, COLUMN.wide / 2, deck);
  };
  switch (hull) {
    case "corvette":
      return fuse(tenon, column(bed), peg(hull, bed));
    case "mantis": {
      // A head the belly stands on, flat at the keel, with a slot through
      // it the fin drops into, open at both ends.
      const half = (MANTIS_FIN.band * S) / 2 + FDM.join + FIT;
      const z0 = bed - FIN_DROP - BELLY.floor;
      const top = head(
        [hx - BELLY.long / 2, hx + BELLY.long / 2],
        [-BELLY.wide / 2, BELLY.wide / 2],
        z0,
        bed
      );
      const slot = block(
        [hx - BELLY.long / 2 - 1, -half, bed - FIN_DROP - FIT],
        [hx + BELLY.long / 2 + 1, half, bed + 1]
      );
      const rise = (BELLY.long - COLUMN.long) / 2;
      return fuse(tenon, column(z0 - rise), subtract(top, slot));
    }
    case "shrike": {
      // A block with a slot the blade's bottom drops into.
      const bottom = bed - BLADE_DROP;
      const depth = 5;
      const slot = {
        x0: SHRIKE_BLADE.aft * S - at,
        x1: (SHRIKE_BLADE.fore - SHRIKE_BLADE.band) * S - at,
        half: (SHRIKE_BLADE.thick * S) / 2 + FDM.join + FIT,
      };
      const [gx, gy]: [[number, number], [number, number]] = [
        [Math.min(slot.x0 - 2, -COLUMN.long / 2), Math.max(slot.x1 + 2, COLUMN.long / 2)],
        [-slot.half - 2.5, slot.half + 2.5],
      ];
      const grip = head(gx, gy, bottom - 3, bottom + depth);
      const cut = block([slot.x0, -slot.half, bottom], [slot.x1, slot.half, bottom + depth + 1]);
      const rise = Math.max(gx[1] - gx[0] - COLUMN.long, gy[1] - gy[0] - COLUMN.wide) / 2;
      return fuse(tenon, column(bottom - 3 - rise), subtract(grip, cut));
    }
  }
}

/** The stand for `hull` as it prints: upright, its tenon on the bed. */
export function printStand(hull: Hull): Solid {
  return move(buildStand(hull), 0, 0, -(deckTop() - SOCKET.depth + 0.3));
}
