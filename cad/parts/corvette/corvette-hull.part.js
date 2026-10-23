import { part } from "fluidcad/core";
import { buildHull, plugNames } from "../../pieces/hull.ts";

export const corvette = part(`Corvette (magnets in from below, then glue in its plugs: ${plugNames("corvette")})`, () =>
  buildHull("corvette")
);
