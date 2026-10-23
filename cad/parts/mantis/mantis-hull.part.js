import { part } from "fluidcad/core";
import { buildHull, plugNames } from "../../pieces/hull.ts";

export const mantis = part(`Mantis (magnets in from below, then glue in its plugs: ${plugNames("mantis")})`, () =>
  buildHull("mantis")
);
