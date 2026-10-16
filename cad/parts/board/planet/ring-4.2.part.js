import { part } from "fluidcad/core";
import { buildRing } from "../../../pieces/well.ts";

export const piece = part("Ring 4.2 (print 3)", () => buildRing("planet", 3, 1));
