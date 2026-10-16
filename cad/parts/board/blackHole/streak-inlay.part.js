import { part } from "fluidcad/core";
import { buildBody } from "../../../pieces/body.ts";

export const piece = part("Streak inlays (all 6)", () => buildBody("inlays"));
