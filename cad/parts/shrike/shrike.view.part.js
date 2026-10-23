import { part } from "fluidcad/core";
import { showOnBase } from "../../pieces/views.ts";

// The base with the shrike on its stand, to judge the fit; viewer only.
export const view = part("shrike on the base", () => showOnBase("shrike"));
