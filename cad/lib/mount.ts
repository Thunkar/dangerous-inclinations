// The mount every module shares: the foot's outline, the module's tenon and
// screw, and the hull's recess and sealed magnet pocket.
import { sketch, circle, extrude, subtract, fuse } from "fluidcad/core";
import { MOUNT } from "../spec.ts";
import { prism, disc, grow, move, block, type Point, type Solid, type Vec } from "./solids.ts";

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
 * The screw's pilot for the thread, from the mating face (z = 0) up, `depth`
 * deep. Each tool is built only when asked for: FluidCAD keeps every solid
 * a part builds, so an unused one prints as a body of its own.
 */
export function pilotTool(m: Mount = MOUNT, depth = m.screw.shortest + 0.6): Solid {
  return disc(m.screw.pilot, depth);
}

/** The screw head's countersink cone at the mating face, leaving the head a hair under it. */
export function countersinkTool(m: Mount = MOUNT): Solid {
  const sink = (m.screw.headDiameter - m.screw.pilot) / 2;
  sketch("xy", () => {
    circle([0, 0], m.screw.headDiameter);
  });
  return extrude(sink).draft(-45).new();
}

/**
 * The module's tenon: the outline less the clearance, `recessDepth - 0.1`
 * thick from z = 0 up, with `body` of solid behind it, and the screw's
 * countersink cut from the mating face. Prints mating face down; the pilot is
 * drilled through whatever stands on it (`pilotTool`).
 */
export function tenon(m: Mount = MOUNT, body = 5): Solid {
  const t = prism(grow(footOutline(m), -m.clearance), m.recessDepth - 0.1 + body);
  return subtract(t, countersinkTool(m));
}

/**
 * The hull side of the mount, in the mount frame (the caller moves it onto
 * the hull): the recess, z from 0 down to -recessDepth, with 1 mm of
 * overshoot outward so it cuts cleanly through the face.
 */
export function recessTool(m: Mount = MOUNT): Solid {
  return move(prism(footOutline(m), m.recessDepth + m.recessReach), 0, 0, -m.recessDepth);
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
    [m.halfLength, Math.max(m.halfHeight, r, rise), m.recessReach],
  ];
}

/** Both of the hull's tools for a mount. */
export function socketTools(m: Mount = MOUNT, rise = 0): { recess: Solid; pocket: Solid } {
  return { recess: recessTool(m), pocket: pocketTool(m, rise) };
}
