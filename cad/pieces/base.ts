// The player's base: one deck with the display ship on a stand in the
// middle, and on it everything a player tracks at the table. The five
// loadout slots are bays at the deck's edge, laid out as the ship carries
// them (two to a flank, facing out, and the bow's facing forward): each hides
// its module behind a door that folds out over the edge and lies on the
// table when open (pieces/bay.ts), and each has a channel of energy cubes
// inboard of it. Astern lies the heat track, two rows of five, and in the
// bow's corners and by the heat track the fixed subsystems' channels
// (engines, scoop, thrusters), each marked with the game's icon. A channel
// is one slot the cubes stand in side by side, ticked where one cube ends and
// the next begins, with no wall between them.
//
// Prints as one piece with its doors in place, open, lying on the bed outside
// the deck. Frame: x forward, y to port, z up, the bed at z = 0.
import { subtract, fuse } from "fluidcad/core";
import { SUBSYSTEM_CONFIGS, canInstallInSlot, MAX_HEAT, type SubsystemType } from "@dangerous-inclinations/engine";
import { CUBE, MOUNT } from "../spec.ts";
import { block, prism, move, taper, turn, vee, type Point, type Solid } from "../lib/solids.ts";
import { engrave, type IconName } from "../lib/icons.ts";
import { plugTool } from "../lib/mount.ts";
import { bayBase, bayDoor, bayOf, bayPlug, bayPocket, bayPush, KNEE } from "./bay.ts";

/** The plastic round a channel. */
const RIM = 1.2;
/** The deck's top: level with the bays' roofs, so the cubes stand where fingers reach them. */
const DECK = bayOf().roof.top;
/** Between a bay's door and the deck round it: the door is printed in place. */
const GAP = 0.35;
/** A cube's length along a channel, room included. */
const STEP = CUBE.size + 0.2;
/** A channel's ticks: a V across each rim at every cube's end. */
const TICK = { width: 0.8, depth: 0.5, long: 1.6 };
/** Icons engraved beside the channels, mm square. */
const ICON = 7;
/** Between the heat track's end and the thrusters' channel beyond it. */
const APART = 5;
/** The deck's corners, cut at 45 degrees. */
const CORNER = 6;
/** Room between two bays standing side by side: their channels are longer than they are wide. */
const BETWEEN = 2.2;

/**
 * The socket every hull's stand plugs into, at the deck's centre: a
 * rectangle with its fore port corner cut, so a stand goes in only facing
 * the bow, its walls drawn in by `taper` degrees as it goes down. The stand's
 * tenon has the same taper and is `fit` smaller all round, so it wedges in
 * under the ship's weight with no play, sitting that little lower than
 * flush (fit / tan taper, about 1.4 mm, which a print's usual oversize takes
 * back), and stops `room` short of the socket's floor.
 */
export const SOCKET = { long: 14, wide: 10, key: 3, depth: 14, taper: 4, fit: 0.1, room: 2 };
/** How far the socket keeps clear of the flank channels. */
const PAD = { rim: 2 };

/**
 * A tapered plug of `outline` at its top at z = top, `deep` long, narrowing
 * downward at the socket's taper: the socket's cut and the stand's tenon.
 */
export function socketTaper(outline: Point[], top: number, deep: number): Solid {
  // A taper narrows upward: drawn mirrored and turned over about x, it
  // narrows downward with the outline the right way round.
  const mirrored = outline.map(([x, y]): Point => [x, -y]);
  return move(turn(taper(mirrored, deep, SOCKET.taper), "x", 180), 0, 0, top);
}

/** The socket's outline at the deck, grown by g (the stand's tenon is it shrunk by the fit). */
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

/** Where every stand starts: the deck's top. */
export function deckTop(): number {
  return DECK;
}

