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

import { FOOT, PRINT_LENGTH, MM_PER_UNIT } from "../ui/src/ships/mountShape.ts";

/** Game units to millimetres: the corvette, bow to the bells' exit, prints at 80. */
export const PRINT = { corvetteLength: PRINT_LENGTH, mmPerUnit: MM_PER_UNIT };

/**
 * The mount. Each module stands on a foot whose mating face carries a
 * ferrous M2x4 countersunk screw, flush; the hull has a shallow recess of the
 * foot's outline with a magnet sealed behind its floor. The foot and the
 * recess are the game's (`ui/src/ships/mountShape.ts`): the game draws them
 * and the print takes them from it. The hull prints in one piece: each
 * magnet pocket is a slot rising to a pause layer, the magnet drops in on
 * edge at the pause, and the layers above seal it.
 *
 * Mount frame: x forward, y dorsal, the mating face at z = 0, outboard +z.
 */
export const MOUNT = {
  ...FOOT,
  /**
   * How far out of the mount face the recess is cut, so whatever stands over
   * the face in the foot's outline (a web under a bay shoulder) is notched
   * for the tenon on its way in.
   */
  recessReach: 3,
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

/**
 * The board: each gravity well as a kit of separate rings with walled,
 * numbered sectors, a hub and radial arms that lock the rings in place, and
 * the lane markers standing in grooves in a band outside the outer ring
 * (`pieces/well.ts`; migrated from the Onshape featurescript orbitRings.fs,
 * whose defaults these are but where the designer's print differs). Sectors
 * are numbered from 0 and run clockwise, sector 0's start edge at 90 degrees.
 */
export const BOARD = {
  /** Ring 1's centre line, ring to ring, and the gap between two rings. */
  firstRadius: 70,
  pitch: 22,
  gap: 2,
  thickness: 4,
  sectors: 24,
  startAngle: 90,
  /** The walls on every sector edge and along both rims: trapezoids, foot to crest. */
  wall: { height: 1.2, foot: 1.2, crest: 0.4 },
  /** Inlaid numbers: their depth, the "0"'s height, and the pocket's clearance round them. */
  number: { depth: 0.6, height: 7.5, clearance: 0.1, font: "fonts/OpenSans-Bold.ttf" },
  /** The arms under the rings: how many, how wide, how tall, how far under the hub. */
  arm: { count: 6, width: 6, height: 2, underHub: 15 },
  /** The hub's peg the planet or black hole sits on. */
  peg: { diameter: 8, height: 6 },
  clearance: 0.1,
  /** The bed a ring must fit on, or it is cut into segments on arm lines. */
  bed: 235,
  /** The lane markers' band outside the outer ring, its groove, and how proud the markers stand. */
  lane: { band: 6, groove: 1.5, raise: 1.5 },
};

/** The wells: the black hole's five rings and a planet's four, and how big each hub is (0: as big as ring 1 allows). */
export const WELLS = {
  blackHole: { rings: 5, hubRadius: 0 },
  planet: { rings: 4, hubRadius: 30 },
} as const;

/**
 * The bodies that sit on a well's hub, over its peg (`pieces/body.ts`;
 * migrated from the featurescript orbitBody.fs): a planet, a dome cut into wavy bands
 * that key onto each other, and the black hole, a horizon standing on the peg
 * through an accretion disc with swirl streaks cut through it, each with its
 * inlay. The designer's print, where it differs from the featurescript's
 * defaults: the horizon's radius, the disc and its streaks, the bands' tilt
 * and their waves' amplitude.
 */
export const ORBIT_BODY = {
  /** The planet's bore round the peg kept the featurescript's 0.2 clearance, not the board's 0.1. */
  planet: { radius: 25, bands: 4, waves: 5, amplitude: 1, tilt: 5, seed: 1, clearance: 0.2 },
  blackHole: {
    radius: 30,
    /** The horizon's centre above the hub. */
    centre: 10,
    disc: { outer: 57.5, thickness: 1.6 },
    /** Rows of streaks, how many a row, the inner row's width, length round the disc (degrees) and infall, and the stagger. */
    streaks: { rows: 2, perRow: 3, width: 3, length: 110, infall: 2, stagger: 40 },
  },
};
