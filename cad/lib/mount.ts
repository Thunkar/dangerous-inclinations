// The mount every module shares: the foot's outline, the module's tenon and
// screw, and the hull's recess and sealed magnet pocket.
import { sketch, circle, extrude, subtract, fuse } from "fluidcad/core";
import { MOUNT } from "../spec.ts";
import {
  prism,
  disc,
  grow,
  move,
  block,
  type Point,
  type Solid,
  type Vec,
} from "./solids.ts";

export type Mount = typeof MOUNT;

/**
 * The foot's outline in the mount frame (x forward, y dorsal), anticlockwise:
 * a big chamfer forward, a small one aft, mirror-symmetric in y.
 */
export function footOutline(m: Mount = MOUNT): Point[] {
  const a = m.halfLength;
  const b = m.halfHeight;
  const n = m.noseChamfer;
  const c = m.tailChamfer;
  return [
    [-a + c, -b],
    [a - n, -b],
    [a, -b + n],
    [a, b - n],
    [a - n, b],
    [-a + c, b],
    [-a, b - c],
    [-a, -b + c],
  ];
}

/**
 * The screw's seat from the mating face (z = 0) up: the pilot for the thread
 * and the countersink cone, which leaves the head a hair under the face.
 */
export function screwTools(m: Mount = MOUNT): { pilot: Solid; cone: Solid } {
  const pilot = disc(m.screw.pilot, m.screw.length + 0.6);
  const sink = (m.screw.headDiameter - m.screw.pilot) / 2;
  sketch("xy", () => {
    circle([0, 0], m.screw.headDiameter);
  });
  const cone = extrude(sink).draft(-45).new();
  return { pilot, cone };
}

/**
 * The module's tenon: the outline less the clearance, `recessDepth - 0.1`
 * thick from z = 0 up, with `body` of solid behind it for the thread and the
 * screw seat drilled from the mating face. Prints mating face down.
 */
export function tenon(m: Mount = MOUNT, body = 5): Solid {
  const t = prism(grow(footOutline(m), -m.clearance), m.recessDepth - 0.1 + body);
  const { pilot, cone } = screwTools(m);
  return subtract(subtract(t, pilot), cone);
}

/**
 * The hull side of the mount, in the mount frame (the caller moves it onto
 * the hull): the recess, z from 0 down to -recessDepth, with 1 mm of
 * overshoot outward so it cuts cleanly through the face.
 */
export function recessTool(m: Mount = MOUNT): Solid {
  return move(prism(footOutline(m), m.recessDepth + 1), 0, 0, -m.recessDepth);
}

/**
 * The magnet's pocket behind the recess floor, in the mount frame: a disc on
 * edge with a slot reaching `rise` from its centre along y to the print's
 * pause layer (negative for a mount whose frame has its dorsal side down).
 * The print pauses where the slot ends, the magnet drops in, and the layers
 * above seal it.
 */
export function pocketTool(m: Mount = MOUNT, rise = 0): Solid {
  const d = m.magnet.diameter + m.magnetClearance;
  const t = m.magnet.thickness + m.magnetClearance;
  const front = -m.recessDepth - m.skin;
  const round = move(disc(d, t), 0, 0, front - t);
  if (!rise) return round;
  return fuse(
    round,
    block([-d / 2, Math.min(0, rise), front - t], [d / 2, Math.max(0, rise), front])
  );
}

/** The mount's box in its own frame, recess and pocket with its slot: [min, max]. */
export function socketBounds(m: Mount = MOUNT, rise = 0): [Vec, Vec] {
  const r = (m.magnet.diameter + m.magnetClearance) / 2;
  const deep = m.recessDepth + m.skin + m.magnet.thickness + m.magnetClearance;
  return [
    [-m.halfLength, Math.min(-m.halfHeight, -r, rise), -deep],
    [m.halfLength, Math.max(m.halfHeight, r, rise), 1],
  ];
}

/** Both of the hull's tools for a mount. */
export function socketTools(m: Mount = MOUNT, rise = 0): { recess: Solid; pocket: Solid } {
  return { recess: recessTool(m), pocket: pocketTool(m, rise) };
}
