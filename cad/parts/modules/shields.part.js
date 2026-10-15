import { part } from "fluidcad/core";
import { buildModule, screwFor } from "../../pieces/module.ts";

export const module = part(`shields (M2 screw up to ${screwFor("shields")} mm)`, () => buildModule("shields"));
