import { part } from "fluidcad/core";
import { buildKey } from "../../pieces/dice/d10.ts";

export const piece = part("D10 key ring (one a die), flat", () => buildKey());
