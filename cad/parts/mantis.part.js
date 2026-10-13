import { part } from "fluidcad/core";
import { buildHull, pausesOf } from "../pieces/hull.ts";

export const mantis = part(`Mantis (pause before Z ${pausesOf("mantis").join(", ")})`, () =>
  buildHull("mantis")
);
