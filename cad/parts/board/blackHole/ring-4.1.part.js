import { part } from "fluidcad/core";
import { buildRing } from "../../../pieces/well.ts";

export const piece = part("Ring 4.1 (print 1)", () => buildRing("blackHole", 3, 0));
