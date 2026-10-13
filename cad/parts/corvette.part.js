import { part } from "fluidcad/core";
import { buildCorvette, PAUSE_BEFORE } from "../pieces/corvette.ts";

export const corvette = part(`Corvette (pause before Z ${PAUSE_BEFORE})`, () => buildCorvette());
