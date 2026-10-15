import { part } from "fluidcad/core";
import { buildNumbers } from "../../../pieces/well.ts";

export const piece = part("Ring 4.6 numbers", () => buildNumbers("blackHole", 3, 5));
