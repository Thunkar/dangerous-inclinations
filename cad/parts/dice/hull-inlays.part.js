import { part } from "fluidcad/core";
import { buildInlaySet } from "../../pieces/dice/stand.ts";

export const piece = part("Hull die inlays: numbers 1-10 and the stand's icon (print 1 a player, red)", () => buildInlaySet("hull"));
