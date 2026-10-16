import { part } from "fluidcad/core";
import { buildToken } from "../../pieces/token.ts";

export const piece = part("Ship token", () => buildToken());
