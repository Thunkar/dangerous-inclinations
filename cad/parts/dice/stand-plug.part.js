import { part } from "fluidcad/core";
import { buildPlug } from "../../pieces/dice/stand.ts";

export const piece = part("Stand plug (print 2 a player: one a stand)", () => buildPlug());
