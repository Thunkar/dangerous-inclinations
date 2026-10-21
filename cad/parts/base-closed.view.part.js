import { part } from "fluidcad/core";
import { buildBase } from "../pieces/base.ts";

// The base with its doors closed, as it stands at the table; viewer only.
export const base = part("Base, doors closed", () => buildBase(0));
