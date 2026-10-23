// A loadout slot's bay on the base: the module lies on its side on a wall
// mount, as it hangs on the ship's flank (the hull's recess, with a magnet
// on edge behind it, slid up its slot from under the base and closed by a
// plug, and no pause), boxed in by the wall, two fixed cheeks and a door.
// The door is the box's front and roof in one piece, hinged along the front
// edge at the bottom, under the module, and folds forward and down to open;
// on the base the bays stand at the edge, so an open door lies on the table. It prints in place,
// open: its front lies flat on the bed and its roof stands up at the far end,
// so nothing of it hangs. The hinge is a row of knuckles, the base's and the
// door's in turn, joined by cones in conical sockets: every face that looks
// down does so at 45 degrees, and a cone holds its neighbour both along the
// axis and across it.
//
// Frame: x along the wall, y out of the wall's face (the module's side),
// z up, the bed at z = 0. The door is drawn closed; it prints turned open.
import { subtract, fuse } from "fluidcad/core";
import type { SubsystemType } from "@dangerous-inclinations/engine";
import { MOUNT } from "../spec.ts";
import { block, disc, move, prism, section, taper, turn, type Point, type Solid } from "../lib/solids.ts";
import { countersinkTool, plugTool, pocketTool, recessTool, seatRise } from "../lib/mount.ts";
import { buildModule, envelopeOf, MODULE_TYPES } from "./module.ts";

/** The deck the bay stands on. */
const DECK = 2;
/** Room round a module in its box. */
const ROOM = 0.6;
/** The box's cheeks. */
const SKIN = 1.2;
/**
 * The door's front, and the countersunk M2 screw in its roof whose steel the
 * wall's magnet pulls on to hold the door shut: its length, and how far
 * over the magnet its tip stops. The roof is as thick as the screw is long
 * less what reaches below it, down the hole over the magnet (bayOf).
 */
const DOOR = { front: 2, screw: 6, over: 0 };
/**
 * The cone under the roof round the screw where it reaches below the roof,
 * so none of it shows bare: its radius at the roof and at the screw's tip,
 * which is flush with its blunt end and still meets the magnet. Each section
 * is a teardrop pointed the way that is down when the door prints open
 * (forward, closed), so the cone's underside stands at 45 degrees there.
 */
const CONE_UNDER = { root: 1.9, end: 1.45 };
/** The room round the cone in the hole over the magnet, which a pin also pushes the magnet out through. */
const PUSH = { room: 0.3 };
/** The room round the cone as it swings out of the hole, and under its end. */
const SCREW_ROOM = 0.4;
/** Behind the recess floor: the skin, the magnet's slot and plastic behind it. */
const BACK = 1.6;
/** Between the door and the base wherever they part: printed in place, so a gap. */
const GAP = 0.35;
/**
 * The hinge: the knuckles' radius (their axis that high off the bed), how
 * many (the door's every other, the base's at both ends), how long the
 * door's are (long enough for a socket from each end), and the gap between
 * two knuckles and round a cone in its socket: tighter than the door's
 * elsewhere, so the door does not flop.
 */
const HINGE = { r: 3, knuckles: 5, door: 5.2, gap: 0.25 };
/**
 * The door's knee, where its front meets its roof: the fill inside (no more
 * than the room above and ahead of a module, less a gap) and the cut outside.
 */
export const KNEE = { inside: 0.8, outside: 1 };
/** A joint's cone: its radius at the base knuckle's face, at 45 degrees to a blunt tip. */
const CONE = { r: 2, tip: 0.15 };

/** Every module's envelope at once: the biggest the bay must take. */
function envelope() {
  const all = MODULE_TYPES.map(envelopeOf);
  return {
    long: Math.max(...all.map((e) => e.long)),
    wide: Math.max(...all.map((e) => e.wide)),
    tall: Math.max(...all.map((e) => e.tall)),
  };
}

