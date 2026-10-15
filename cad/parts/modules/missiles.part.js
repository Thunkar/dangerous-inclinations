import { part } from "fluidcad/core";
import { buildModule, screwFor } from "../../pieces/module.ts";

export const module = part(`missiles (M2 screw up to ${screwFor("missiles")} mm)`, () => buildModule("missiles"));
