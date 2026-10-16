import { part } from "fluidcad/core";
import { buildRing } from "../../../pieces/well.ts";

export const piece = part("Ring 4.6 (print 1)", () => buildRing("blackHole", 3, 5));