/** The bay's sizes: the mount's centre, the wall, the box inside, the door and the hinge's axis. */
export function bayOf() {
  const e = envelope();
  const wall = MOUNT.recessDepth + MOUNT.skin + MOUNT.magnet.thickness + MOUNT.magnetClearance + BACK;
  // The hinge runs under the module's front: the door's front stands just
  // ahead of the module, its outer face on the knuckles' front, and the
  // module stands clear above everything of the hinge that turns (a door
  // knuckle's skirt reaches root 2 minus 1 past its round).
  const out = e.tall + ROOM;
  const axis = { y: out + GAP + DOOR.front - HINGE.r, z: HINGE.r };
  const swing = HINGE.r * Math.hypot(1, Math.SQRT2 - 1);
  const under = axis.z + swing + GAP;
  const centre = under + e.wide / 2;
  const inside = { half: e.long / 2 + ROOM, out, top: centre + e.wide / 2 + ROOM };
  const tip = centre + seatRise() + MOUNT.magnet.diameter / 2 + DOOR.over;
  const reach = inside.top + GAP - tip;
  const roof = { under: inside.top + GAP, top: inside.top + GAP + DOOR.screw - reach, reach };
  // The hole down the wall's top to the magnet and the door's screw over it:
  // over the middle of the magnet's slot, and down to the magnet's top, so
  // the screw's tip meets the magnet. Where the screw's path then runs
  // through the skin into the recess, the opening is narrower than the
  // magnet every way, so the magnet stays shut in.
  const slot = -MOUNT.recessDepth - MOUNT.skin - (MOUNT.magnet.thickness + MOUNT.magnetClearance) / 2;
  const push = { y: slot, z: tip - 0.5 };

  return {
    centre,
    wall,
    inside,
    half: inside.half + SKIN,
    front: axis.y + HINGE.r,
    roof,
    axis,
    swing,
    push,
    /** Under the module: a platform up to a room below it, short of the hinge. */
    platform: { top: under - ROOM, front: axis.y - swing - GAP },
    /** The deck: from behind the wall to a gap short of the base's knuckles' webs. */
    deckFront: axis.y - HINGE.r - GAP,
  };
}

/** An arc in (y, z) about c, from angle a0 to a1 (degrees, anticlockwise from +y), ends included. */
function arc(r: number, [y0, z0]: Point, a0: number, a1: number, n = 12): Point[] {
  return Array.from({ length: n + 1 }, (_, i): Point => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [y0 + r * Math.cos(a), z0 + r * Math.sin(a)];
  });
}

function anticlockwise(pts: Point[]): Point[] {
  const a = pts.reduce((s, [x, y], i) => {
    const [u, v] = pts[(i + 1) % pts.length];
    return s + x * v - u * y;
  }, 0);
  return a < 0 ? [...pts].reverse() : pts;
}

/** A section in (y, z) pulled along x from x0 to x1. */
const across = (pts: Point[], x0: number, x1: number): Solid =>
  move(section(anticlockwise(pts), x1 - x0), x0, 0, 0);

/**
 * A knuckle's section about the axis c as it prints: round, and below the
 * round a skirt at 45 degrees down to the bed, so nothing under it hangs.
 * (The door's turns with it: closed, its skirt points forward, away from
 * everything; it swings down to the bed as the door opens.)
 */
function knuckle([y, z]: Point): Point[] {
  const r = HINGE.r;
  const t = r / Math.SQRT2;
  const foot = 2 * t - r;
  return [...arc(r, [y, z], -45, 225, 18), [y - foot, z - r], [y + foot, z - r]];
}

/** The knuckles along x: [x0, x1] of each, the door's every other, the base's at both ends. */
function knuckles(half: number): { x0: number; x1: number; door: boolean }[] {
  const n = HINGE.knuckles;
  const doors = Math.floor(n / 2);
  const base = (2 * half - (n - 1) * HINGE.gap - doors * HINGE.door) / (n - doors);
  let x = -half;
  return Array.from({ length: n }, (_, i) => {
    const door = i % 2 === 1;
    const k = { x0: x, x1: x + (door ? HINGE.door : base), door };
    x = k.x1 + HINGE.gap;
    return k;
  });
}

