// A subsystem module, printed on its own, mating face down: the game's own
// module (`createShip` with it in a mount) above the hull's skin, standing on
// the printed foot's tenon with the screw's seat drilled from below. One
// print fits every mount the module may take (the foot is symmetric dorsal
// to ventral and the modules are built in the mount's frame).
import { subtract, fuse } from "fluidcad/core";
import { Box3, Matrix4, Mesh, Vector3, type Object3D } from "three";
import {
  canInstallInSlot,
  DEFAULT_SHIP_APPEARANCE,
  SUBSYSTEM_CONFIGS,
  type SubsystemType,
} from "@dangerous-inclinations/engine";
import { createShip } from "../../ui/src/ships/model.ts";
import { DEFAULT_CONFIG, setModule, type MountId } from "../../ui/src/ships/config.ts";
import { placedSolids, solidOf } from "../../ui/src/ships/solid.ts";
import { mountFace } from "../../ui/src/ships/mountShape.ts";
import { MOUNT, FDM, PRINT } from "../spec.ts";
import { placeSolid } from "../lib/kit.ts";
import { block, move, type Solid } from "../lib/solids.ts";
import { countersinkTool, pilotTool } from "../lib/mount.ts";

const S = PRINT.mmPerUnit;

/**
 * Where solid runs along the vertical line at (x, y) in the print, as [from,
 * to] spans: every closed mesh of `group` the line crosses (`frame` takes the
 * group into the print), merged. Meshes too fine to print are left out.
 */
function spansAt(group: Object3D, frame: Matrix4, x: number, y: number): [number, number][] {
  group.updateMatrixWorld(true);
  const toGroup = group.matrixWorld.clone().invert();
  const spans: [number, number][] = [];
  const [a, b, c] = [new Vector3(), new Vector3(), new Vector3()];
  group.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || solidOf(mesh.geometry)?.kind === "detail") return;
    const m = frame.clone().multiply(toGroup).multiply(mesh.matrixWorld);
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const pos = geometry.getAttribute("position");
    const zs: number[] = [];
    for (let i = 0; i + 2 < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i).applyMatrix4(m);
      b.fromBufferAttribute(pos, i + 1).applyMatrix4(m);
      c.fromBufferAttribute(pos, i + 2).applyMatrix4(m);
      const d = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((x - a.x) * (c.y - a.y) - (c.x - a.x) * (y - a.y)) / d;
      const v = ((b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y)) / d;
      if (u < 0 || v < 0 || u + v > 1) continue;
      zs.push(a.z + u * (b.z - a.z) + v * (c.z - a.z));
    }
    zs.sort((p, q) => p - q);
    const unique = zs.filter((z, i) => i === 0 || z - zs[i - 1] > 1e-4);
    for (let i = 0; i + 1 < unique.length; i += 2) spans.push([unique[i], unique[i + 1]]);
  });
  return spans.sort((p, q) => p[0] - q[0]);
}

/**
 * How high solid runs unbroken from `from` up a line, bridging the hairline
 * gaps the print grows shut (or leaves under an extrusion's width).
 */
function solidUp(spans: [number, number][], from: number): number {
  let top = from;
  for (const [lo, hi] of spans) if (lo <= top + 2 * FDM.join + 0.1 && hi > top) top = hi;
  return top;
}

/** The mount a module is printed for: a flank if it fits one, else the bow. */
export function mountFor(type: SubsystemType): MountId {
  return canInstallInSlot(type, "side") ? "side-0" : "forward-0";
}

/**
 * The game's module for `type` in the mount it prints for, and the print's
 * frame: the game's mount frame (+X forward, +Y outboard, +Z dorsal) turned
 * a quarter about x so outboard is up, with the skin (the mount's face) at
 * the top of the foot's tenon, which stands on the bed.
 */
