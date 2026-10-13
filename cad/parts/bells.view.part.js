import { part } from "fluidcad/core";
import { buildBell } from "../pieces/bells.ts";

export const bells = [0, 1, 2].map((i) => part(`Bell ${i}`, () => buildBell(i, i * 16)));
