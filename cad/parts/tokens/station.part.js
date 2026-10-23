import { part } from "fluidcad/core";
import { buildStation } from "../../pieces/station.ts";

export const piece = part("Station", () => buildStation());
