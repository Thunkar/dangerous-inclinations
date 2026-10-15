import { part } from "fluidcad/core";
import { buildBase, SHIP_BED } from "../pieces/base.ts";
import { buildHull, HULL_PRINT } from "../pieces/hull.ts";
import { move } from "../lib/solids.ts";
import { PRINT } from "../spec.ts";

// The base with the corvette on its stand, to judge the layout; viewer only.
export const base = part("Base", buildBase);
export const ship = part("Corvette on the stand", () =>
  move(buildHull("corvette"), -HULL_PRINT.corvette.stand * PRINT.mmPerUnit, 0, SHIP_BED)
);
