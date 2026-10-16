import { part } from "fluidcad/core";
import { buildRing } from "../../../pieces/well.ts";

export const piece = part("Ring 3.3 (print 4)", () => buildRing("blackHole", 2, 2));
