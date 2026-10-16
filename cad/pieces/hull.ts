// A ship's hull, at 80 mm long for the corvette (the others at the same
// scale), printed in one piece belly down, its drive with it. It is the game's own ship:
// `createShip` builds it, every mesh is rebuilt as a solid (lib/kit.ts) and
// the solids are fused. What the print changes is only what printing needs,
// each said where it is done: parts thinner than a nozzle can draw are
// thickened, the modules and the mount shoes are left off (they print on
// their own), the bed is the hull's flat bottom, the mounts are cut to the
// printed interface with their magnets sealed at a pause, and the stand gets
// a socket. Anything that hangs below the bed (the shrike's
// blade, the mantis's fins) prints as a piece of its own, upside down on the
// cut, and is glued on.
import { fuse, subtract } from "fluidcad/core";
import { Box3, Matrix4, Vector3, type Object3D } from "three";
import { DEFAULT_SHIP_APPEARANCE, type Hull } from "@dangerous-inclinations/engine";
import { createShip, type ShipModel } from "../../ui/src/ships/model.ts";
import { DEFAULT_CONFIG, MOUNTS as GAME_MOUNTS, type MountId } from "../../ui/src/ships/config.ts";
import { placedSolids, type PlacedSolid } from "../../ui/src/ships/solid.ts";
import { HULL_INFO } from "../../ui/src/ships/hulls.ts";
import { mountFace } from "../../ui/src/ships/mountShape.ts";
import { MANTIS_KEEL } from "../../ui/src/ships/mantis.ts";
import { MOUNT, STAND, FDM, PRINT } from "../spec.ts";
import { printFrame, placeSolid, placeBuilt, uniteAlong } from "../lib/kit.ts";
import { block, disc, move, taper, turn, type Solid, type Vec } from "../lib/solids.ts";
import { recessTool, pocketTool, socketBounds, type Mount } from "../lib/mount.ts";

const S = PRINT.mmPerUnit;

/**
 * Each hull's print: `bed` is its flat bottom (game y, `HULL_INFO.keel`);
 * `socket` where the stand's peg goes in (x), how wide the peg is and how
 * deep the socket, for a hull whose stand has a peg (`pieces/stand.ts`: the
 * shrike's grips its blade instead); `pins` the x of the filament pins that
 * locate a piece glued on below the bed (none where the piece is too thin
 * to take one).
 */
export const HULL_PRINT: Record<
  Hull,
  { bed: number; socket: { x: number; peg: number; depth: number } | null; pins: number[] }
> = {
  corvette: {
    bed: HULL_INFO.corvette.keel,
    socket: { x: -0.4, peg: STAND.peg, depth: STAND.depth },
    pins: [],
  },
  // The blade hangs below the keel plates, over where a socket would go.
  shrike: { bed: HULL_INFO.shrike.keel, socket: null, pins: [-0.2, 0.9] },
  // The keel under the core is 4 mm wide at its foot: a slim peg, at its middle.
  // The arm fins hang below the arms, too thin for pins.
  mantis: {
    bed: HULL_INFO.mantis.keel,
    socket: { x: (MANTIS_KEEL.aft + MANTIS_KEEL.fore) / 2, peg: 2.6, depth: 5 },
    pins: [],
  },
};

export function shipModel(hull: Hull): ShipModel {
  return createShip({ ...DEFAULT_CONFIG, appearance: { ...DEFAULT_SHIP_APPEARANCE, hull } });
}

/**
 * What prints with the hull: not the modules (`module_<mount>_<type>`) or
 * the shipyard's mount highlights (a marker the yard lights when a mount is
 * picked, not part of the ship).
 */
const onHull = (p: PlacedSolid) =>
  p.material !== "highlight" &&
  !p.path.some((n) => n.startsWith("module_"));

/** An object's matrix relative to the ship's root. */
function inShip(object: Object3D, root: Object3D): Matrix4 {
  root.updateMatrixWorld(true);
  return root.matrixWorld.clone().invert().multiply(object.matrixWorld);
}

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
    .multiply(new Matrix4().makeTranslation(0, mountFace(id === "forward-0"), 0))
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
  /** The drive's pair this piece belongs to (`intake_<n>`), fused on its own first. */
  pair?: string;
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
        pair: p.path.find((n) => /^intake_\d+$/.test(n)),
      };
    });
}

