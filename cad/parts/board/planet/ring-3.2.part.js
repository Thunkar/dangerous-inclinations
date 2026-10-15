import { part } from "fluidcad/core";
import { buildRing } from "../../../pieces/well.ts";

export const piece = part("Ring 3.2", () => buildRing("planet", 2, 1));
