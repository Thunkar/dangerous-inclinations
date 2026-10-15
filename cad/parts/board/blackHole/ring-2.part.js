import { part } from "fluidcad/core";
import { buildRing } from "../../../pieces/well.ts";

export const piece = part("Ring 2", () => buildRing("blackHole", 1, 0));
