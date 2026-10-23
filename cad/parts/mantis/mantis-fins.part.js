import { part } from "fluidcad/core";
import { buildArmFins } from "../../pieces/hull.ts";

export const fins = part("Mantis arm fins (slide into the arms' slits and glue)", () => buildArmFins("mantis"));
