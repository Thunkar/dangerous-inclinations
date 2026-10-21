import { part } from "fluidcad/core";
import { buildBayPlug, bayPlug } from "../pieces/bay.ts";

export const plug = part(`Bay test plug (${bayPlug()} mm)`, buildBayPlug);
