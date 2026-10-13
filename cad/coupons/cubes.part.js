// The cube test piece: square pockets 0.2, 0.4, 0.6 and 0.8 mm larger than
// the energy and heat cubes (8.1 mm), left to right (one to four notches).
// The one a cube drops into and lifts out of cleanly goes into spec.ts as
// CUBE.pocket.
import { part, subtract } from "fluidcad/core";
import { CUBE } from "../spec.ts";
import { block } from "../lib/solids.js";

const SIDES = [0.2, 0.4, 0.6, 0.8].map((gap) => CUBE.size + gap);
const HEIGHT = CUBE.pocketDepth + 1.5;
/** Room along one edge for the notches that number the pockets. */
const LABEL = 2.4;
const WIDTH = CUBE.size + 0.8 + 2 * CUBE.wall + LABEL;

export const cubes = part("Cube pockets", () => {
  const length = SIDES.reduce((sum, side) => sum + side + CUBE.wall, CUBE.wall);
  let plate = block([0, 0, 0], [length, WIDTH, HEIGHT]);
  let x0 = CUBE.wall;
  SIDES.forEach((side, i) => {
    const cx = x0 + side / 2;
    const cy = LABEL + CUBE.wall + (CUBE.size + 0.8) / 2;
    const pocket = block(
      [cx - side / 2, cy - side / 2, HEIGHT - CUBE.pocketDepth],
      [cx + side / 2, cy + side / 2, HEIGHT + 1]
    );
    plate = subtract(plate, pocket);
    for (let k = 0; k <= i; k++) {
      const x = cx - 2.25 + k * 1.5;
      plate = subtract(plate, block([x, 0.6, HEIGHT - 0.4], [x + 0.8, 1.6, HEIGHT + 1]));
    }
    x0 += side + CUBE.wall;
  });
});
