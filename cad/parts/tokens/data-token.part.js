import { part } from "fluidcad/core";
import { buildDataToken } from "../../pieces/markers/data.ts";

export const piece = part("Data token", () => buildDataToken());
