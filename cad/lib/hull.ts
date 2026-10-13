// The game's hull units in the print's frame. The game builds +X bow, +Y
// dorsal, Z across with port at -Z; a hull prints belly down, so the print
// keeps x, takes the game's z as y and the game's y as z, scaled to mm, with
// the keel on the bed at z = 0.
import { sketch, line, loft, plane, fuse, subtract } from "fluidcad/core";
import type { Point, Solid, Vec } from "./solids.ts";
import { CORVETTE } from "../../ui/src/ships/corvetteShape.ts";
import { PRINT } from "../spec.ts";
import { block } from "./solids.ts";

export const S = PRINT.mmPerUnit;
const { relief, keelY } = CORVETTE.armor;
/** The keel plating's underside, in hull units: the bed. */
export const BED = keelY - (0.05 + relief * 0.3);

/** A game point [x, y, z] to the print's [x, y, z] in mm. */
export const at = ([x, y, z]: Vec): Vec => [x * S, z * S, (y - BED) * S];

/**
 * The clipped section of `ui/src/ships/loft.ts` at half height h, half width
 * w, its centre lifted by `lift`, as the print's (y, z) points in mm.
 */
export function clipped(h: number, w: number, lift = 0): Point[] {
  const c = Math.min(h, w) * 0.35;
  return [
    [w - c, h],
    [w, h - c],
    [w, -h + c],
    [w - c, -h],
    [-w + c, -h],
    [-w, -h + c],
    [-w, h - c],
    [-w + c, h],
  ].map(([z, y]): Point => [z * S, (y + lift - BED) * S]);
}

/** A ruled loft through [x, h, w, lift?] stations, aft to fore: `armoredSection` as a solid. */
export type Station = readonly [number, number, number] | readonly [number, number, number, number];

export function armored(stations: readonly Station[]): Solid {
  const profile = ([x, h, w, lift = 0]: Station) =>
    sketch(plane("yz", { offset: x * S }), () => {
      const p = clipped(h, w, lift);
      p.forEach((q, i) => line(q, p[(i + 1) % p.length]));
    });
  const pieces = stations.slice(1).map((s, i) => loft(profile(stations[i]), profile(s)).new());
  return pieces.length > 1 ? fuse(...pieces) : pieces[0];
}

/** Cut away everything below the bed. */
export function onBed(solid: Solid, reach = 200): Solid {
  return subtract(solid, block([-reach, -reach, -reach], [reach, reach, 0]));
}
