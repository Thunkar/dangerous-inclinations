import { part } from "fluidcad/core";
import { buildMarkerDepth } from "../pieces/markers/depth.ts";

export const coupon = part("Marker depth: 0.4, 0.6, 0.8, 1.0 mm (one to four notches)", buildMarkerDepth);
