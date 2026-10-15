import { part } from "fluidcad/core";
import { buildNumbers } from "../../../pieces/well.ts";

export const piece = part("Ring 4.5 numbers", () => buildNumbers("planet", 3, 4));
