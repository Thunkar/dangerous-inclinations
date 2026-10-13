import { part } from "fluidcad/core";
import { buildBell } from "../../pieces/bells.ts";

export const bell = part("shrike bell 0", () => buildBell("shrike", 0));
