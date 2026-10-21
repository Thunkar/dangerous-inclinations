import { part } from "fluidcad/core";
import { buildHull, plugNames } from "../pieces/hull.ts";

export const shrike = part(`Shrike (magnets in from below, then glue in its plugs: ${plugNames("shrike")})`, () =>
  buildHull("shrike")
);
