import { part } from "fluidcad/core";
import { buildHalf } from "../../pieces/dice/d10.ts";

export const piece = part("D10 even pole (2 4 6 8 10), cut face down", () => buildHalf(false));
