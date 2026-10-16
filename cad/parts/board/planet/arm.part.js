import { part } from "fluidcad/core";
import { buildArm } from "../../../pieces/well.ts";

export const piece = part("Arm (print 18)", () => buildArm("planet", 0));
