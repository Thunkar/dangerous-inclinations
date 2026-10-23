import { part } from "fluidcad/core";
import { buildWreckToken } from "../../pieces/wreck.ts";

export const piece = part("Wreck token", () => buildWreckToken());
