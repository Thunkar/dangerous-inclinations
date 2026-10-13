import { part } from "fluidcad/core";
import { buildBell } from "../../pieces/bells.ts";

export const bell = part("mantis bell 0", () => buildBell("mantis", 0));
