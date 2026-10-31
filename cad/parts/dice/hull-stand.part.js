import { part } from "fluidcad/core";
import { buildStand } from "../../pieces/dice/stand.ts";

export const piece = part("Hull stand (print 1 a player)", () => buildStand("hull"));
