import { part } from "fluidcad/core";
import { buildHub } from "../../../pieces/well.ts";

export const piece = part("Hub (print 3)", () => buildHub("planet"));
