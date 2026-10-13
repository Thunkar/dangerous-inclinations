import { part, param } from "fluidcad/core";
import { buildCorvette, PAUSE_BEFORE } from "../pieces/corvette.ts";

export const corvette = part(`Corvette (pause before Z ${PAUSE_BEFORE})`, () =>
  buildCorvette({ keelToBow: param("Keel under the bow", true) })
);
