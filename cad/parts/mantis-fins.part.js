import { part } from "fluidcad/core";
import { buildBelow } from "../pieces/hull.ts";

export const fins = part("Mantis arm fins (glue under the arms)", () => buildBelow("mantis"));
