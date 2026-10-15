import { part } from "fluidcad/core";
import { buildLane } from "../../../pieces/well.ts";

export const piece = part("Lane 20-23 in from Gamma", () => buildLane("blackHole", 5));
