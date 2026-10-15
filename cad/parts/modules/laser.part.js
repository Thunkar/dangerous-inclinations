import { part } from "fluidcad/core";
import { buildModule, screwFor } from "../../pieces/module.ts";

export const module = part(`laser (M2 screw up to ${screwFor("laser")} mm)`, () => buildModule("laser"));
