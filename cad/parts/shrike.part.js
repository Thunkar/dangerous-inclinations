import { part } from "fluidcad/core";
import { buildHull, pausesOf } from "../pieces/hull.ts";

export const shrike = part(`Shrike (pause before Z ${pausesOf("shrike").join(", ")})`, () =>
  buildHull("shrike")
);
