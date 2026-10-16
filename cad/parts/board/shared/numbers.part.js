import { part } from "fluidcad/core";
import { buildNumbers } from "../../../pieces/well.ts";

export const piece = part("Numbers 0-23 (print 17: a set to a ring)", () => buildNumbers("blackHole", 0, 0));
