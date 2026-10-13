import { part } from "fluidcad/core";
import { buildBell } from "../../pieces/bells.ts";

export const bell = part("mantis bell 1", () => buildBell("mantis", 1));
