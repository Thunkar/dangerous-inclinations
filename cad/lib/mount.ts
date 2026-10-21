// The mount every module shares: the foot's outline, the module's tenon and
// screw, and the hull's recess, magnet pocket and the plug that closes it.
import { sketch, circle, extrude, subtract, fuse } from "fluidcad/core";
import { MOUNT } from "../spec.ts";
import { footOutline as shared } from "../../ui/src/ships/mountShape.ts";
import { prism, disc, move, block, type Point, type Solid, type Vec } from "./solids.ts";

export type Mount = typeof MOUNT;

/** The foot's outline in the mount frame (x forward, y dorsal), anticlockwise: the game's. */
export const footOutline = (): Point[] => shared();

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
  const t = prism(shared(-m.clearance), m.recessDepth - 0.1 + body);
  return subtract(t, countersinkTool(m));
}

/**
 * The hull side of the mount, in the mount frame (the caller moves it onto
 * the hull): the recess, z from 0 down to -recessDepth, with 1 mm of
 * overshoot outward so it cuts cleanly through the face.
 */
export function recessTool(m: Mount = MOUNT): Solid {
  return move(prism(footOutline(), m.recessDepth + m.recessReach), 0, 0, -m.recessDepth);
}

/**
 * The magnet's pocket behind the recess floor, in the mount frame: a slot
 * of the magnet's section on edge, from `drop` along y (past the bed, where
 * the magnet goes in) up to a roof whose two sides run at 45 degrees and
 * touch the magnet's circle, so nothing in it faces the bed and the magnet
 * slid up it seats in the roof's V. `drop` is negative for a mount whose
 * frame has its dorsal side up in the print.
 */
export function pocketTool(m: Mount = MOUNT, drop: number): Solid {
  const r = (m.magnet.diameter + m.magnetClearance) / 2;
  const t = m.magnet.thickness + m.magnetClearance;
  const front = -m.recessDepth - m.skin;
  const up = -Math.sign(drop);
  const outline: Point[] = [
    [-r, drop],
    [r, drop],
    [r, up * r * (Math.SQRT2 - 1)],
    [0, up * r * Math.SQRT2],
    [-r, up * r * (Math.SQRT2 - 1)],
  ];
  return move(prism(up > 0 ? outline : [...outline].reverse(), t), 0, 0, front - t);
}

/** The roof's apex over the magnet's centre (mm): what the pocket reaches beyond it. */
export function pocketApex(m: Mount = MOUNT): number {
  return ((m.magnet.diameter + m.magnetClearance) / 2) * Math.SQRT2;
}

/**
 * Where a magnet slid up into its roof sits, above the pocket's centre: the
 * pocket's circle is the magnet's grown by the clearance, and the roof's V
 * touches the smaller circle higher.
 */
export function seatRise(m: Mount = MOUNT): number {
  return (m.magnetClearance / 2) * Math.SQRT2;
}

/**
 * A plug or spacer for a pocket's slot, `length` long: the slot's section
 * less the fit all round, as it prints, lying on its broad face with its
 * length along x (every face square to the bed).
 */
export function plugTool(m: Mount = MOUNT, length: number): Solid {
  const w = m.magnet.diameter + m.magnetClearance - 2 * m.plugFit.side;
  const t = m.magnet.thickness + m.magnetClearance - 2 * m.plugFit.side;
  return block([0, -w / 2, 0], [length, w / 2, t]);
}

/** The mount's box in its own frame, recess and pocket with its slot: [min, max]. */
export function socketBounds(m: Mount = MOUNT, drop = 0): [Vec, Vec] {
  const apex = pocketApex(m);
  const deep = m.recessDepth + m.skin + m.magnet.thickness + m.magnetClearance;
  const [lo, hi] = drop < 0 ? [drop, apex] : [-apex, drop];
  return [
    [-m.halfLength, Math.min(-m.halfHeight, lo), -deep],
    [m.halfLength, Math.max(m.halfHeight, hi), m.recessReach],
  ];
}

/** Both of the hull's tools for a mount. */
export function socketTools(m: Mount = MOUNT, drop: number): { recess: Solid; pocket: Solid } {
  return { recess: recessTool(m), pocket: pocketTool(m, drop) };
}
