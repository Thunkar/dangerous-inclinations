// The player's base: one deck, an octagon in plan with its sides sloping
// down to the table, the display ship on a stand in the middle, and cut
// into the deck everything a player tracks at the table. Each loadout slot
// is a pocket beside where its module hangs on the ship, deep enough for any
// module to stand in it mating face up (every module shows the same base
// plate, so a hidden slot gives nothing away), with a rail of cube pockets
// for its energy. Astern lie the fixed subsystems' rails (engines,
// thrusters, scoop) and the heat track, each marked with the game's icon,
// and the hull and fuel sliders' tracks drop into seats along the flanks.
// The deck is as thick as the tallest module needs, and nothing stands on
// it but the stand.
import { subtract, fuse } from "fluidcad/core";
import {
  SUBSYSTEM_CONFIGS,
  canInstallInSlot,
  MAX_HEAT,
  type SubsystemType,
} from "@dangerous-inclinations/engine";
import { CUBE, STAND } from "../spec.ts";
import { block, taper, move, type Point, type Solid } from "../lib/solids.ts";
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
const SLOPE = 30;
/** Icons engraved beside the rails and tracks, mm square. */
const ICON = 8;
/** Where the ship's bed stands above the table. */
export const SHIP_BED = 34;

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

/** A square of side s centred on the origin. */
const square = (s: number): Point[] => [
  [-s / 2, -s / 2],
  [s / 2, -s / 2],
  [s / 2, s / 2],
  [-s / 2, s / 2],
];

export function buildBase(): Solid {
  const p = pocket();
  const top = FLOOR + p.depth;
  const inset = top * Math.tan((SLOPE * Math.PI) / 180);
  // Where things sit on the deck: the ship's centre line on y = 0, the bow +x.
  const side = { inner: 22, fore: 23, aft: -25 };
  const railY = side.inner + p.wide + CUBE.wall + CUBE.pocket / 2;
  const trackY0 = railY + CUBE.pocket / 2 + CUBE.wall + 2;
  const trackWide = TRACK_SIZE.y[1] - TRACK_SIZE.y[0];
  const half = trackY0 + trackWide + 2 * SEAT + 4;
  const bow = { pocket: 46, rail: 46 + p.wide + CUBE.wall + CUBE.pocket / 2 };
  // The fixed subsystems' rails with the slots' (their icons aft of them),
  // and the heat track behind, along the stern.
  const stern = { rails: -52, heat: -52 - CUBE.pocket - 2 * CUBE.wall - ICON - 2 };
  const x1 = bow.rail + CUBE.pocket / 2 + CUBE.wall + 3;
  const x0 = stern.heat - CUBE.pocket / 2 - CUBE.wall - 3;

  // The deck: the top octagon grown by the slope at the table, drawn in to it.
  // Its corners are cut as far as the heat track along the stern allows.
  const c = 12;
  const deckTop = octagon(x0, x1, half, c);
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
  const fixed: { type: SubsystemType; icon: IconName }[] = [
    { type: "engines", icon: "thrusters" },
    { type: "rotation", icon: "maneuvering_thrusters" },
    { type: "scoop", icon: "scoop" },
  ];
  const gap = 4;
  const groups = fixed.map((f) => rowLength(SUBSYSTEM_CONFIGS[f.type].maxEnergy));
  const total = groups.reduce((a, b) => a + b, 0) + gap * (groups.length - 1);
  const marks: { icon: IconName; at: Point }[] = [];
  let y = -total / 2;
  fixed.forEach((f, i) => {
    const mid = y + groups[i] / 2;
    cuts.push(...cubeRow(SUBSYSTEM_CONFIGS[f.type].maxEnergy, [stern.rails, mid], top, "y"));
    marks.push({ icon: f.icon, at: [stern.rails - CUBE.pocket / 2 - CUBE.wall - ICON / 2 - 1, mid] });
    y += groups[i] + gap;
  });
  cuts.push(...cubeRow(MAX_HEAT, [stern.heat, 0], top, "y"));
  marks.push({ icon: "heat", at: [stern.heat, rowLength(MAX_HEAT) / 2 + ICON / 2 + 2] });
  // The slider tracks' seats along the flanks, flush with the deck: hull
  // to port, fuel to starboard, each marked at its fore end.
  for (const s of [-1, 1]) {
    const yIn = s * trackY0;
    const yOut = s * (trackY0 + trackWide + 2 * SEAT);
    const xa = -TRACK_SIZE.length / 2 - SEAT;
    const xb = TRACK_SIZE.length / 2 + SEAT;
    cuts.push(
      block([xa, Math.min(yIn, yOut), top - TRACK_SIZE.height], [xb, Math.max(yIn, yOut), top + 1])
    );
    marks.push({
      icon: s > 0 ? "damage" : "fuel",
      at: [xb + ICON / 2 + 2, s * (trackY0 + trackWide / 2 + SEAT)],
    });
  }
  // One cut at a time: a fuse of tools that do not touch yields nothing.
  for (const cut of cuts) body = subtract(body, cut);

  // The stand: a tapered pedestal off the deck, and the peg the ship's socket takes.
  const rise = SHIP_BED - STAND.depth + 0.5 - top;
  const pedestal = move(taper(square(26), rise + 0.01, 14), 0, 0, top - 0.01);
  const pin = block(
    [-STAND.peg / 2, -STAND.peg / 2, top + rise - 0.5],
    [STAND.peg / 2, STAND.peg / 2, SHIP_BED - 0.5]
  );
  const base = fuse(body, pedestal, pin);
  // Every icon stands clear of the deck's edge, where the slope would cut it.
  for (const m of marks)
    if (!inside(deckTop, m.at, ICON / 2 + 1.5))
      throw new Error(`The ${m.icon} icon at ${m.at.map((v) => v.toFixed(1))} runs off the deck`);
  for (const m of marks) engrave(m.icon, ICON, m.at, top);
  return base;
}
