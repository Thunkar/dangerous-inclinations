import { part } from "fluidcad/core";
import { buildHomeMarker } from "../../pieces/markers/home.ts";

export const piece = part("Home marker", () => buildHomeMarker());
