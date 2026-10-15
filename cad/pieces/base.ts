// The player's base: one deck, an octagon in plan with its sides sloping
// down to the table, the display ship on a stand in the middle, and cut
// into the deck everything a player tracks at the table. Each loadout slot
// is a pocket beside where its module hangs on the ship, deep enough for any
// module to stand in it mating face up (every module shows the same base
// plate, so a hidden slot gives nothing away), with a rail of cube pockets
// for its energy. Astern lie the fixed subsystems' rails (engines,
// thrusters, scoop) and the heat track, each marked with the game's icon,
// and the hull and fuel sliders' tracks drop into seats along the flanks.
// Everything is packed as close as fingers allow: the side slots' pockets
// lie under the ship, which stands clear of the deck.
// The deck is as thick as the tallest module needs, and nothing stands on
// it but the ship's stand, printed for each hull (pieces/stand.ts), in the
// socket at its centre.
import { subtract } from "fluidcad/core";
import {
  SUBSYSTEM_CONFIGS,
  canInstallInSlot,
  MAX_HEAT,
  type SubsystemType,
} from "@dangerous-inclinations/engine";
import { CUBE } from "../spec.ts";
import { block, prism, taper, move, type Point, type Solid } from "../lib/solids.ts";
import { engrave, type IconName } from "../lib/icons.ts";
import { envelopeOf, MODULE_TYPES } from "./module.ts";
import { TRACK_SIZE } from "./slider.ts";

/** Plastic under a module pocket. */
const FLOOR = 1.5;
/** Room round a module in its pocket, and how far under the rim its plate sits. */
const ROOM = 0.4;
const SUNK = 0.5;
/** Cube pockets in a row: the pocket and the wall between two. */
const PITCH = CUBE.pocket + CUBE.wall;
/** Room round a slider track bar in its seat. */
const SEAT = 0.2;
/** The deck's sides, from vertical. */
const SLOPE = 20;
/** Icons engraved beside the rails and tracks, mm square. */
const ICON = 8;
/**
 * The socket every hull's stand plugs into, at the deck's centre: a
 * rectangle with its fore port corner cut, so a stand goes in only facing
 * the bow, and as deep as the deck allows.
 */
export const SOCKET = { long: 14, wide: 10, key: 3, depth: 8, clearance: 0.15 };

/** The socket's outline, grown by g (the stand's tenon is it shrunk). */
export function socketOutline(g = 0): Point[] {
  const [x, y, k] = [SOCKET.long / 2 + g, SOCKET.wide / 2 + g, SOCKET.key];
  return [
    [-x, -y],
    [x, -y],
    [x, y - k],
    [x - k, y],
    [-x, y],
  ];
}

/** How high the deck stands: every stand starts there. */
export function deckTop(): number {
  return FLOOR + pocket().depth;
}

/** The pocket every module fits, and how deep the tallest needs it. */
function pocket() {
  const all = MODULE_TYPES.map(envelopeOf);
  return {
    long: Math.max(...all.map((e) => e.long)) + 2 * ROOM,
    wide: Math.max(...all.map((e) => e.wide)) + 2 * ROOM,
    depth: Math.max(...all.map((e) => e.tall)) + SUNK,
  };
}

/** The most energy a slot can hold: the largest of any subsystem that fits it. */
function capacity(slot: "forward" | "side"): number {
  return Math.max(
    ...(Object.keys(SUBSYSTEM_CONFIGS) as SubsystemType[])
      .filter((t) => canInstallInSlot(t, slot))
      .map((t) => SUBSYSTEM_CONFIGS[t].maxEnergy)
  );
}

/** The length of a row of `n` cube pockets, end walls included. */
const rowLength = (n: number) => n * PITCH + CUBE.wall;

/** A row of `n` cube pockets cut down from z, centred on (x, y), along x or y. */
function cubeRow(n: number, [x, y]: Point, z: number, along: "x" | "y"): Solid[] {
  const half = CUBE.pocket / 2;
  return Array.from({ length: n }, (_, i) => {
    const t = -rowLength(n) / 2 + CUBE.wall + half + i * PITCH;
    const [cx, cy] = along === "x" ? [x + t, y] : [x, y + t];
    return block([cx - half, cy - half, z - CUBE.pocketDepth], [cx + half, cy + half, z + 1]);
  });
}

/** An octagon: the rectangle [x0, x1] x [-y, y] with its corners cut by c. */
function octagon(x0: number, x1: number, y: number, c: number): Point[] {
  return [
    [x0 + c, -y],
    [x1 - c, -y],
    [x1, -y + c],
    [x1, y - c],
    [x1 - c, y],
    [x0 + c, y],
    [x0, y - c],
    [x0, -y + c],
  ];
}

/** Whether the square of half side r about p lies inside the convex polygon (anticlockwise). */
function inside(polygon: Point[], [x, y]: Point, r: number): boolean {
  return polygon.every(([ax, ay], i) => {
    const [bx, by] = polygon[(i + 1) % polygon.length];
    const [ex, ey] = [bx - ax, by - ay];
    const len = Math.hypot(ex, ey);
    // Distance of the square's worst corner to the edge's line, inward positive.
    const d = (ex * (y - ay) - ey * (x - ax)) / len - r * (Math.abs(ex) + Math.abs(ey)) / len;
    return d >= 0;
  });
}