/** The stand's socket at x: a square for the peg, `depth` deep, its roof rising to a point at 45 degrees. */
function socketCuts(x: number, peg: number, depth: number): Cut[] {
  const cuts: Cut[] = [];
  const side = peg + 2 * STAND.clearance;
  const stand: [Vec, Vec] = [
    [x - side / 2, -side / 2, -1],
    [x + side / 2, side / 2, depth],
  ];
  cuts.push({ box: boxOf(stand, new Matrix4()), make: () => block(...stand) });
  // Its roof rises to a point at 45 degrees rather than closing flat over the peg.
  const roof: [Vec, Vec] = [
    [x - side / 2, -side / 2, depth - 0.01],
    [x + side / 2, side / 2, depth + side / 2],
  ];
  cuts.push({
    box: boxOf(roof, new Matrix4()),
    make: () =>
      move(
        taper(
          [
            [-side / 2, -side / 2],
            [side / 2, -side / 2],
            [side / 2, side / 2],
            [-side / 2, side / 2],
          ],
          side / 2 - 0.05
        ),
        x,
        0,
        depth - 0.01
      ),
  });
  return cuts;
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
      return { s, box: p.box, pair: p.pair };
    })
    .filter((p): p is { s: Solid; box: Box3; pair: string | undefined } => p !== null);
  // Each of the drive's pairs fused on its own first: a pair is a couple of
  // hundred small pieces lying in and on each other, which one fuse with the
  // rest of the hull takes minutes over and a fuse of their own a second.
  const pairs = new Map<string, { s: Solid; box: Box3 }[]>();
  const loose: { s: Solid; box: Box3 }[] = [];
  for (const p of made) {
    if (p.pair) pairs.set(p.pair, [...(pairs.get(p.pair) ?? []), p]);
    else loose.push(p);
  }
  for (const group of pairs.values())
    loose.push({
      s: fuse(...group.map((p) => p.s)),
      box: group.reduce((b, p) => b.union(p.box), new Box3()),
    });
  const volume = (b: Box3) =>
    b
      .getSize(new Vector3())
      .toArray()
      .reduce((a, n) => a * n, 1);
  const core = loose.reduce((best, p, i) => (volume(p.box) > volume(loose[best].box) ? i : best), 0);
  return uniteAlong(loose, core);
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

export function buildHull(hull: Hull, mount: Mount = MOUNT): Solid {
  const model = shipModel(hull);
  const frame = printFrame(HULL_PRINT[hull].bed);
  const pieces = piecesOf(model, frame);

  // The cuts: each mount's recess and sealed magnet slot, the stand's
  // socket, the pins for a piece
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
      new Vector3(mount.halfLength, mount.halfHeight, mount.recessReach + 1)
    );
    cuts.push({
      box,
      make: () => placeBuilt(recessTool(mount), m),
      swallows: (b) => recess.containsBox(b.clone().applyMatrix4(local)),
    });
    cuts.push({ box, make: () => placeBuilt(pocketTool(mount, rise), m) });
  }
  const socket = HULL_PRINT[hull].socket;
  if (socket) cuts.push(...socketCuts(socket.x * S, socket.peg, socket.depth));
  cuts.push(...pinCuts(hull, true));
  cuts.push({
    box: boxOf(BELOW, new Matrix4()),
    make: () => block(...BELOW),
    // `reach` is a piece grown by 1 mm: one that would leave at most 0.3 mm above the bed goes.
    swallows: (b) => b.max.z <= 1.3,
  });
  return cutAndUnite(pieces, cuts);
}

/**
 * What hangs below the hull's bed, as a piece of its own: cut at the bed and
 * turned over to print standing on the cut, with holes for the pins that
 * locate it. Only what reaches well below the bed (2 mm) belongs to it; the
 * slivers of the drive block and the like under the bed are simply cut off.
 */
export function buildBelow(hull: Hull): Solid | null {
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
  return pieces.length ? turn(cutAndUnite(pieces, cuts), "x", 180) : null;
}
