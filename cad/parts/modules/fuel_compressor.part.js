import { part } from "fluidcad/core";
import { buildModule, screwFor } from "../../pieces/module.ts";

export const module = part(`fuel_compressor (M2 screw up to ${screwFor("fuel_compressor")} mm)`, () => buildModule("fuel_compressor"));
