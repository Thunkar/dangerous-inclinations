import { part } from "fluidcad/core";
import { buildLane } from "../../../pieces/well.ts";

export const piece = part("Lane 4-7 arrivals", () => buildLane("planet", 0));
