import { part } from "fluidcad/core";
import { buildBell } from "../../pieces/bells.ts";

export const bell = part("corvette bell 1", () => buildBell("corvette", 1));
