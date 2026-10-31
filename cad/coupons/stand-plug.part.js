import { part } from "fluidcad/core";
import { buildPlugCoupon } from "../pieces/dice/stand.ts";

export const coupon = part("Stand plug fit: 0.1, 0.05, 0, -0.05 mm a side (one to four notches)", buildPlugCoupon);
