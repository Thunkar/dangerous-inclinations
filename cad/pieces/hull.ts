// A ship's hull, at 80 mm bow to bells for the corvette (the others at the
// same scale), printed in one piece belly down. It is the game's own ship:
// `createShip` builds it, every mesh is rebuilt as a solid (lib/kit.ts) and
// the solids are fused. What the print changes is only what printing needs,
// each said where it is done: parts thinner than a nozzle can draw are
// thickened, the modules, the mount shoes and the bells are left off (they
// print on their own), the bed is the hull's flat bottom, the mounts are cut
// to the printed interface with their magnets sealed at a pause, and the bells
// and the stand get sockets. Anything that hangs below the bed (the shrike's
// blade, the mantis's fins) prints as a piece of its own, upside down on the
// cut, and is glued on.
import { subtract } from "fluidcad/core";
import { Box3, Matrix4, Vector3, type Object3D } from "three";
import { DEFAULT_SHIP_APPEARANCE, type Hull } from "@dangerous-inclinations/engine";
import { createShip, type ShipModel } from "../../ui/src/ships/model.ts";
import { DEFAULT_CONFIG, MOUNTS as GAME_MOUNTS, type MountId } from "../../ui/src/ships/config.ts";
import { placedSolids, type PlacedSolid } from "../../ui/src/ships/solid.ts";
import { CORVETTE } from "../../ui/src/ships/corvetteShape.ts";
import { HULL_INFO } from "../../ui/src/ships/hulls.ts";
import { MOUNT, STAND, FDM, PRINT } from "../spec.ts";
import { printFrame, placeSolid, placeBuilt, uniteAlong } from "../lib/kit.ts";
import { block, disc, move, turn, type Solid, type Vec } from "../lib/solids.ts";
import { recessTool, pocketTool, socketBounds, type Mount } from "../lib/mount.ts";

const S = PRINT.mmPerUnit;

/**
 * Each hull's print: `bed` is its flat bottom (game y, `HULL_INFO.keel`); `stand` the x of the stand's socket; `pins` the x of the
 * filament pins that locate a piece glued on below the bed (none where the
 * piece is too thin to take one).
 */
export const HULL_PRINT: Record<Hull, { bed: number; stand: number; pins: number[] }> = {
  corvette: { bed: HULL_INFO.corvette.keel, stand: -0.4, pins: [] },
  // The blade hangs below the keel plates.
  shrike: { bed: HULL_INFO.shrike.keel, stand: 0.3, pins: [-0.2, 0.9] },
  // The arm fins hang below the arms, too thin for pins.
  mantis: { bed: HULL_INFO.mantis.keel, stand: 0.3, pins: [] },
};

export function shipModel(hull: Hull): ShipModel {
  return createShip({ ...DEFAULT_CONFIG, appearance: { ...DEFAULT_SHIP_APPEARANCE, hull } });
}

/**
 * What prints with the hull: not the modules (`module_<mount>_<type>`), the
 * mount shoes, the bells and their gimbal struts (they run into where a
 * printed bell plugs in), or the shipyard's mount highlights (a marker the
 * yard lights when a mount is picked, not part of the ship).
 */
const onHull = (p: PlacedSolid) =>
  p.material !== "highlight" &&
  !p.path.some(
    (n) =>
      n.startsWith("module_") ||
      n === "mount_shoe" ||
      n.startsWith("drive_bell") ||
      n === "bell_gimbal"
  );

/** An object's matrix relative to the ship's root. */
function inShip(object: Object3D, root: Object3D): Matrix4 {
  root.updateMatrixWorld(true);
  return root.matrixWorld.clone().invert().multiply(object.matrixWorld);
}

/**
 * Where the printed mount's face is along the game mount frame's outboard
 * axis, in hull units: the corvette's skin, 0.06 out on a flank and 0.01 in
 * at the bow. It is the same on every hull, because a module is one print for
 * every hull and its seat must be the same distance from the frame.
 */
const FACE = (id: MountId) =>
  id === "forward-0"
    ? CORVETTE.core[CORVETTE.core.length - 1][0] - CORVETTE.mounts.bow
    : CORVETTE.core[2][2] - CORVETTE.mounts.flank;

/**
 * The printed mount's frame (x forward, y dorsal, z outboard, z = 0 the face,
 * in mm) as a matrix into the print. The game's mount frame is +X forward, +Y
 * outboard, +Z dorsal; the printed one maps onto it by a rotation (its dorsal
 * to the game's ventral, which the foot's symmetry allows).
 */
