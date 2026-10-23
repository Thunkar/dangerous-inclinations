import { part } from "fluidcad/core";
import { buildMissileToken } from "../../pieces/missile.ts";

export const piece = part("Missile token", () => buildMissileToken());
