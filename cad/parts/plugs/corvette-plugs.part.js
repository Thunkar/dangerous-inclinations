import { part } from "fluidcad/core";
import { buildPlugs, plugNames } from "../../pieces/hull.ts";

export const plugs = part(`Corvette plugs (${plugNames("corvette")})`, () => buildPlugs("corvette"));
