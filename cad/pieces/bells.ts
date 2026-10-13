// The corvette's bells, printed on their own, mouth down, and pushed into
// their sockets in the thrust plate. Each is the yard's de Laval bell
// (ui/src/ships/bell.ts) at the game's scale for its place, with the game's
// own hat bands; the cooling tubes are finer than a nozzle and stay off. The
// game's wall is a hair thick at the lip, so the printed wall is never
// thinner than WALL, and the chamber is solid: it is the plug.
import { fuse } from "fluidcad/core";
import { Matrix4, Vector3, type Object3D } from "three";
import { BELL_WALL } from "../../ui/src/ships/bell.ts";
import { placedSolids, type PlacedSolid } from "../../ui/src/ships/solid.ts";
import { FDM, PRINT } from "../spec.ts";
import { placeSolid } from "../lib/kit.ts";
import type { Solid } from "../lib/solids.ts";
import { corvetteModel } from "./corvette.ts";

const S = PRINT.mmPerUnit;
/** The printed bell's thinnest wall, mm. */
const WALL = 0.8;

/** The bell's [radius, distance aft] profile for printing at `scale`. */
function printedProfile(scale: number): [number, number][] {
  const t = WALL / (S * scale);
  const outer = BELL_WALL.slice(0, 9) as [number, number][];
  const inner = BELL_WALL.slice(9) as [number, number][];
  const outerAt = (v: number) => {
    for (let i = 1; i < outer.length; i++) {
      const [r0, v0] = outer[i - 1];
      const [r1, v1] = outer[i];
      if (v <= v1) return r0 + ((r1 - r0) * (v - v0)) / (v1 - v0 || 1);
    }
    return outer[outer.length - 1][0];
  };
  const thinned = inner.map(([r, v]): [number, number] => [Math.min(r, outerAt(v) - t), v]);
  const throat = thinned[thinned.length - 1][1];
  // Down the inside to the throat, across to the axis, up the axis: the chamber is solid.
  return [...outer, ...thinned, [0, throat], [0, outer[0][1]]];
}

export function buildBell(index: number, dx = 0): void {
  const model = corvetteModel();
  const bell: Object3D | undefined = model.root.getObjectByName(`drive_bell_${index}`);
  if (!bell) throw new Error(`No drive_bell_${index}`);
  model.root.updateMatrixWorld(true);
  const scale = new Vector3().setFromMatrixScale(bell.matrixWorld).x;
  const lip = BELL_WALL[8][1];
  // The bell's frame (+Y aft) to the print, mouth down: aft becomes down and
  // the lip sits on the bed.
  const frame = new Matrix4()
    .makeTranslation(dx, 0, lip * scale * S)
    .multiply(new Matrix4().makeScale(scale * S, scale * S, scale * S))
    .multiply(new Matrix4().makeRotationX(-Math.PI / 2));
  // The hat bands aft of the plate's face (0.09 behind where the bell hangs);
  // the mount ring ahead of it sits in the plate, where the plug goes.
  const bands = placedSolids(bell).filter(
    (p) => p.spec.kind === "torus" && new Matrix4().fromArray(p.matrix).elements[13] > 0.09 / scale
  );
  const wall: PlacedSolid = {
    spec: { kind: "lathe", profile: printedProfile(scale) },
    matrix: new Matrix4().toArray(),
    material: "dark",
    path: [bell.name, "printed wall"],
    bounds: [
      [-0.5, -0.2, -0.5],
      [0.5, 1.3, 0.5],
    ],
  };
  const solids = [wall, ...bands]
    .map((p) => placeSolid(p, frame, { min: FDM.minFeature, grow: FDM.join }))
    .filter((s): s is Solid => s !== null);
  if (solids.length > 1) fuse(...solids);
}
