import { part } from "fluidcad/core";
import { buildLane } from "../../../pieces/well.ts";

export const piece = part("Lane 12-15 in from Beta", () => buildLane("blackHole", 3));
