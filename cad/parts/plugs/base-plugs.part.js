import { part } from "fluidcad/core";
import { buildBasePlugs, basePlugs } from "../../pieces/base.ts";

export const plugs = part(`Base plugs (${basePlugs().length}x ${basePlugs()[0]} mm)`, buildBasePlugs);
