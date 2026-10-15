import { part } from "fluidcad/core";
import { buildLane } from "../../../pieces/well.ts";

export const piece = part("Lane 16-19 departures", () => buildLane("planet", 1));
