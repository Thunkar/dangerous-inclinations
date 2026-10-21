// Each hull's display stand, printed on its own, upright: a tenon that plugs
// into the base's socket (keyed, so the ship faces the bow), a column, and
// at its top what holds that hull. The corvette takes a peg in the socket
// under its core; the shrike's stand carries its blade, and the hull sits on
// it on filament pins, unglued; the mantis's belly
// stands on its head with the keel fin under the core dropped into a slot.
// Every hull's keel stands level with the top of the shrike's blade, with a
// hand's room over the deck to move cubes, and the corvette's and the mantis's
// columns lean to put the ship's middle over the deck's (the socket is aft of
// it).
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
import { HULL_PRINT, buildBelow, shipModel } from "./hull.ts";
import { SOCKET, socketOutline, socketTaper, deckTop, deckMiddle } from "./base.ts";

const S = PRINT.mmPerUnit;
/** The column, inside the socket's outline. */
const COLUMN = { long: 12, wide: 8 };
/** Room round what a stand holds, beyond the print's own growth. */
const FIT = 0.15;

/** How far the shrike's blade's bottom stands off the deck, mm: its edges run on down to it. */
const BLADE_RISE = 8;

/**
 * Where the shrike's blade's leading or trailing edge is at game height y
 * (game x), its straight edges carried on below the blade's bottom: the
 * leading edge from the root to its foot, the trailing edge from its foot to
 * the crank.
 */
function bladeEdge(edge: "lead" | "trail", y: number): number {
  const { bottom, aft, fore, root, crank } = SHRIKE_BLADE;
  const [x0, [x1, y1]] = edge === "lead" ? [fore, root] : [aft, crank];
  return x0 + ((y - bottom) * (x1 - x0)) / (y1 - bottom);
}

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
 * get there), so the ship is centred over the deck.
 */
export function standOf(hull: Hull): { bed: number; at: number; head: number } {
  const deck = deckTop();
  // The shrike's blade's bottom 8 mm off the deck, its edges carried on down
  // to the deck, and the socket under the middle of what reaches it. Every
  // other hull's keel is level with the top of that blade, high enough for
  // fingers to move cubes under it.
  const y = HULL_INFO.shrike.keel - (BLADE_RISE + BLADE_DROP) / S;
  const bed = deck + BLADE_RISE + BLADE_DROP;
  // The column leans forward or aft to put the ship's middle over the deck's.
  const centred = (at: number) => ({ bed, at, head: deckMiddle() + at - middleOf(hull) });
  switch (hull) {
    case "corvette":
      // The peg in the socket under its core.
      return centred(HULL_PRINT.corvette.socket!.x * S);
    case "mantis":
      // Held under the core along the fin's leading edge.
      return centred(((MANTIS_FIN.fore + MANTIS_FIN.lead) / 2) * S);
    case "shrike":
      return { bed, at: ((bladeEdge("lead", y) + bladeEdge("trail", y)) / 2) * S, head: 0 };
  }
}

/** The peg up into the hull's socket from its keel at `bed`, at x, 0.5 short of the socket's depth. */
function peg(hull: Hull, bed: number, x: number): Solid {
  const { peg: side, depth } = HULL_PRINT[hull].socket!;
  return block([x - side / 2, -side / 2, bed - 0.01], [x + side / 2, side / 2, bed + depth - 0.5]);
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
  const tenon = socketTaper(socketOutline(-SOCKET.fit), deck + 0.01, SOCKET.depth - SOCKET.room + 0.01);
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
      return fuse(tenon, column(bed), peg(hull, bed, hx));
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
      // The blade is the stand's, and the hull sits on it on filament pins in
      // the holes both share, unglued. Its edges run on straight down to the
      // deck, the pale band with them, and it grows out of a collar on the
      // socket: out at 45 degrees from the tenon and back in at 45 to the
      // blade, so nothing about it is a box and nothing hangs.
      const bottom = bed - BLADE_DROP;
      const half = (SHRIKE_BLADE.thick * S) / 2 + FDM.join;
      const band = ((SHRIKE_BLADE.thick + SHRIKE_BLADE.proud) * S) / 2 + FDM.join;
      const blade = move(turn(buildBelow("shrike")!, "x", 180), -at, 0, bed);
      // Stand x of an edge at stand height z.
      const edge = (e: "lead" | "trail", z: number) =>
        bladeEdge(e, HULL_INFO.shrike.keel + (z - bed) / S) * S - at;
      const top = bottom + 0.6;
      const out = 0.9;
      // The web stands on the collar's widest course: where the leading edge
      // runs out past it, its foot comes back in under it at 45 degrees, and
      // at the top it reaches a little past the blade's own bottom.
      const z0 = deck + out;
      const reach = SOCKET.long / 2 - SOCKET.fit + out - 0.15;
      const lead0 = edge("lead", z0);
      const foot = Math.min(lead0, reach);
      const meet = (lead0 - foot) / (1 - (edge("lead", z0 + 1) - lead0));
      const sheet = (pts: Point[], t: number) => move(turn(prism(pts, 2 * t), "x", 90), 0, t, 0);
      const fore = (back: number): Point[] => [
        [back, z0],
        [foot, z0],
        ...(meet > 0 ? [[foot + meet, z0 + meet] as Point] : []),
        [edge("lead", top) + 0.3, top],
      ];
      const web = sheet([[edge("trail", z0), z0], ...fore(0).slice(1), [edge("trail", top) - 0.5, top]], half);
      const strip = sheet(
        [...fore(lead0 - SHRIKE_BLADE.band * S), [edge("lead", top) - SHRIKE_BLADE.band * S, top]],
        band
      );
      // The collar: the tenon's outline grown out at 45 degrees by `out`,
      // then drawn back in at 45 till it is no wider than the blade.
      const grown = socketOutline(out - SOCKET.fit);
      const mirrored = grown.map(([x, yy]): Point => [x, -yy]);
      const under = move(turn(taper(mirrored, out), "x", 180), 0, 0, deck + out);
      const rise = SOCKET.wide / 2 - SOCKET.fit + out - half;
      const over = move(taper(grown, rise), 0, 0, deck + out - 0.01);
      return fuse(tenon, under, over, web, strip, blade);
    }
  }
}

/** The stand for `hull` as it prints: upright, its tenon on the bed. */
export function printStand(hull: Hull): Solid {
  return move(buildStand(hull), 0, 0, -(deckTop() - SOCKET.depth + SOCKET.room));
}
