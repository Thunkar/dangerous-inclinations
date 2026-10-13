import { part } from "fluidcad/core";
import { buildBell } from "../../pieces/bells.ts";

export const bell = part("corvette bell 2", () => buildBell("corvette", 2));
