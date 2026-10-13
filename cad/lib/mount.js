// The mount every module shares: the foot's outline, the module's tenon and
// screw, and the hull's recess and sealed magnet pocket.
import { sketch, circle, extrude, subtract, fuse } from "fluidcad/core";
import { MOUNT } from "../spec.ts";
import { prism, disc, grow, move, block } from "./solids.js";

/**
 * The foot's outline in the mount frame (x forward, y dorsal), anticlockwise:
 * a big chamfer forward, a small one aft, mirror-symmetric in y.
 */
export function footOutline(m = MOUNT) {
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
export function screwTools(m = MOUNT) {
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
export function tenon(m = MOUNT, body = 5) {
  const t = prism(grow(footOutline(m), -m.clearance), m.recessDepth - 0.1 + body);
  const { pilot, cone } = screwTools(m);
  return subtract(subtract(t, pilot), cone);
}

/**
 * The hull side of the mount, as the tools to subtract from the hull, in the
 * mount frame (the caller moves them onto the hull): the recess (z from 0
 * down to -recessDepth, with 1 mm of overshoot outward so it cuts cleanly
 * through the face) and the magnet pocket behind it, a disc on edge with a
 * slot rising `rise` above its centre along +y (the print's up). The print
 * pauses where the slot ends, the magnet drops in, and the layers above seal
 * it.
 */
export function socketTools(m = MOUNT, rise = 0) {
  const recess = move(prism(footOutline(m), m.recessDepth + 1), 0, 0, -m.recessDepth);
  const d = m.magnet.diameter + m.magnetClearance;
  const t = m.magnet.thickness + m.magnetClearance;
  const front = -m.recessDepth - m.skin;
  const disc_ = move(disc(d, t), 0, 0, front - t);
  const pocket =
    rise > 0 ? fuse(disc_, block([-d / 2, 0, front - t], [d / 2, rise, front])) : disc_;
  return { recess, pocket };
}
