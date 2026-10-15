import { part } from "fluidcad/core";
import { buildNumbers } from "../../../pieces/well.ts";

export const piece = part("Ring 3.1 numbers", () => buildNumbers("planet", 2, 0));