/** The middle of the deck's length (x): where a ship on its stand is centred. */
export function deckMiddle(): number {
  const xs = outline().map(([x]) => x);
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

/** The most energy a slot can hold: the largest of any subsystem that fits it. */
function capacity(slot: "forward" | "side"): number {
  return Math.max(
    ...(Object.keys(SUBSYSTEM_CONFIGS) as SubsystemType[])
      .filter((t) => canInstallInSlot(t, slot))
      .map((t) => SUBSYSTEM_CONFIGS[t].maxEnergy)
  );
}

/** A channel of n cubes' length, and the width it takes with its rims. */
const channelLength = (n: number) => n * STEP + 0.3;
const BAND = CUBE.pocket + 2 * RIM;

/** A channel of `n` cubes centred on (x, y), along x or y: the slot and its ticks. */
function channel(n: number, [x, y]: Point, along: "x" | "y"): Solid[] {
  const long = channelLength(n);
  const half = CUBE.pocket / 2;
  const tools: Solid[] = [];
  const slot = block([-long / 2, -half, DECK - CUBE.pocketDepth], [long / 2, half, DECK + 1]);
  tools.push(slot);
  for (let i = 1; i < n; i++) {
    const t = -long / 2 + 0.15 + i * STEP;
    for (const s of [-1, 1]) {
      const [y0, y1] = s > 0 ? [half - 0.01, half + TICK.long] : [-half - TICK.long, -half + 0.01];
      tools.push(move(vee(TICK.width, TICK.depth, y0, y1), t, 0, DECK));
    }
  }
  return tools.map((tool) => move(along === "x" ? tool : turn(tool, "z", 90), x, y, 0));
}

/** Where the bays stand: each one's place and turn in the deck's frame (a bay's +y out of its door). */
function bays() {
  const b = bayOf();
  const depth = b.front + b.wall + 2;
  const width = 2 * (b.half + 2);
  const pad = SOCKET.wide / 2 + PAD.rim;
  // The flank bays' backs stand a channel's band outboard of the pad.
  const back = pad + BAND;
  const half = back + depth;
  const along = width / 2 + BETWEEN / 2;
  // Ahead of the fore bays' channels, the bow's channel, then the bow bay.
  const bowChannel = along + channelLength(capacity("side")) / 2 + RIM + CUBE.pocket / 2;
  const bowBack = bowChannel + CUBE.pocket / 2 + RIM;
  const bow = bowBack + depth;
  return {
    b,
    depth,
    width,
    half,
    bow,
    stern: -(along + width / 2),
    flank: [-1, 1].flatMap((s) => [-along, along].map((x) => ({ x, side: s }))),
    channels: { flank: (s: number) => s * (back - BAND / 2), bow: bowChannel },
  };
}

/** A bay's solid placed: its own frame (x along its wall, y out of its door) turned onto the deck. */
function placed(solid: Solid, at: { x: number; y: number; turn: number }): Solid {
  return move(turn(solid, "z", at.turn), at.x, at.y, 0);
}

/** The five bays' places: a bay's door edge on the deck's edge. */
function bayPlaces() {
  const L = bays();
  const out = L.b.front;
  return [
    ...L.flank.map(({ x, side }) => ({ x, y: side * (L.half - out), turn: side > 0 ? 0 : 180 })),
    { x: L.bow - out, y: 0, turn: -90 },
  ];
}

/** The deck's outline: the stern, the bow and both flanks, the corners cut. */
function outline(): Point[] {
  const L = bays();
  const x0 = L.stern - 2 * BAND - RIM;
  const [x1, y] = [L.bow, L.half];
  const c = CORNER;
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

/** The base, with its doors turned open by `doors` degrees (90, flat on the bed, as it prints). */
export function buildBase(doors = 90): Solid {
  const L = bays();
  const b = L.b;
  // The deck, its top edge cut at 45 degrees all round as the doors' knees are.
  let body: Solid = fuse(
    prism(outline(), DECK - KNEE.outside + 0.01),
    move(taper(outline(), KNEE.outside, 45), 0, 0, DECK - KNEE.outside)
  );
  // Round each bay the deck stands solid against its wall and cheeks and
  // keeps clear of its door: the box inside, the roof's slot (the roof
  // flush with the deck) and the hinge's room out to the edge.
  for (const at of bayPlaces()) {
    const room = (lo: [number, number, number], hi: [number, number, number]) =>
      (body = subtract(body, placed(block(lo, hi), at)));
    room([-b.inside.half, 0, -1], [b.inside.half, b.front + 5, DECK + 1]);
    room([-b.half - GAP, -b.wall - GAP, b.roof.under - GAP], [b.half + GAP, b.front + 5, DECK + 1]);
    room([-b.half - GAP, b.deckFront, -1], [b.half + GAP, b.front + 5, DECK + 1]);
  }
  for (const at of bayPlaces()) body = fuse(body, placed(bayBase(), at));
  // The magnets' slots run on down through the deck under each bay.
  for (const at of bayPlaces()) body = subtract(body, placed(bayPocket(), at));
  // And the holes down to them from the walls' tops.
  for (const at of bayPlaces()) body = subtract(body, placed(bayPush(), at));
  // The stand's socket.
  body = subtract(body, move(prism(socketOutline(), 1.01), 0, 0, DECK - 0.01));
  body = subtract(body, socketTaper(socketOutline(), DECK, SOCKET.depth));

  // The channels. Each slot's inboard of its bay; the bow's across ahead of the fore bays.
  const tools: Solid[] = [];
  for (const { x, side } of L.flank) tools.push(...channel(capacity("side"), [x, L.channels.flank(side)], "x"));
  tools.push(...channel(capacity("forward"), [L.channels.bow, 0], "y"));
  // Engines and scoop in the bow's corners, outboard of the bow bay, along
  // it, clear of the corners' cut; each icon inboard of its channel.
  const marks: { icon: IconName; at: Point }[] = [];
  const fixed: [SubsystemType, number][] = [
    ["engines", 1],
    ["scoop", -1],
  ];
  for (const [f, s] of fixed) {
    const n = SUBSYSTEM_CONFIGS[f].maxEnergy;
    const x = L.bow - CORNER - RIM - CUBE.pocket / 2;
    const y = b.half + 2 + RIM + channelLength(n) / 2;
    tools.push(...channel(n, [x, s * y], "y"));
    // Clear of the ticks on the channel's rim.
    marks.push({ icon: f, at: [x - CUBE.pocket / 2 - TICK.long - 1.5 - ICON / 2, s * y] });
  }
  // Astern, the heat track in two rows of five across the ship, the thrusters' cube beside the inner one.
  const rows = [L.stern - RIM - CUBE.pocket / 2 - 0.2, L.stern - RIM - CUBE.pocket - RIM - CUBE.pocket / 2 - 0.2];
  const fold = MAX_HEAT / 2;
  for (const x of rows) tools.push(...channel(fold, [x, 0], "y"));
  const end = channelLength(fold) / 2;
  marks.push({ icon: "heat", at: [rows[1], end + RIM + ICON / 2 + 1] });
  const thrusters = SUBSYSTEM_CONFIGS.rotation.maxEnergy;
  // Its own channel, well apart from the heat track's end, so the two do not read as one.
  const ty = -(end + APART + channelLength(thrusters) / 2);
  tools.push(...channel(thrusters, [rows[0], ty], "y"));
  marks.push({ icon: "rotation", at: [rows[1], ty] });
  // One cut at a time: a cut by solids that do not touch cuts nothing.
  for (const t of tools) body = subtract(body, t);
  for (const m of marks) engrave(m.icon, ICON, m.at, DECK);
  for (const at of bayPlaces()) placed(bayDoor(doors), at);
  return body;
}

/** The base's plugs: one for each bay's magnet. */
export function basePlugs(): number[] {
  return bayPlaces().map(() => bayPlug());
}

export function buildBasePlugs(): void {
  const pitch = MOUNT.magnet.diameter + MOUNT.magnetClearance + 3;
  basePlugs().forEach((length, i) => move(plugTool(MOUNT, length), 0, i * pitch, 0));
}
