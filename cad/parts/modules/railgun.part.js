import { part } from "fluidcad/core";
import { buildModule, screwFor } from "../../pieces/module.ts";

export const module = part(`railgun (M2 screw up to ${screwFor("railgun")} mm)`, () => buildModule("railgun"));
