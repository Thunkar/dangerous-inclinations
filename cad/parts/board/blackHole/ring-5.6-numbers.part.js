import { part } from "fluidcad/core";
import { buildNumbers } from "../../../pieces/well.ts";

export const piece = part("Ring 5.6 numbers", () => buildNumbers("blackHole", 4, 5));
