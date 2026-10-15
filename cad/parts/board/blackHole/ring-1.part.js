import { part } from "fluidcad/core";
import { buildRing } from "../../../pieces/well.ts";

export const piece = part("Ring 1", () => buildRing("blackHole", 0, 0));
