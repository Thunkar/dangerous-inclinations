import { part } from "fluidcad/core";
import { buildEscortMarker } from "../../pieces/markers/escort.ts";

export const piece = part("Escort marker", () => buildEscortMarker());
