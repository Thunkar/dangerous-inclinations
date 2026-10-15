import { part } from "fluidcad/core";
import { buildModule, screwFor } from "../../pieces/module.ts";

export const module = part(`ballistic_rack (M2 screw up to ${screwFor("ballistic_rack")} mm)`, () => buildModule("ballistic_rack"));
