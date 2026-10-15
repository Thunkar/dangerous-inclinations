import { part } from "fluidcad/core";
import { buildLane } from "../../../pieces/well.ts";

export const piece = part("Lane 0-3 out to Beta", () => buildLane("blackHole", 0));
