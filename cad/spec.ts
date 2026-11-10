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

import { FOOT, PRINT_LENGTH, MM_PER_UNIT } from '../ui/src/ships/mountShape.ts'

/** Game units to millimetres: the corvette prints 80 long. */
export const PRINT = { corvetteLength: PRINT_LENGTH, mmPerUnit: MM_PER_UNIT }

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
}

/** The energy and heat cubes. */
export const CUBE = {
  size: 8.1,
  /** Square pocket side: the cube plus 0.4 (the designer's print). */
  pocket: 8.5,
  pocketDepth: 3,
  /** Plastic between two pockets in a row; the cubes stand 5 mm proud, so fingers still get round them. */
  wall: 1.2,
}

/**
 * The display ship stands on a square peg (square, so it keeps its heading)
 * in a blind socket from its keel. The socket takes the tenon's clearance.
 */
export const STAND = { peg: 6, depth: 8, clearance: 0.1 }

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
}

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
  number: { depth: 0.6, height: 7.5, clearance: 0.1, font: 'fonts/OpenSans-Bold.ttf' },
  /** The arms under the rings: how many, how wide, how tall, how far under the hub. */
  arm: { count: 6, width: 6, height: 2, underHub: 15 },
  /** The hub's peg the planet or black hole sits on. */
  peg: { diameter: 8, height: 6 },
  clearance: 0.1,
  /** The bed a ring must fit on, or it is cut into segments on arm lines. */
  bed: 235,
  /** The lane markers' band outside the outer ring, its groove, and how proud the markers stand. */
  lane: { band: 6, groove: 1.5, raise: 1.5 },
}

/** The wells: the black hole's five rings and a planet's four, and how big each hub is (0: as big as ring 1 allows). */
export const WELLS = {
  blackHole: { rings: 5, hubRadius: 0 },
  planet: { rings: 4, hubRadius: 30 },
} as const

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
  /**
   * The planet's bore round the peg kept the featurescript's 0.2 clearance,
   * not the board's 0.1. It runs up through every band into the top piece
   * under a flat roof (an 8.4 bridge) `bore.roof` under the dome, with a
   * keyway along it, so a keyed peg stops the pieces turning. Each band
   * above the base band prints as two pieces cut square to the planet's
   * tilted axis, each on its cut face (whole, its wavy underside has
   * nothing under it); the assembly peg, the bore's shape less the
   * clearance and `seat` shorter, threads them while they are glued,
   * standing on a flange the base band rests on (flat on the table, and
   * something to pull it out by). The
   * cap's lower piece is `sliver` thick at its thinnest.
   */
  planet: {
    radius: 25,
    bands: 4,
    waves: 5,
    amplitude: 1,
    tilt: 5,
    seed: 1,
    clearance: 0.2,
    bore: { roof: 1.4, key: { width: 2.4, depth: 1.2 } },
    assemblyPeg: { seat: 0.3, flange: { diameter: 20, thickness: 2, chamfer: 0.6 } },
    sliver: 0.8,
  },
  blackHole: {
    radius: 30,
    /** The horizon's centre above the hub. */
    centre: 10,
    disc: { outer: 57.5, thickness: 1.6 },
    /** Rows of streaks, how many a row, the inner row's width, length round the disc (degrees) and infall, and the stagger. */
    streaks: { rows: 2, perRow: 3, width: 3, length: 110, infall: 2, stagger: 40 },
  },
}

/**
 * The marks on the markers and item tokens (`pieces/markers/`): how deep
 * every mark is debossed, the top face's and the bed face's alike (the crate
 * and data tokens carry Piracy's skull in the bed face, over bridges).
 * `coupons/marker-depth` prints 0.4, 0.6, 0.8 and 1.0 (one to four
 * notches); the designer's print read best at 0.6.
 */
export const MARKER = { depth: 0.6 }

/**
 * A station's berths hold their ship tokens: a 4x2 magnet lies flat under
 * each clamp's floor, slid in from the clamp's outer face and sealed there by
 * a plug glued in behind it (`station-plugs`), and each ship token carries a
 * ferrous M2x4 countersunk screw at its middle, flush with its underside
 * (the mount's screw, `MOUNT.screw`). The pocket takes the mount's
 * clearance and the plug its fit.
 */
export const BERTH = {
  magnet: { diameter: 4, thickness: 2 },
  /** Plastic between the magnet and the clamp's floor, three layers (the designer's pick over two): the pull falls fast with distance. */
  seal: 0.6,
}

/**
 * The hull and fuel dice (`pieces/dice/`): a pentagonal trapezohedron per
 * counter, never rolled, hollow with a steel ball loose inside, standing on
 * a stand with a magnet sealed under the pocket the die's bottom face drops
 * into: the ball rolls onto the bottom face, over the magnet. The die prints
 * as two halves split at its equator, each on its cut face, lined up by a
 * key ring in a groove in both and glued with the ball inside.
 */
export const DICE = {
  /** The steel ball, loose in the hollow. */
  ball: { diameter: 10 },
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
   * and places the seam's groove.
   */
  inradius: 9.9,
  /**
   * Each pole cut flat, this far across its pentagon's flats, so a vice can
   * press the halves together while the glue sets (6 takes 3.3 off a 14.8
   * pole; the numbers stop 7.6 from the centre).
   */
  poleFlat: 6,
  /**
   * The hollow's wall under a numeral's floor and the least plastic round
   * the seam's groove: two perimeters each (0.7 is two, as at a mount face;
   * the groove's peaked roof leaves 0.74). Under the numbers, the inlay
   * glued over it makes the face 1.4, and every 0.1 off it is pull on the ball.
   */
  wall: { numbers: 0.8, groove: 0.7 },
  /**
   * Where the halves meet: the equator's knife edge stood up as a vertical
   * land on each half; a ring inside it, a decagon `ring` in from the
   * hollow's edge at the cut and `height` tall under a 45-degree roof; and a
   * groove round the seam in both halves for a key ring printed apart, which
   * lines them up all the way round. The ring is what makes room for the
   * groove: above the cut the hollow widens on half the sides and the
   * numbers' pockets come within 0.13 of the cut on the other half, and 2.5
   * by 1.4 leaves 0.86 round a 1.5 by 1 groove and the resting ball 0.59
   * (3 wide reaches the ball; taller than 1.4 gains nothing). The groove is
   * bridged across at one place by a block `gap` long; the key is a C whose
   * opening takes the block, so the halves go together one way only. The
   * groove's roof is a 45-degree peak, not a bridge (a bridged roof sagged
   * onto the key and held the halves apart), and its mouth is chamfered
   * `mouth` for a first layer's flare. The key is the groove less
   * `clearance` across (0.2 let it rattle) and as tall as reaches into
   * both peaks, its top corners `end` under each roof: shorter, it sank into
   * the first half's groove and barely reached the second's.
   */
  seam: {
    land: 0.4,
    ring: 2.5,
    height: 1.4,
    groove: { width: 1.5, depth: 1, gap: 3, clearance: 0.15, end: 0.15, mouth: 0.15 },
  },
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
    /** Plastic between the pocket floor and the magnet, two layers: the pull falls fast with distance. */
    seal: 0.4,
    /**
     * The magnet under the pocket, and the plug under it. A 10x3, not the
     * hulls' 6x2: across the same plastic it pulls the ball about four times
     * as hard, and its face covers more of the floor the ball rolls on.
     */
    magnet: { diameter: 10, thickness: 3 },
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
    /** What the icon's inlay is grown by all round: the fuel icon's thinnest stroke traces 0.42, under FDM.minFeature. */
    iconGrow: 0.1,
  },
}
