import { part } from "fluidcad/core";
import { buildCubes } from "../pieces/cubes.ts";

export const cubes = part("Cube pockets", buildCubes);
