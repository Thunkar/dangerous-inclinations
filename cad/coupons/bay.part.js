import { part } from "fluidcad/core";
import { buildBay, bayPlug } from "../pieces/bay.ts";

export const bay = part(`Bay test, door printed open in place (magnet in from below, then glue in a ${bayPlug()} mm plug)`, buildBay);
