import { part } from "fluidcad/core";
import { buildInlaySet } from "../../pieces/dice/stand.ts";

export const piece = part("Fuel die inlays: numbers 1-10, the stand's icon and its 0 (print 1 a player, ochre)", () => buildInlaySet("fuel"));
