/**
 * The printed pieces' numbers, in millimetres. One place for every size the
 * pieces must agree on: the mount every module shares, the magnets, the
 * cubes and the scale the game's models are printed at. Pure data, no
 * FluidCAD and no three.js, so the game's renderer can read it too.
 *
 * The tolerances are first guesses for a 0.4 mm nozzle on a Prusa MK4S; the
 * test pieces in `coupons/` print each one in steps, and the value that
 * works is the one written here.
 */

import { CORVETTE } from "../ui/src/ships/corvetteShape.ts";

/** Game units to millimetres: the corvette, bow to the bells' exit, prints at 80. */
export const PRINT = {
  corvetteLength: 80,
  get mmPerUnit() {
    return this.corvetteLength / CORVETTE.length;
  },
};

/**
 * The mount. Each module stands on a foot whose mating face carries a
 * ferrous M2x4 countersunk screw, flush; the hull has a shallow recess of the
 * foot's outline with a magnet sealed behind its floor. The hull prints in
 * one piece: each magnet pocket is a slot rising to a pause layer, the magnet
 * drops in on edge at the pause, and the layers above seal it. The outline points
 * forward (a big chamfer at the bow end, a small one aft) and is symmetric
 * dorsal to ventral, so one print of a module fits all four flank mounts
 * and its guns still face the bow.
 *
 * Mount frame: x forward, y dorsal, the mating face at z = 0, outboard +z.
 */
export const MOUNT = {
  /**
   * Half the foot's length (x) and height (y): 16 x 9, low enough to sink
   * into the corvette's flank between its chamfers (10.3 mm at 80 mm).
   */
  halfLength: 8,
  halfHeight: 4.5,
  /** The chamfers: forward (the pointer) and aft. */
  noseChamfer: 2.5,
  tailChamfer: 1.5,
  /** How deep the hull's recess is; the foot's tenon fills it less the gap. */
  recessDepth: 1,
  /**
   * How far out of the mount face the recess is cut, so whatever stands over
   * the face in the foot's outline (a web under a bay shoulder) is notched
   * for the tenon on its way in.
   */
  recessReach: 3,
  /** Gap all round between the tenon and the recess (printed: 0.1 seats). */
  clearance: 0.1,
  /**
   * Plastic between the recess floor and the magnet. The face is vertical in
   * the print, so the skin is perimeters: 0.6 is a single wall, 0.7 is two
   * (the designer's print), and two walls are the seal.
   */
  skin: 0.7,
  /** Added to the magnet's diameter and thickness for its pocket (printed: 0.2 fits). */
  magnetClearance: 0.2,
  /** A 6x2 neodymium disc, always sealed inside the plastic. */
  magnet: { diameter: 6, thickness: 2 },
  screw: {
    /** Pilot for an M2 self-tapping into PLA/PETG. */
    pilot: 1.7,
    /** ISO 7046 / DIN 965 head, 90 degrees, sunk a hair below the face. */
    headDiameter: 4.0,
    /**
     * The screws a module takes: every module's pilot fits the shortest, and
     * runs as deep as its plastic allows up to the longest.
     */
    shortest: 4,
    longest: 6,
  },
};

/** The energy and heat cubes. */
export const CUBE = {
  size: 8.1,
  /** Square pocket side: the cube plus 0.4 (the designer's print). */
  pocket: 8.5,
  pocketDepth: 3,
  /** Plastic between two pockets in a row; the cubes stand 5 mm proud, so fingers still get round them. */
  wall: 1.2,
};

/**
 * The hull and fuel sliders: a dovetail with a sprung tongue that clicks a
 * ridge into a groove at every step (coupons/slider.part.js).
 */
export const SLIDER = {
  steps: 11,
  /** Step to step, and the numbers' height: 6 and 4.8 since the base (7 and 5.5 before). */
  pitch: 6,
  numberSize: 4.8,
  /** The dovetail's gap on each flank as drawn; 0 slides (the designer's print). */
  clearance: 0,
  /** How far the ridge sits in the track once the tongue has lifted the slider onto the dovetail. */
  engage: 0.55,
};

/**
 * The display ship stands on a square peg (square, so it keeps its heading)
 * in a blind socket from its keel. The socket takes the tenon's clearance.
 */
export const STAND = { peg: 6, depth: 8, clearance: 0.1 };

/** A 0.4 mm nozzle's limits, for the checks every part should meet. */
export const FDM = {
  minWall: 1.2,
  minFeature: 0.6,
  /**
   * How much every part of a game's ship grows when printed, so the overlays
   * the game keeps a hair (0.1 to 0.2 mm here) off their walls touch them.
   */
  join: 0.15,
  maxOverhangDegrees: 45,
  layer: 0.2,
};
