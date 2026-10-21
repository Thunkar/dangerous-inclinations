import { part } from "fluidcad/core";
import { showBay } from "../pieces/bay.ts";

// The bay with its door half open; viewer only.
export const view = part("bay, door half open", () => showBay(45, "railgun"));
