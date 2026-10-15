import { part } from "fluidcad/core";
import { buildLane } from "../../../pieces/well.ts";

export const piece = part("Lane 8-11 out to Gamma", () => buildLane("blackHole", 2));
