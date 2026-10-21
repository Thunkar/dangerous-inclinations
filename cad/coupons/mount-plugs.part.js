import { part } from "fluidcad/core";
import { buildStubPlugs, PLUG } from "../pieces/mountStub.ts";

export const plugs = part(`Mount stub plugs (2x ${PLUG} mm)`, buildStubPlugs);
