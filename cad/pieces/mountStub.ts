// The mount test piece: a hull stub printed in one piece, lying as the
// corvette will, with a socket on each long face at the spec's values.
//
// In PrusaSlicer: add a pause (Insert pause) before the layer named in the
// part's name, drop a magnet into each slot on edge, resume. The layers
// above bridge the slots and seal them.
import { subtract } from "fluidcad/core";
import { MOUNT, FDM } from "../spec.ts";
import { block, move, turn } from "../lib/solids.ts";
import { socketTools } from "../lib/mount.ts";

const LENGTH = 24;
const DEPTH = 14;
const HEIGHT = 16;
/** The magnets' centres, and the pause: the slot tops, on a layer line. */
const CENTRE = HEIGHT / 2;
const PAUSE =
  Math.ceil((CENTRE + (MOUNT.magnet.diameter + MOUNT.magnetClearance) / 2) / FDM.layer) * FDM.layer;
export const PAUSE_BEFORE = +(PAUSE + FDM.layer).toFixed(2);

export function buildStub(): void {
  let body = block([-LENGTH / 2, -DEPTH / 2, 0], [LENGTH / 2, DEPTH / 2, HEIGHT]);
  for (const face of [1, -1]) {
    const { recess, pocket } = socketTools(MOUNT, PAUSE - CENTRE);
    for (const tool of [recess, pocket]) {
      // Mount frame to the stub: outboard to +-y, dorsal (the slot's rise)
      // to +z. On the +y face that takes a half turn about the outboard
      // axis too, which only points the foot's nose aft.
      const turned = face > 0 ? turn(turn(tool, "x", -90), "y", 180) : turn(tool, "x", 90);
      body = subtract(body, move(turned, 0, (face * DEPTH) / 2, CENTRE));
    }
  }
}
