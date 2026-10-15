import { part } from "fluidcad/core";
import { buildSlider } from "../../pieces/slider.ts";

// One for each track.
export const slider = part("Slider", buildSlider);
