import { part } from "fluidcad/core";
import { buildStub, PLUG } from "../pieces/mountStub.ts";

export const stub = part(`Mount stub (magnets in from below, then glue in two ${PLUG} mm plugs)`, buildStub);
