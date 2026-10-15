import { part } from "fluidcad/core";
import { buildNumbers } from "../../../pieces/well.ts";

export const piece = part("Ring 2 numbers", () => buildNumbers("planet", 1, 0));
