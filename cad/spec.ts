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

/** Game units to millimetres: the corvette prints 80 long. */
export const PRINT = { corvetteLength: PRINT_LENGTH, mmPerUnit: MM_PER_UNIT };

/**
 * The mount. Each module stands on a foot whose mating face carries a
 * ferrous M2x4 countersunk screw, flush; the hull has a shallow recess of the
 * foot's outline with a magnet sealed behind its floor. The foot and the
 * recess are the game's (`ui/src/ships/mountShape.ts`): the game draws them
 * and the print takes them from it. The hull prints in one piece with no
 * pause: each magnet's pocket is a slot from the bed up to a 45-degree roof
 * the magnet seats in, the magnet slides up it on edge from under the hull,
 * and a plug printed apart closes the slot behind it, flush with the bed
 * (where two magnets stand in one column, one slot takes both and a spacer
 * goes between them).
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
   * How far the bow mount's recess is raised at its top in the print: its
   * roof is a bridge, and a bridge sags, so a module there went in tight.
   */
  bowSag: 0.2,
  /**
   * Plastic between the recess floor and the magnet. The face is vertical in
   * the print, so the skin is perimeters: 0.6 is a single wall, 0.7 is two
   * (the designer's print), and two walls are the seal.
   */
  skin: 0.7,
  /** Added to the magnet's diameter and thickness for its pocket (printed: 0.2 fits). */
  magnetClearance: 0.2,
  /**
   * Taken off the slot's section for a plug or spacer, all round, so it
   * slides in to be glued; and taken off its length, so a stack of magnets
   * and plugs is never forced against the roof. Plugs of a hull within
   * `share` of each other are all cut to the shortest, so a hull prints
   * fewer lengths (its magnet sits that much under its roof).
   */
  plugFit: { side: 0.1, length: 0.1, share: 0.3 },
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

/**
 * The marks on the markers and item tokens (`pieces/markers/`): how deep
 * every mark is debossed, the top face's and the bed face's alike (the crate
 * and data tokens carry Piracy's skull in the bed face, over bridges).
 * `coupons/marker-depth` prints 0.4, 0.6, 0.8 and 1.0 (one to four
 * notches); the designer's print read best at 0.6.
 */
export const MARKER = { depth: 0.6 };

/**
 * The hull and fuel dice (`pieces/dice/`): a pentagonal trapezohedron per
 * counter, never rolled, a steel ball sealed in its centre, standing on a
 * stand with a magnet sealed under the pocket the die's bottom face drops
 * into. The die prints as two halves split at its equator, each on its cut
 * face, pinned with filament and glued round the ball.
 */
export const DICE = {
  /** The steel ball, and what its cavity adds to its diameter. */
  ball: { diameter: 10, clearance: 0.2 },
  /**
   * Pole height over the ring's radius (h / r). 1.25 left a long empty tail
   * over the number; under 0.95 the other pole's kite tips overhang past 45
   * at the bed. The designer chose 1.0 from a sheet of 0.65, 0.8 and 1.0.
   */
  proportion: 1.0,
  /**
   * Centre to face, the smallest at this proportion that keeps every rule:
   * the numbers set it (the board's inlays, a "0" 7.5 tall, "10" with its
   * margin to its kite and clear of the seam), and d10.ts checks every wall
   * and places the pins.
   */
  inradius: 9.9,
  /** The least plastic between the cavity and a numeral's floor, and round a pin hole. */
  wall: { numbers: 1.6, pins: 1.2 },
  /** 1.75 filament pins, a hole each side of the cut. */
  pin: { hole: 1.9, depth: 2.5 },
  /**
   * Numbers (BOARD.number's inlays): their pockets' least margin to their
   * kite's edges, and the groove engraved under 6 and 9 (MARKER.depth deep),
   * its height and the plastic between it and the pocket above.
   */
  numeral: { margin: 1, bar: 0.8, gap: 0.8 },
  stand: {
    /** How deep the die's face sits, and what the pocket adds to the face across (0.1 a side, as a tenon). */
    pocketDepth: 1.2,
    clearance: 0.2,
    /** Plastic between the pocket floor and the magnet: thin, since the pull falls fast with distance. */
    seal: 0.6,
    /** 6x2 magnets stacked under the pocket (MOUNT.magnet), and the plug under them. */
    magnets: 1,
    plug: 1.6,
    /**
     * Taken off the plug's diameter, all round. A round slot printed upright
     * comes out true, so MOUNT.plugFit's 0.1 (set on the hulls' slots) left the
     * designer's plug loose; of `coupons/stand-plug`'s 0.1, 0.05, 0 and -0.05,
     * the -0.05 (four notches, the plug 0.1 over the slot) is the one that holds.
     */
    plugFit: -0.05,
    chamfer: 0.8,
    /** Plastic round the pocket's rim and round the icon, to the stand's edge, at the top. */
    rim: 2,
    /** The icon on the stand's top, beyond the pocket's long tail, and its gap to the pocket. */
    icon: 9,
    iconGap: 1.5,
  },
};
