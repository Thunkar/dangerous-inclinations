import { part } from "fluidcad/core";
import { printStand } from "../../pieces/stand.ts";

export const stand = part("corvette stand", () => printStand("corvette"));
