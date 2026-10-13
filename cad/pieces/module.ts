// A subsystem module, printed on its own, mating face down: the game's own
// module (`createShip` with it in a mount) above the hull's skin, standing on
// the printed foot's tenon with the screw's seat drilled from below. One
// print fits every mount the module may take (the foot is symmetric dorsal
// to ventral and the modules are built in the mount's frame).
import { subtract, fuse } from "fluidcad/core";
import { Box3, Matrix4, Vector3 } from "three";
import {
  canInstallInSlot,
  DEFAULT_SHIP_APPEARANCE,
  SUBSYSTEM_CONFIGS,
  type SubsystemType,
} from "@dangerous-inclinations/engine";
import { createShip } from "../../ui/src/ships/model.ts";
import { DEFAULT_CONFIG, setModule, type MountId } from "../../ui/src/ships/config.ts";
import { placedSolids } from "../../ui/src/ships/solid.ts";
import { CORVETTE } from "../../ui/src/ships/corvetteShape.ts";
import { MOUNT, FDM, PRINT } from "../spec.ts";
import { placeSolid } from "../lib/kit.ts";
import { block, move, type Solid } from "../lib/solids.ts";
import { tenon } from "../lib/mount.ts";

const S = PRINT.mmPerUnit;

/**
 * Where the module meets the hull, along the mount's outboard axis, in hull
 * units: the flank's skin for a module that fits a flank, the bow's for one
 * that fits only the bow.
 */
function skinOf(id: MountId): number {
  return id === "forward-0"
    ? CORVETTE.core[CORVETTE.core.length - 1][0] - CORVETTE.mounts.bow
    : CORVETTE.core[2][2] - CORVETTE.mounts.flank;
}

/** The mount a module is printed for: a flank if it fits one, else the bow. */
export function mountFor(type: SubsystemType): MountId {
  return canInstallInSlot(type, "side") ? "side-0" : "forward-0";
}

/** Build the module for `type`, `dx` mm along x (to lay several out side by side). */
export function buildModule(type: SubsystemType, dx = 0): void {
  const id = mountFor(type);
  const config = setModule(
    { ...DEFAULT_CONFIG, appearance: { ...DEFAULT_SHIP_APPEARANCE, hull: "corvette" } },
    id,
    type
  );
  const model = createShip(config);
  const group = model.mounts.get(id)!.module;
  const tenonThick = MOUNT.recessDepth - 0.1;
  // The module group stands off the mount frame; the skin is measured from the frame.
  const skin = skinOf(id) - group.position.y;
  // The game's mount frame (+X forward, +Y outboard, +Z dorsal) to the print:
  // a quarter turn about x stands outboard up, and the skin goes to the top of
  // the tenon, which stands on the bed.
  const frame = new Matrix4()
    .makeTranslation(0, 0, tenonThick)
    .multiply(new Matrix4().makeScale(S, S, S))
    .multiply(new Matrix4().makeRotationX(Math.PI / 2))
    .multiply(new Matrix4().makeTranslation(0, -skin, 0));
  // Each part above the skin: a part wholly below it is the shoe's business
  // (the tenon replaces it), one across it is cut there. Then everything is
  // fused at once with the tenon.
  const above = (lo: number) => lo >= tenonThick - 0.01;
  const parts = placedSolids(group)
    .filter((p) => !p.path.includes("mount_shoe"))
    .map((p) => ({
      p,
      box: new Box3(new Vector3(...p.bounds[0]), new Vector3(...p.bounds[1])).applyMatrix4(frame),
    }))
    .filter(({ box }) => box.max.z > tenonThick + 0.3)
    .map(({ p, box }) => {
      const s = placeSolid(p, frame, { min: FDM.minFeature, grow: FDM.join });
      if (!s || above(box.min.z - 1)) return s;
      return subtract(s, block([-100, -100, -50], [100, 100, tenonThick]));
    })
    .filter((s): s is Solid => s !== null);
  // The game's base plate stands on the shoe, its middle 0.16 out from the
  // module's origin; the tenon reaches up into it, whatever the mount's skin.
  const piece = fuse(...parts, tenon(MOUNT, (0.16 - skin) * S));
  if (dx) move(piece, dx, 0, 0);
}

/** Every subsystem a loadout slot can hold, each of which prints as a module. */
export const MODULE_TYPES: SubsystemType[] = (
  Object.keys(SUBSYSTEM_CONFIGS) as SubsystemType[]
).filter((t) => canInstallInSlot(t, "side") || canInstallInSlot(t, "forward"));