export function buildBase(): Solid {
  const p = pocket();
  const top = deckTop();
  const inset = top * Math.tan((SLOPE * Math.PI) / 180);
  // Where things sit on the deck: the ship's centre line on y = 0, the bow +x.
  // The side slots' pockets lie under the ship's flanks (it stands well clear
  // of the deck, and a pocket is reached only to reveal), their rails just
  // outboard of the ship, and the slider tracks outboard of those.
  const side = { inner: 8, fore: 23, aft: -25 };
  const railY = side.inner + p.wide + CUBE.wall + CUBE.pocket / 2;
  const trackY0 = railY + CUBE.pocket / 2 + CUBE.wall + 1.5;
  const trackWide = TRACK_SIZE.y[1] - TRACK_SIZE.y[0] + 2 * SEAT;
  const half = trackY0 + trackWide + 3;
  const bow = { pocket: 37, rail: 37 + p.wide + CUBE.wall + CUBE.pocket / 2 };
  // Astern of the side slots, with room between, the fixed subsystems' rails
  // (each icon in line with its cubes), and behind those the heat track
  // folded in two rows of five.
  const aftSlot = side.aft - Math.max(p.long, rowLength(capacity("side"))) / 2;
  const rails = aftSlot - 6 - CUBE.pocket / 2;
  const heat = [rails - CUBE.pocket / 2 - CUBE.wall - 3 - CUBE.pocket / 2];
  heat.push(heat[0] - PITCH);
  // The tracks run from just fore of the fixed rails.
  const trackX0 = rails + CUBE.pocket / 2 + CUBE.wall + 1;
  const x1 = bow.rail + CUBE.pocket / 2 + CUBE.wall + 2;
  const x0 = heat[1] - CUBE.pocket / 2 - CUBE.wall - 2;

  // The deck: the top octagon grown by the slope at the table, drawn in to it.
  const c = 14;
  const rim = octagon(x0, x1, half, c);
  let body: Solid = taper(octagon(x0 - inset, x1 + inset, half + inset, c + inset * 0.4), top, SLOPE);

  const cuts: Solid[] = [];
  const modulePocket = ([cx, cy]: Point, across: boolean) => {
    const [lx, ly] = across ? [p.wide, p.long] : [p.long, p.wide];
    cuts.push(block([cx - lx / 2, cy - ly / 2, FLOOR], [cx + lx / 2, cy + ly / 2, top + 1]));
    // A finger notch at one end to lift a module out.
    const [nx, ny] = across ? [cx, cy + ly / 2] : [cx + lx / 2, cy];
    cuts.push(block([nx - 3, ny - 3, top - 6], [nx + 3, ny + 3, top + 1]));
  };
  // The side slots: two to a flank, the rail outboard of the pocket.
  for (const s of [-1, 1])
    for (const x of [side.fore, side.aft]) {
      modulePocket([x, s * (side.inner + p.wide / 2)], false);
      cuts.push(...cubeRow(capacity("side"), [x, s * railY], top, "x"));
    }
  // The forward slot: across the bow, its rail ahead of it.
  modulePocket([bow.pocket + p.wide / 2, 0], true);
  cuts.push(...cubeRow(capacity("forward"), [bow.rail, 0], top, "y"));
  // Astern: the fixed subsystems' rails across the ship, each marked, then heat.
  const fixed: SubsystemType[] = ["engines", "rotation", "scoop"];
  // Spread across the stern: the engines and the scoop out at the flanks,
  // the thrusters' one cube by the centre line, the middle left clear; each
  // icon at the port end of its row, as the heat track's is.
  const marks: { icon: IconName; at: Point }[] = [];
  const outer = half - CUBE.wall - 1;
  const mark = ICON + 1;
  fixed.forEach((f, i) => {
    const n = SUBSYSTEM_CONFIGS[f].maxEnergy;
    const length = rowLength(n);
    const s = i - 1;
    const mid =
      s > 0 ? outer - mark - length / 2 : s < 0 ? -(outer - length / 2) : (length - (length + mark)) / 2;
    cuts.push(...cubeRow(n, [rails, mid], top, "y"));
    marks.push({ icon: f, at: [rails, mid + length / 2 + 1 + ICON / 2] });
  });
  const fold = MAX_HEAT / 2;
  for (const x of heat) cuts.push(...cubeRow(fold, [x, 0], top, "y"));
  marks.push({ icon: "heat", at: [(heat[0] + heat[1]) / 2, rowLength(fold) / 2 + ICON / 2 + 2] });
  // The slider tracks' seats along the flanks, flush with the deck: hull to
  // port, fuel to starboard (each track carries its own icon).
  for (const s of [-1, 1]) {
    const [ya, yb] = [s * trackY0, s * (trackY0 + trackWide)];
    cuts.push(
      block(
        [trackX0, Math.min(ya, yb), top - TRACK_SIZE.height],
        [trackX0 + TRACK_SIZE.length + 2 * SEAT, Math.max(ya, yb), top + 1]
      )
    );
  }
  // One cut at a time: a fuse of tools that do not touch yields nothing.
  for (const cut of cuts) body = subtract(body, cut);

  // The socket the hull's stand plugs into.
  body = subtract(body, move(prism(socketOutline(SOCKET.clearance), SOCKET.depth + 1), 0, 0, top - SOCKET.depth));
  const base = body;
  // Every icon stands clear of the deck's edge, where the slope would cut it.
  for (const m of marks)
    if (!inside(rim, m.at, ICON / 2 + 1.5))
      throw new Error(`The ${m.icon} icon at ${m.at.map((v) => v.toFixed(1))} runs off the deck`);
  for (const m of marks) engrave(m.icon, ICON, m.at, top);
  return base;
}
