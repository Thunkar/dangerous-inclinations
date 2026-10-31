import { part } from "fluidcad/core";
import { buildSalvo } from "../../pieces/salvo.ts";

export const piece = part("Salvo of 3 (print 3 a player, in their colour)", () => buildSalvo(3));