function mountFrame(model: ShipModel, frame: Matrix4, id: MountId): Matrix4 {
  const toGame = new Matrix4().makeBasis(
    new Vector3(1, 0, 0),
    new Vector3(0, 0, -1),
    new Vector3(0, 1, 0)
  );
  return frame
    .clone()
    .multiply(inShip(model.mounts.get(id)!.frame, model.root))
    .multiply(new Matrix4().makeTranslation(0, FACE(id), 0))
    .multiply(toGame)
    .multiply(new Matrix4().makeScale(1 / S, 1 / S, 1 / S));
}

/** The layer a magnet centred at height z (mm) pauses before: its slot ends on the line below it. */
function pauseFor(z: number): number {
  const top = z + (MOUNT.magnet.diameter + MOUNT.magnetClearance) / 2;
  return Math.ceil(top / FDM.layer - 1e-9) * FDM.layer;
}

/** The layers a hull's print pauses before, one for each height its magnets sit at. */
export function pausesOf(hull: Hull): number[] {
  const model = shipModel(hull);
  const frame = printFrame(HULL_PRINT[hull].bed);
  const at = new Set(
    GAME_MOUNTS.map(
      ({ id }) =>
        +(
          pauseFor(new Vector3().setFromMatrixPosition(mountFrame(model, frame, id)).z) + FDM.layer
        ).toFixed(2)
    )
  );
  return [...at].sort((a, b) => a - b);
}

/** Something to cut, where it can reach in the print (mm). */
interface Cut {
  box: Box3;
  make: () => Solid;
  /** Would this cut take all of a piece in `box`? Then the piece is left out, not cut to nothing. */
  swallows?: (box: Box3) => boolean;
}

const boxOf = ([lo, hi]: [Vec, Vec], m: Matrix4) =>
  new Box3(new Vector3(...lo), new Vector3(...hi)).applyMatrix4(m);

const FAR = 300;
const ABOVE: [Vec, Vec] = [
  [-FAR, -FAR, 0],
  [FAR, FAR, FAR],
];
const BELOW: [Vec, Vec] = [
  [-FAR, -FAR, -FAR],
  [FAR, FAR, 0],
];
/** The pins that locate a glued piece: 1.75 mm filament in 1.9 mm holes, 3 mm each way. */
const PIN = { diameter: 1.9, depth: 3 };

/** A piece of the hull: where it is, where it may reach once grown and thickened, how to make it. */
interface Piece {
  box: Box3;
  reach: Box3;
  make: () => Solid | null;
}

function piecesOf(model: ShipModel, frame: Matrix4): Piece[] {
  return placedSolids(model.root)
    .filter(onHull)
    .map((p) => {
      const box = boxOf(p.bounds, frame);
      return {
        box,
        reach: box.clone().expandByScalar(1),
        make: () => placeSolid(p, frame, { min: FDM.minFeature, grow: FDM.join }),
      };
    });
}

/**
 * Cut each piece where a cut reaches it, then fuse what is left, anchored on
 * the biggest, in runs along the hull (`uniteAlong`).
 */
function cutAndUnite(pieces: Piece[], cuts: Cut[]): Solid {
  const made = pieces
    .filter((p) => !cuts.some((c) => c.swallows?.(p.reach)))
    .map((p) => {
      let s = p.make();
      if (!s) return null;
      for (const c of cuts) if (c.box.intersectsBox(p.reach)) s = subtract(s, c.make());
      return { s, box: p.box };
    })
    .filter((p): p is { s: Solid; box: Box3 } => p !== null);
  const volume = (b: Box3) =>
    b
      .getSize(new Vector3())
      .toArray()
      .reduce((a, n) => a * n, 1);
  const core = made.reduce((best, p, i) => (volume(p.box) > volume(made[best].box) ? i : best), 0);
  return uniteAlong(made, core);
}

function pinCuts(hull: Hull, up: boolean): Cut[] {
  return HULL_PRINT[hull].pins.map((x) => {
    const lo: Vec = [x * S - PIN.diameter, -PIN.diameter, up ? -0.01 : -PIN.depth];
    const hi: Vec = [x * S + PIN.diameter, PIN.diameter, up ? PIN.depth : 0.01];
    return {
      box: boxOf([lo, hi], new Matrix4()),
      make: () => move(disc(PIN.diameter, PIN.depth + 0.01), x * S, 0, up ? -0.01 : -PIN.depth),
    };
  });
}

