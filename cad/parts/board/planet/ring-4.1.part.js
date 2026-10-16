import { part } from "fluidcad/core";
import { buildRing } from "../../../pieces/well.ts";

export const piece = part("Ring 4.1 (print 3)", () => buildRing("planet", 3, 0));
