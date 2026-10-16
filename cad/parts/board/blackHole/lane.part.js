import { part } from "fluidcad/core";
import { buildLane } from "../../../pieces/well.ts";

export const piece = part("Lane marker (print 6)", () => buildLane("blackHole", 0));
