import { part } from "fluidcad/core";
import { buildTrack, buildSlider } from "../pieces/slider.ts";

export const track = part("Slider track", buildTrack);
export const slider = part("Slider", buildSlider);
