import { part } from "fluidcad/core";
import { buildArm } from "../../../pieces/well.ts";

export const piece = part("Arm (print 6)", () => buildArm("blackHole", 0));
