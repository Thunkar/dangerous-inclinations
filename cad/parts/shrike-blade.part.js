import { part } from "fluidcad/core";
import { buildBelow } from "../pieces/hull.ts";

export const blade = part("Shrike blade (glue under the keel, two pins)", () =>
  buildBelow("shrike")
);
