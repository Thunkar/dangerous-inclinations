import { part } from "fluidcad/core";
import { buildBody } from "../../../pieces/body.ts";

export const piece = part("Band 2 (print 3)", () => buildBody("band", 2));
