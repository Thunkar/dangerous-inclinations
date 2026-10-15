import { part } from "fluidcad/core";
import { buildModule, screwFor } from "../../pieces/module.ts";

export const module = part(`plasma_cannon (M2 screw up to ${screwFor("plasma_cannon")} mm)`, () => buildModule("plasma_cannon"));
