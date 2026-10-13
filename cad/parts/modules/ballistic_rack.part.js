import { part } from "fluidcad/core";
import { buildModule } from "../../pieces/module.ts";

export const module = part("ballistic_rack", () => buildModule("ballistic_rack"));