export function buildHull(hull: Hull, mount: Mount = MOUNT): void {
  const model = shipModel(hull);
  const frame = printFrame(HULL_PRINT[hull].bed);
  const pieces = piecesOf(model, frame);

  // The cuts: each mount's recess and sealed magnet slot, a socket in the
  // thrust plate for each bell, the stand's socket, the pins for a piece
  // glued on below, and the bed (whatever hangs below it prints on its own).
  const cuts: Cut[] = [];
  for (const { id } of GAME_MOUNTS) {
    const m = mountFrame(model, frame, id);
    // The slot rises to its pause, whichever way the mount frame's y points in the print.
    const up = Math.sign(new Vector3(0, 1, 0).transformDirection(m).z) || 1;
    const centre = new Vector3().setFromMatrixPosition(m).z;
    const rise = up * (pauseFor(centre) - centre);
    const box = boxOf(socketBounds(mount, rise), m);
    // A piece inside the recess's box, seen in the mount's own frame.
    const local = m.clone().invert();
    const recess = new Box3(
      new Vector3(-mount.halfLength, -mount.halfHeight, -mount.recessDepth),
      new Vector3(mount.halfLength, mount.halfHeight, 2)
    );
    cuts.push({
      box,
      make: () => placeBuilt(recessTool(mount), m),
      swallows: (b) => recess.containsBox(b.clone().applyMatrix4(local)),
    });
    cuts.push({ box, make: () => placeBuilt(pocketTool(mount, rise), m) });
  }
  // The bell's chamber (radius 0.3 of a bell, from 0.12 ahead of where it
  // hangs to 0.58 behind, out through whatever plate or shroud the hull
  // hangs it in), grown by the tenon's clearance.
  model.root.traverse((o) => {
    if (!/^drive_bell_\d+$/.test(o.name)) return;
    const bell = inShip(o, model.root).multiply(new Matrix4().makeTranslation(0, 0.23, 0));
    const scale = new Vector3().setFromMatrixScale(bell).x;
    const r = 0.3 + MOUNT.clearance / (S * scale);
    const placed: PlacedSolid = {
      spec: { kind: "cylinder", top: r, bottom: r, height: 0.7, sides: 48, thetaStart: 0 },
      matrix: bell.toArray(),
      material: "",
      path: [o.name, "socket"],
      bounds: [
        [-r, -0.35, -r],
        [r, 0.35, r],
      ],
    };
    cuts.push({
      box: boxOf(placed.bounds, frame.clone().multiply(bell)),
      make: () => placeSolid(placed, frame)!,
    });
  });
  const side = STAND.peg + 2 * STAND.clearance;
  const x = HULL_PRINT[hull].stand * S;
  const stand: [Vec, Vec] = [
    [x - side / 2, -side / 2, -1],
    [x + side / 2, side / 2, STAND.depth],
  ];
  cuts.push({ box: boxOf(stand, new Matrix4()), make: () => block(...stand) });
  cuts.push(...pinCuts(hull, true));
  cuts.push({
    box: boxOf(BELOW, new Matrix4()),
    make: () => block(...BELOW),
    // `reach` is a piece grown by 1 mm: one that would leave at most 0.3 mm above the bed goes.
    swallows: (b) => b.max.z <= 1.3,
  });
  cutAndUnite(pieces, cuts);
}

/**
 * What hangs below the hull's bed, as a piece of its own: cut at the bed and
 * turned over to print standing on the cut, with holes for the pins that
 * locate it. Only what reaches well below the bed (2 mm) belongs to it; the
 * slivers of the drive block and the like under the bed are simply cut off.
 */
export function buildBelow(hull: Hull): void {
  const model = shipModel(hull);
  const frame = printFrame(HULL_PRINT[hull].bed);
  const pieces = piecesOf(model, frame).filter((p) => p.box.min.z < -2);
  const cuts: Cut[] = [
    {
      box: boxOf(ABOVE, new Matrix4()),
      make: () => block(...ABOVE),
      swallows: (b) => b.min.z >= -1.3,
    },
    ...pinCuts(hull, false),
  ];
  // Built below the bed, then turned over about x: the cut is the bed.
  if (pieces.length) turn(cutAndUnite(pieces, cuts), "x", 180);
}
