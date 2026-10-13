import { part } from "fluidcad/core";
import { buildModule } from "../../pieces/module.ts";

export const module = part("sensor_array", () => buildModule("sensor_array"));
