import { part } from "fluidcad/core";
import { buildRing } from "../../../pieces/well.ts";

export const piece = part("Ring 4.3 (print 3)", () => buildRing("planet", 3, 2));
