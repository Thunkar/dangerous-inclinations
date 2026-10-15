import { part } from "fluidcad/core";
import { buildModule, screwFor } from "../../pieces/module.ts";

export const module = part(`radiator (M2 screw up to ${screwFor("radiator")} mm)`, () => buildModule("radiator"));
