// Each hull's display stand, printed on its own, upright: a tenon that plugs
// into the base's socket (keyed, so the ship faces the bow), a column, and
// at its top what holds that hull. The corvette takes a peg in the socket
// under its core; the shrike's blade hangs where a peg would go, so its
// stand grips the blade's flat bottom; the mantis's keel is too narrow for
// a peg of the corvette's size, so its stand cradles the keel in a 60-degree
// V with a slim peg up its middle. Each stands its
// hull high enough to clear the base: the mantis's arms over the side slots'
// pockets with a hand's room under them.
import { subtract, fuse } from "fluidcad/core";
import type { Hull } from "@dangerous-inclinations/engine";
import { HULL_INFO } from "../../ui/src/ships/hulls.ts";
import { SHRIKE_BLADE } from "../../ui/src/ships/shrike.ts";
import { MANTIS_KEEL } from "../../ui/src/ships/mantis.ts";
import { FDM, PRINT } from "../spec.ts";
import { block, prism, move, section, taper, turn, type Point, type Solid } from "../lib/solids.ts";
import { HULL_PRINT } from "./hull.ts";
import { SOCKET, socketOutline, deckTop } from "./base.ts";

const S = PRINT.mmPerUnit;
/** The column, inside the socket's outline. */
const COLUMN = { long: 12, wide: 8 };
/** Room round what a stand holds, beyond the print's own growth. */
const FIT = 0.15;

/** How far the shrike's blade hangs below its keel, mm. */
const BLADE_DROP = (HULL_INFO.shrike.keel - SHRIKE_BLADE.bottom) * S;

/**
 * How each hull stands: its keel's height above the table, and where along
 * the ship (mm, the hull print's x) the stand's axis meets it.
 */
export function standOf(hull: Hull): { bed: number; at: number } {
  const deck = deckTop();
  switch (hull) {
    case "corvette":
      return { bed: 34, at: HULL_PRINT.corvette.socket!.x * S };
    case "mantis":
      return { bed: 50, at: HULL_PRINT.mantis.socket!.x * S };
    case "shrike":
      // The blade's bottom 8 mm off the deck, gripped at its middle (the
      // pale band along its leading edge left out of the grip).
      return {
        bed: deck + 8 + BLADE_DROP,
        at: ((SHRIKE_BLADE.aft + SHRIKE_BLADE.fore - SHRIKE_BLADE.band) / 2) * S,
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
  const flare = move(turn(taper(outline, rise), "x", 180), 0, 0, z0 + 0.01);
  return fuse(flare, block([x0, y0, z0], [x1, y1, z1]));
}

/** The stand for `hull`, in the base's frame: its axis on z, the deck at deckTop(). */
export function buildStand(hull: Hull): Solid {
  const deck = deckTop();
  const { bed, at } = standOf(hull);
  const tenon = move(prism(socketOutline(), SOCKET.depth - 0.3 + 0.01), 0, 0, deck - SOCKET.depth + 0.3);
  const column = (to: number) =>
    block([-COLUMN.long / 2, -COLUMN.wide / 2, deck], [COLUMN.long / 2, COLUMN.wide / 2, to + 0.01]);
  switch (hull) {
    case "corvette":
      return fuse(tenon, column(bed), peg(hull, bed));
    case "mantis": {
      // A cradle under the keel, a V as steep as the keel's sides.
      const depth = 3;
      const cradle = { long: 22, wide: 16, below: 4 };
      let top: Solid = head(
        [-cradle.long / 2, cradle.long / 2],
        [-cradle.wide / 2, cradle.wide / 2],
        bed - cradle.below,
        bed + depth
      );
      const w0 = MANTIS_KEEL.foot * S + FDM.join + FIT;
      const w1 = w0 + (depth + 1) / Math.tan(Math.PI / 3);
      const groove = section(
        [
          [-w0, bed],
          [w0, bed],
          [w1, bed + depth + 1],
          [-w1, bed + depth + 1],
        ],
        cradle.long + 2
      );
      top = subtract(top, move(groove, -cradle.long / 2 - 1, 0, 0));
      // And a peg up into the keel, so the ship cannot pitch onto its arms.
      const rise = (cradle.long - COLUMN.long) / 2;
      return fuse(tenon, column(bed - cradle.below - rise), top, peg(hull, bed));
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
