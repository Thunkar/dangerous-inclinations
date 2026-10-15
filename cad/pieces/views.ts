// Viewer-only assemblies: a base with a hull on its stand, to judge the fit.
import type { Hull } from "@dangerous-inclinations/engine";
import { move, turn } from "../lib/solids.ts";
import { buildBase } from "./base.ts";
import { buildBelow, buildHull } from "./hull.ts";
import { buildStand, standOf } from "./stand.ts";

export function showOnBase(hull: Hull): void {
  buildBase();
  buildStand(hull);
  const { bed, at } = standOf(hull);
  move(buildHull(hull), -at, 0, bed);
  // What hangs below the hull prints turned over; turn it back under the hull.
  const below = buildBelow(hull);
  if (below) move(turn(below, "x", 180), -at, 0, bed);
}
