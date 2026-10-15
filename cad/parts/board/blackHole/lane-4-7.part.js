import { part } from "fluidcad/core";
import { buildLane } from "../../../pieces/well.ts";

export const piece = part("Lane 4-7 in from Alpha", () => buildLane("blackHole", 1));
