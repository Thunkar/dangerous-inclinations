import { part } from "fluidcad/core";
import { showBay } from "../pieces/bay.ts";

// The bay closed with the tallest module in it; viewer only.
export const view = part("bay, closed", () => showBay(0, "railgun"));
