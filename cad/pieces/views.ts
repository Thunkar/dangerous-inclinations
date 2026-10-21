// Viewer-only assemblies: a base with a hull on its stand, to judge the fit.
import type { Hull } from "@dangerous-inclinations/engine";
import { move, turn } from "../lib/solids.ts";
import { buildBase } from "./base.ts";
import { HULL_PRINT, buildBelow, buildHull } from "./hull.ts";
import { buildStand, standOf } from "./stand.ts";

export function showOnBase(hull: Hull, doors = 0): void {
  buildBase(doors);
  buildStand(hull);
  const { bed, at, head } = standOf(hull);
  move(buildHull(hull), head - at, 0, bed);
  // What hangs below the hull prints turned over (unless the stand carries it); turn it back under the hull.
  const below = HULL_PRINT[hull].carried ? null : buildBelow(hull);
  if (below) move(turn(below, "x", 180), head - at, 0, bed);
}
