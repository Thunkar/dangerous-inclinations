import { part } from "fluidcad/core";
import { buildRing } from "../../../pieces/well.ts";

export const piece = part("Ring 5.5 (print 1)", () => buildRing("blackHole", 4, 4));
