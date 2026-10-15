import { part } from "fluidcad/core";
import { buildTrack } from "../../pieces/slider.ts";

export const track = part("Hull track", () => buildTrack("damage"));
