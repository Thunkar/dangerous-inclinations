import { part } from "fluidcad/core";
import { showOnBase } from "../pieces/views.ts";

// The base with the corvette on its stand, to judge the fit; viewer only.
export const view = part("corvette on the base", () => showOnBase("corvette"));
