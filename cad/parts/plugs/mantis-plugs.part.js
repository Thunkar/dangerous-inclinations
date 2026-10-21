import { part } from "fluidcad/core";
import { buildPlugs, plugNames } from "../../pieces/hull.ts";

export const plugs = part(`Mantis plugs (${plugNames("mantis")})`, () => buildPlugs("mantis"));
