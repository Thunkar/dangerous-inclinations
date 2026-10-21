import { part } from "fluidcad/core";
import { buildBase, basePlugs } from "../pieces/base.ts";

export const base = part(
  `Base (doors print open in place; magnets in from below, then glue in ${basePlugs().length} plugs of ${basePlugs()[0]} mm)`,
  () => buildBase()
);
