import { part } from "fluidcad/core";
import { buildModule } from "../../pieces/module.ts";

export const module = part("fuel_compressor", () => buildModule("fuel_compressor"));
