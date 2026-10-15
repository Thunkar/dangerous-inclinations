import { part } from "fluidcad/core";
import { showOnBase } from "../pieces/views.ts";

// The base with the mantis on its stand, to judge the fit; viewer only.
export const view = part("mantis on the base", () => showOnBase("mantis"));
