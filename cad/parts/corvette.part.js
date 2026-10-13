import { part } from "fluidcad/core";
import { buildHull, pausesOf } from "../pieces/hull.ts";

export const corvette = part(`Corvette (pause before Z ${pausesOf("corvette").join(", ")})`, () =>
  buildHull("corvette")
);
