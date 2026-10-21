import { part } from "fluidcad/core";
import { buildPlugs, plugNames } from "../../pieces/hull.ts";

export const plugs = part(`Shrike plugs (${plugNames("shrike")})`, () => buildPlugs("shrike"));