export function layout(type: SubsystemType) {
  const id = mountFor(type);
  const config = setModule(
    { ...DEFAULT_CONFIG, appearance: { ...DEFAULT_SHIP_APPEARANCE, hull: "corvette" } },
    id,
    type
  );
  const group = createShip(config).mounts.get(id)!.module;
  const tenonThick = MOUNT.recessDepth - MOUNT.clearance;
  // The module group stands off the mount frame; the skin is measured from the frame.
  const skin = mountFace(id === "forward-0") - group.position.y;
  const frame = new Matrix4()
    .makeTranslation(0, 0, tenonThick)
    .multiply(new Matrix4().makeScale(S, S, S))
    .multiply(new Matrix4().makeRotationX(Math.PI / 2))
    .multiply(new Matrix4().makeTranslation(0, -skin, 0));
  return { group, frame, tenonThick };
}

/**
 * The longest screw `type`'s module takes, in whole millimetres: as far as
 * plastic stands round the pilot (0.6 mm out from its wall), less
 * a cover over the tip, up to the longest screw, and never under the
 * shortest.
 */
export function screwFor(type: SubsystemType): number {
  const { group, frame } = layout(type);
  const wall = MOUNT.screw.pilot / 2 + 0.6;
  let top = Infinity;
  for (let k = 0; k < 12; k++) {
    const t = (k / 12) * Math.PI * 2;
    const spans = spansAt(group, frame, wall * Math.cos(t) + 1e-3, wall * Math.sin(t) + 2e-3);
    top = Math.min(top, solidUp(spans, 0));
  }
  const cover = 0.8;
  const fits = Math.floor(top - cover - 0.6);
  return Math.max(MOUNT.screw.shortest, Math.min(MOUNT.screw.longest, fits));
}

/** Build the module for `type`, `dx` mm along x (to lay several out side by side). */
export function buildModule(type: SubsystemType, dx = 0): Solid {
  const { group, frame, tenonThick } = layout(type);
  // The game's module as it is: the foot's tenon exactly (it seats in the
  // hull's recess, so it is not grown), every other part grown and cut at the
  // skin if it reaches below it. Then the screw's countersink and pilot.
  const parts = placedSolids(group)
    .map((p) => ({
      p,
      tenon: p.path.includes("mount_tenon"),
      box: new Box3(new Vector3(...p.bounds[0]), new Vector3(...p.bounds[1])).applyMatrix4(frame),
    }))
    .filter(({ tenon, box }) => tenon || box.max.z > tenonThick + 0.3)
    .map(({ p, tenon, box }) => {
      if (tenon) return placeSolid(p, frame);
      const s = placeSolid(p, frame, { min: FDM.minFeature, grow: FDM.join });
      if (!s || box.min.z >= tenonThick + 0.99) return s;
      return subtract(s, block([-100, -100, -50], [100, 100, tenonThick]));
    })
    .filter((s): s is Solid => s !== null);
  const piece = subtract(
    subtract(fuse(...parts), countersinkTool(MOUNT)),
    pilotTool(MOUNT, screwFor(type) + 0.6)
  );
  return dx ? move(piece, dx, 0, 0) : piece;
}

/**
 * The box `type`'s printed module fills, mating face on the bed: its length
 * (x, along the mount), width (y) and height (z) in mm, grown as the print
 * grows its parts.
 */
export function envelopeOf(type: SubsystemType): { long: number; wide: number; tall: number } {
  const { group, frame } = layout(type);
  group.updateMatrixWorld(true);
  const toGroup = group.matrixWorld.clone().invert();
  const box = new Box3();
  group.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || solidOf(mesh.geometry)?.kind === "detail") return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(frame.clone().multiply(toGroup).multiply(mesh.matrixWorld)));
  });
  const g = 2 * FDM.join;
  return {
    long: 2 * Math.max(-box.min.x, box.max.x) + g,
    wide: 2 * Math.max(-box.min.y, box.max.y) + g,
    tall: box.max.z + FDM.join,
  };
}

/** Every subsystem a loadout slot can hold, each of which prints as a module. */
export const MODULE_TYPES: SubsystemType[] = (
  Object.keys(SUBSYSTEM_CONFIGS) as SubsystemType[]
).filter((t) => canInstallInSlot(t, "side") || canInstallInSlot(t, "forward"));
