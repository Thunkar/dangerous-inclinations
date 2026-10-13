// The corvette's hull, at 80 mm bow to bells, printed in one piece belly
// down. It is the game's own ship: `createShip` builds it, every mesh is
// rebuilt as a solid (lib/kit.ts) and the solids are fused. What the print
// changes is only what printing needs, each said where it is done: parts
// thinner than a nozzle can draw are thickened, the modules, the mount shoes
// and the bells are left off (they print on their own), the bed is the keel,
// the mounts are cut to the printed interface with their magnets sealed at
// one pause, and the bells and the stand get sockets.
import { subtract } from "fluidcad/core";
import { Box3, Matrix4, Vector3, type Object3D } from "three";
import { DEFAULT_SHIP_APPEARANCE } from "@dangerous-inclinations/engine";
import { createShip, type ShipModel } from "../../ui/src/ships/model.ts";
import { DEFAULT_CONFIG, MOUNTS as GAME_MOUNTS, type MountId } from "../../ui/src/ships/config.ts";
import { placedSolids, type PlacedSolid } from "../../ui/src/ships/solid.ts";
import { CORVETTE } from "../../ui/src/ships/corvetteShape.ts";
import { MOUNT, STAND, FDM, PRINT } from "../spec.ts";
import { printFrame, placeSolid, placeBuilt, unite } from "../lib/kit.ts";
import { block, type Solid, type Vec } from "../lib/solids.ts";
import { recessTool, pocketTool, socketBounds, type Mount } from "../lib/mount.ts";

const S = PRINT.mmPerUnit;
/** The keel plating's underside, in hull units: the bed. */
const BED = CORVETTE.armor.keelY - (0.05 + CORVETTE.armor.relief * 0.3);
const FRAME = printFrame(BED);

export function corvetteModel(): ShipModel {
  return createShip({
    ...DEFAULT_CONFIG,
    appearance: { ...DEFAULT_SHIP_APPEARANCE, hull: "corvette" },
  });
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
 * How far out along its outboard axis each mount's face (the hull's skin) is
 * from the game's mount frame, in hull units. At the bow the face is the
 * game's own mount plate, which is wider and taller than the foot.
 */
const flank = CORVETTE.core[2][2] - CORVETTE.mounts.flank;
const FACE: Record<MountId, number> = {
  "forward-0": CORVETTE.core[CORVETTE.core.length - 1][0] - CORVETTE.mounts.bow,
  "side-0": flank,
  "side-1": flank,
  "side-2": flank,
  "side-3": flank,
};

/**
 * The printed mount's frame (x forward, y dorsal, z outboard, z = 0 the face,
 * in mm) as a matrix into the print. The game's mount frame is +X forward, +Y
 * outboard, +Z dorsal; the printed one maps onto it by a rotation (its dorsal
 * to the game's ventral, which the foot's symmetry allows).
 */
function mountFrame(model: ShipModel, id: MountId): Matrix4 {
  const frame = model.mounts.get(id)!.frame;
  const toGame = new Matrix4().makeBasis(
    new Vector3(1, 0, 0),
    new Vector3(0, 0, -1),
    new Vector3(0, 1, 0)
  );
  return FRAME.clone()
    .multiply(inShip(frame, model.root))
    .multiply(new Matrix4().makeTranslation(0, FACE[id], 0))
    .multiply(toGame)
    .multiply(new Matrix4().makeScale(1 / S, 1 / S, 1 / S));
}

export interface CorvetteOptions {
  mount?: Mount;
}

/** The pause: every magnet's centre is at mid-height, its slot ends on the layer line above. */
const CENTRE = -BED * S;
const PAUSE =
  Math.ceil((CENTRE + (MOUNT.magnet.diameter + MOUNT.magnetClearance) / 2) / FDM.layer) * FDM.layer;
export const PAUSE_BEFORE = +(PAUSE + FDM.layer).toFixed(2);

/** Something to cut, where it can reach in the print (mm). */
interface Cut {
  box: Box3;
  make: () => Solid;
  /** Would this cut take all of a piece in `box`? Then the piece is left out, not cut to nothing. */
  swallows?: (box: Box3) => boolean;
}

