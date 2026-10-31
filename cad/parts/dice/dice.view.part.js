import { part } from "fluidcad/core";
import { showOnStand } from "../../pieces/dice/stand.ts";

// The hull die on its stand at 10, beside the fuel die at 7, their numbers inlaid; viewer only.
export const view = part("Dice on their stands", () => {
  showOnStand("hull", 10, [0, 0]);
  showOnStand("fuel", 7, [0, 34]);
});
