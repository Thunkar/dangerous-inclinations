import { part } from "fluidcad/core";
import { buildBell } from "../../pieces/bells.ts";

export const bell = part("shrike bell 2", () => buildBell("shrike", 2));
