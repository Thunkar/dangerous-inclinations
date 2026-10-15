import { part } from "fluidcad/core";
import { buildArm } from "../../../pieces/well.ts";

export const piece = part("Arm 2", () => buildArm("planet", 1));
