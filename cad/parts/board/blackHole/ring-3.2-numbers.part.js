import { part } from "fluidcad/core";
import { buildNumbers } from "../../../pieces/well.ts";

export const piece = part("Ring 3.2 numbers", () => buildNumbers("blackHole", 2, 1));
