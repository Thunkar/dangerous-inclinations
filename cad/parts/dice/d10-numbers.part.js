import { part } from "fluidcad/core";
import { buildDieNumbers } from "../../pieces/dice/d10.ts";

export const piece = part("D10 numbers 1-10 (print 2 a player: a set to a die)", () => buildDieNumbers());
