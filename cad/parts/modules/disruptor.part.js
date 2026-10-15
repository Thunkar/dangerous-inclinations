import { part } from "fluidcad/core";
import { buildModule, screwFor } from "../../pieces/module.ts";

export const module = part(`disruptor (M2 screw up to ${screwFor("disruptor")} mm)`, () => buildModule("disruptor"));
