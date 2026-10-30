import { part } from "fluidcad/core";
import { buildSaleChip } from "../../pieces/markers/sale.ts";

export const piece = part("Sale chip Gamma", () => buildSaleChip("gamma"));
