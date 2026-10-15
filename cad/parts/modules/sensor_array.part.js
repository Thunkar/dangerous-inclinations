import { part } from "fluidcad/core";
import { buildModule, screwFor } from "../../pieces/module.ts";

export const module = part(`sensor_array (M2 screw up to ${screwFor("sensor_array")} mm)`, () => buildModule("sensor_array"));
