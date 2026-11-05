import { part } from "fluidcad/core";
import { buildBody } from "../../../pieces/body.ts";

export const piece = part("Band 3, lower piece (print 3)", () => buildBody("band", 3, "lower"));