/** A 45-degree cone on the axis, its base of radius r on the plane x = x0, pointing `dir` along x. */
function cone([y, z]: Point, x0: number, r: number, length: number, dir: 1 | -1): Solid {
  const n = 24;
  const ring: Point[] = Array.from({ length: n }, (_, i): Point => {
    const a = (2 * Math.PI * i) / n;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  // Drawn on z = 0 rising along +z, then laid along x.
  const c = taper(ring, length, 45);
  return move(turn(c, "y", dir * 90), x0, y, z);
}

/** The mount's tools in the bay's frame: its x along -x, dorsal up, outboard +y. */
function mounted(tool: Solid, centre: number): Solid {
  return move(turn(turn(tool, "x", 90), "z", 180), 0, 0, centre);
}

/**
 * The bay's fixed part: its deck, the wall with its mount and magnet's slot,
 * the platform under the module, the cheeks and the base's knuckles with
 * their cones.
 */
export function bayBase(): Solid {
  const b = bayOf();
  const { y, z } = b.axis;
  const all = knuckles(b.half);
  const deckFront = b.deckFront;
  let body: Solid = block([-b.half - 2, -b.wall - 2, 0], [b.half + 2, deckFront, DECK]);
  body = fuse(body, block([-b.half, -b.wall, DECK - 0.01], [b.half, 0, b.inside.top]));
  body = fuse(body, block([-b.half, -0.01, DECK - 0.01], [b.half, b.platform.front, b.platform.top]));
  // The cheeks, from the bed, up under the roof and forward to the door's
  // front, their top front edge cut at 45 degrees under the door's knee.
  const cheekFront = b.front - DOOR.front - GAP;
  for (const s of [-1, 1]) {
    const [x0, x1] = s > 0 ? [b.inside.half, b.half] : [-b.half, -b.inside.half];
    let cheek: Solid = block([x0, -0.01, 0], [x1, cheekFront, b.inside.top]);
    cheek = subtract(
      cheek,
      across(
        [
          [cheekFront + 0.01, b.inside.top + 0.01],
          [cheekFront - KNEE.inside, b.inside.top + 0.01],
          [cheekFront + 0.01, b.inside.top - KNEE.inside],
        ],
        x0 - 0.01,
        x1 + 0.01
      )
    );
    body = fuse(body, cheek);
  }
  for (const [i, k] of all.entries()) {
    if (k.door) continue;
    // Each knuckle with a web back to the deck along the bed and its cones,
    // into the door's knuckles beside it across the gap, made whole before it
    // joins the base (a fuse of solids that do not touch yields nothing).
    let part: Solid = fuse(across(knuckle([y, z]), k.x0, k.x1), block([k.x0, deckFront - 0.01, 0], [k.x1, y, z]));
    const length = CONE.r - CONE.tip;
    if (all[i + 1]?.door) part = fuse(part, cone([y, z], k.x1 - 0.01, CONE.r, length, 1));
    if (all[i - 1]?.door) part = fuse(part, cone([y, z], k.x0 + 0.01, CONE.r, length, -1));
    body = fuse(body, part);
  }
  // The mount, and its magnet's slot from under the deck.
  body = subtract(body, mounted(recessTool(MOUNT), b.centre));
  body = subtract(body, bayPocket());
  return subtract(body, bayPush());
}

/**
 * The hole down from the wall's top into the magnet's pocket: a pin pushes
 * the magnet out through it, and the door's screw sits in its mouth. What a
 * deck the bay stands on must be cut by too.
 */
export function bayPush(): Solid {
  const b = bayOf();
  const top = b.inside.top;
  const { root, end } = CONE_UNDER;
  const hole = move(disc(2 * (root + PUSH.room), top - b.push.z + 1), 0, b.push.y, b.push.z);
  // The cone's path as the door opens: a slot as wide as the cone and its
  // room, its front a slope leaning as the cone's end's point swings, set
  // out far enough that every point of the cone's front edge stays behind
  // it all the way until it is clear of the wall, then moved out by the room.
  const tip = b.roof.under - b.roof.reach;
  const turned = ([py, pz]: Point, deg: number): Point => {
    const a = (-deg * Math.PI) / 180;
    const [dy, dz] = [py - b.axis.y, pz - b.axis.z];
    return [b.axis.y + dy * Math.cos(a) - dz * Math.sin(a), b.axis.z + dy * Math.sin(a) + dz * Math.cos(a)];
  };
  const edge = Array.from({ length: 9 }, (_, i): Point => {
    const t = i / 8;
    return [b.push.y + (end + (root - end) * t) * Math.SQRT2, tip + t * b.roof.reach];
  });
  let out = edge[0];
  for (let deg = 0; out[1] < top + 0.5 && deg < 90; deg += 0.5) out = turned(edge[0], deg);
  const lean = (out[0] - edge[0][0]) / (out[1] - edge[0][1]);
  let reach = -Infinity;
  for (let deg = 0; deg <= 90; deg += 0.5)
    for (const p of edge) {
      const [py, pz] = turned(p, deg);
      if (pz < top + 1) reach = Math.max(reach, py - (pz - tip) * lean);
    }
  const slope = (z: number) => reach + SCREW_ROOM * Math.hypot(1, lean) + (z - tip) * lean;
  const [floor, back] = [tip - SCREW_ROOM, b.push.y - root - SCREW_ROOM];
  const path = across(
    [
      [back, floor],
      [slope(floor), floor],
      [slope(top + 1), top + 1],
      [back, top + 1],
    ],
    -root - SCREW_ROOM,
    root + SCREW_ROOM
  );
  return fuse(hole, path);
}

/** The magnet's pocket and its slot down past the bed: what a deck the bay stands on must be cut by too. */
export function bayPocket(): Solid {
  const b = bayOf();
  return mounted(pocketTool(MOUNT, -(b.centre + 1)), b.centre);
}

/**
 * The door, closed: front and roof, the door's knuckles, and a conical
 * socket in each of their faces round the base's cone. Over a door knuckle
 * the front runs down into it and a web under the module fills between
 * them, so the door holds its knuckles over their whole height.
 */
function doorClosed(): Solid {
  const b = bayOf();
  const { y, z } = b.axis;
  // Over the base's knuckles the front stops clear of them.
  const low = z + HINGE.r + GAP;
  let door: Solid = block([-b.half, b.front - DOOR.front, low], [b.half, b.front, b.roof.top]);
  door = fuse(door, block([-b.half, -b.wall, b.roof.under], [b.half, b.front, b.roof.top]));
  // Over the base's knuckles the front comes down as far as it can and still
  // turn clear of them (round the axis, a gap outside their round), so it
  // holds the door's knuckles across the whole width, no longer than it was.
  const clear = HINGE.r + GAP;
  const [d0, d1] = [HINGE.r - DOOR.front, HINGE.r];
  const a0 = (Math.acos(d1 / clear) * 180) / Math.PI;
  const a1 = (Math.acos(d0 / clear) * 180) / Math.PI;
  door = fuse(
    door,
    across(
      [...arc(clear, [y, z], a0, a1, 8), [y + d0, low + 0.01], [y + d1, low + 0.01]],
      -b.half,
      b.half
    )
  );
  // The front's corner with the roof: filled inside at 45 degrees (as far as
  // a module's room allows; the cheeks' edges are cut to match) and cut at
  // 45 outside, so the knee is thicker than either leaf and has no sharp
  // corner to crack at.
  const inner = { y: b.front - DOOR.front, z: b.roof.under };
  door = fuse(
    door,
    across(
      [
        [inner.y + 0.01, inner.z + 0.01],
        [inner.y - KNEE.inside, inner.z + 0.01],
        [inner.y + 0.01, inner.z - KNEE.inside],
      ],
      -b.half,
      b.half
    )
  );
  door = subtract(
    door,
    across(
      [
        [b.front + 0.01, b.roof.top + 0.01],
        [b.front - KNEE.outside, b.roof.top + 0.01],
        [b.front + 0.01, b.roof.top - KNEE.outside],
      ],
      -b.half - 1,
      b.half + 1
    )
  );
  // Closed, a door knuckle's skirt points forward: its print shape turned a quarter back.
  const closed = knuckle([0, 0]).map(([dy, dz]): Point => [y - dz, z + dy]);
  // The web: from behind the axis to the front, up to a gap under the module.
  const web: Point[] = [
    [y - 1, z],
    [b.front, z],
    [b.front, b.platform.top + ROOM - GAP],
    [y - 1, b.platform.top + ROOM - GAP],
  ];
  // Each socket is the base's cone grown by the gap all round, which on a
  // 45-degree cone is the same cone moved along its axis by the gap times root 2.
  const shift = HINGE.gap * Math.SQRT2;
  for (const k of knuckles(b.half)) {
    if (!k.door) continue;
    let part: Solid = fuse(across(closed, k.x0, k.x1), across(web, k.x0, k.x1));
    part = fuse(part, block([k.x0, b.front - DOOR.front, z], [k.x1, b.front, low + 0.01]));
    const length = CONE.r - CONE.tip + shift;
    part = subtract(part, cone([y, z], k.x0 - HINGE.gap - 0.01, CONE.r + shift, length, 1));
    part = subtract(part, cone([y, z], k.x1 + HINGE.gap + 0.01, CONE.r + shift, length, -1));
    door = fuse(door, part);
  }
  // The screw over the magnet: its countersink flush with the roof's top and
  // its pilot down through the roof and the cone under it, a teardrop
  // pointed the way that is up when the door prints open (back, closed), so
  // its roof is no bridge.
  const head = move(turn(countersinkTool(MOUNT), "x", 180), 0, b.push.y, b.roof.top + 0.01);
  door = subtract(door, head);
  // The cone round the screw below the roof, from the roof down to its tip,
  // narrowing as it goes: drawn mirrored and turned over, so it narrows
  // downward with its point forward.
  const { root, end } = CONE_UNDER;
  const draft = (Math.atan((root - end) / b.roof.reach) * 180) / Math.PI;
  const tear = (r: number): Point[] => [
    ...Array.from({ length: 19 }, (_, i): Point => {
      const a = ((135 + (270 * i) / 18) * Math.PI) / 180;
      return [r * Math.cos(a), -r * Math.sin(a)];
    }),
    [0, -r * Math.SQRT2],
  ];
  const sleeve = turn(taper(anticlockwise(tear(root)), b.roof.reach + 0.01, draft), "x", 180);
  door = fuse(door, move(sleeve, 0, b.push.y, b.roof.under + 0.01));
  const pr = MOUNT.screw.pilot / 2;
  const pilot: Point[] = [
    ...Array.from({ length: 19 }, (_, i): Point => {
      const a = ((-45 + (270 * i) / 18) * Math.PI) / 180;
      return [pr * Math.cos(a), pr * Math.sin(a)];
    }),
    [0, -pr * Math.SQRT2],
  ];
  return subtract(
    door,
    move(prism(anticlockwise(pilot), b.roof.top - b.roof.under + b.roof.reach + 2), 0, b.push.y, b.roof.under - b.roof.reach - 1)
  );
}

/** The door turned open about the hinge by `degrees` (90 lays it flat, as it prints). */
export function bayDoor(degrees: number): Solid {
  const { axis } = bayOf();
  const door = doorClosed();
  if (!degrees) return door;
  return move(turn(move(door, 0, -axis.y, -axis.z), "x", -degrees), 0, axis.y, axis.z);
}

/** The bay as it prints: the base and its door, open, in one print. */
export function buildBay(): void {
  bayBase();
  bayDoor(90);
}

/** The bay's plug: from the deck's underside to the magnet seated in its roof. */
export function bayPlug(): number {
  const b = bayOf();
  // Full length, not a hair short: it holds the magnet up in its seat, where the door's screw meets it.
  return +(b.centre + seatRise() - MOUNT.magnet.diameter / 2).toFixed(2);
}

export function buildBayPlug(): Solid {
  return plugTool(MOUNT, bayPlug());
}

/** The bay with its door turned open by `open` degrees (0 closed) and a module in it: viewer only. */
export function showBay(open = 0, module?: SubsystemType): void {
  const b = bayOf();
  bayBase();
  bayDoor(open);
  // The module as it prints (mating face down at z = 0, its tenon in the
  // recess), turned onto the wall with the tenon's face on the recess floor.
  if (module) move(mounted(buildModule(module), b.centre), 0, -MOUNT.recessDepth, 0);
}