const boxOf = ([lo, hi]: [Vec, Vec], m: Matrix4) =>
  new Box3(new Vector3(...lo), new Vector3(...hi)).applyMatrix4(m);

export function buildCorvette({ mount = MOUNT }: CorvetteOptions = {}): void {
  const model = corvetteModel();

  // The pieces: the game's hull, mesh by mesh, and what the print adds.
  // `box` is where a piece is, `reach` where it may reach once grown and thickened.
  const pieces: { box: Box3; reach: Box3; make: () => Solid | null }[] = placedSolids(model.root)
    .filter(onHull)
    .map((p) => {
      const box = boxOf(p.bounds, FRAME);
      return {
        box,
        reach: box.clone().expandByScalar(1),
        make: () => placeSolid(p, FRAME, { min: FDM.minFeature, grow: FDM.join }),
      };
    });

  // The cuts: each mount's recess and sealed magnet slot, a socket in the
  // thrust plate for each bell, the stand's socket, and the bed (the drive
  // block stands lower than the keel; the bed is the keel).
  const cuts: Cut[] = [];
  for (const { id } of GAME_MOUNTS) {
    const m = mountFrame(model, id);
    // The slot rises to the pause, whichever way the mount frame's y points in the print.
    const up = Math.sign(new Vector3(0, 1, 0).transformDirection(m).z) || 1;
    const rise = up * (PAUSE - new Vector3().setFromMatrixPosition(m).z);
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
  // hangs to 0.2 behind, through the plate's face 0.09 behind it at any
  // scale), grown by the tenon's clearance.
  model.root.traverse((o) => {
    if (!/^drive_bell_\d+$/.test(o.name)) return;
    const bell = inShip(o, model.root).multiply(new Matrix4().makeTranslation(0, 0.04, 0));
    const scale = new Vector3().setFromMatrixScale(bell).x;
    const r = 0.3 + MOUNT.clearance / (S * scale);
    const placed: PlacedSolid = {
      spec: { kind: "cylinder", top: r, bottom: r, height: 0.32, sides: 48, thetaStart: 0 },
      matrix: bell.toArray(),
      material: "",
      path: [o.name, "socket"],
      bounds: [
        [-r, -0.16, -r],
        [r, 0.16, r],
      ],
    };
    cuts.push({
      box: boxOf(placed.bounds, FRAME.clone().multiply(bell)),
      make: () => placeSolid(placed, FRAME)!,
    });
  });
  const side = STAND.peg + 2 * STAND.clearance;
  const stand: [Vec, Vec] = [
    [-0.4 * S - side / 2, -side / 2, -1],
    [-0.4 * S + side / 2, side / 2, STAND.depth],
  ];
  cuts.push({ box: boxOf(stand, new Matrix4()), make: () => block(...stand) });
  const below: [Vec, Vec] = [
    [-200, -200, -50],
    [200, 200, 0],
  ];
  cuts.push({
    box: boxOf(below, new Matrix4()),
    make: () => block(...below),
    // `reach` is a piece grown by 1 mm: one that would leave at most 0.3 mm above the bed goes.
    swallows: (b) => b.max.z <= 1.3,
  });

  // Cut each piece where a cut reaches it, then fuse what is left: cutting
  // the pieces is cutting their union, and a few small cuts finish where one
  // cut through the whole hull does not.
  const cutPieces = pieces
    .filter((p) => !cuts.some((c) => c.swallows?.(p.reach)))
    .map((p) => {
      let s = p.make();
      if (!s) return null;
      for (const c of cuts) if (c.box.intersectsBox(p.reach)) s = subtract(s, c.make());
      return { s, box: p.box };
    })
    .filter((p): p is { s: Solid; box: Box3 } => p !== null);
  // The fuse is anchored on the biggest piece, the core.
  const volume = (b: Box3) =>
    b
      .getSize(new Vector3())
      .toArray()
      .reduce((a, n) => a * n, 1);
  const core = cutPieces.reduce(
    (best, p, i) => (volume(p.box) > volume(cutPieces[best].box) ? i : best),
    0
  );
  unite(
    cutPieces.map((p) => p.s),
    60,
    core
  );
}
