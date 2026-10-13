import { part } from "fluidcad/core";
import { buildBell } from "../../pieces/bells.ts";

export const bell = part("mantis bell 3", () => buildBell("mantis", 3));
