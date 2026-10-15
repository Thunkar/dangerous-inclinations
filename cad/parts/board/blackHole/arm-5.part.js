import { part } from "fluidcad/core";
import { buildArm } from "../../../pieces/well.ts";

export const piece = part("Arm 5", () => buildArm("blackHole", 4));
