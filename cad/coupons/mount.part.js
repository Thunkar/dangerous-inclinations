import { part } from "fluidcad/core";
import { buildStub, PAUSE_BEFORE } from "../pieces/mountStub.ts";

export const stub = part(`Mount stub (pause before Z ${PAUSE_BEFORE})`, buildStub);
