// The mount test piece: a hull stub printed in one piece, lying as the
// corvette will, with a socket on each long face at the spec's values.
//
// No pause: each magnet slides up its slot from under the stub, on edge, into
// the slot's 45-degree roof, and a plug (`buildStubPlugs`, printed apart)
// is glued in behind it, flush with the bottom.
import { subtract } from "fluidcad/core";
import { MOUNT } from "../spec.ts";
import { block, move, turn } from "../lib/solids.ts";
import { plugTool, seatRise, socketTools } from "../lib/mount.ts";

const LENGTH = 24;
const DEPTH = 14;
const HEIGHT = 16;
/** The magnets' centres. */
const CENTRE = HEIGHT / 2;
/** Each slot's plug: from the bottom to the magnet seated in its roof. */
export const PLUG = +(CENTRE + seatRise() - MOUNT.magnet.diameter / 2 - MOUNT.plugFit.length).toFixed(2);

export function buildStub(): void {
  let body = block([-LENGTH / 2, -DEPTH / 2, 0], [LENGTH / 2, DEPTH / 2, HEIGHT]);
  for (const face of [1, -1]) {
    const { recess, pocket } = socketTools(MOUNT, -(CENTRE + 1));
    for (const tool of [recess, pocket]) {
      // Mount frame to the stub: outboard to +-y, dorsal (away from the
      // slot's open end) to +z. On the +y face that takes a half turn about
      // the outboard axis too, which the foot's symmetry does not show.
      const turned = face > 0 ? turn(turn(tool, "x", -90), "y", 180) : turn(tool, "x", 90);
      body = subtract(body, move(turned, 0, (face * DEPTH) / 2, CENTRE));
    }
  }
}

/** The stub's two plugs, lying side by side. */
export function buildStubPlugs(): void {
  for (const i of [0, 1]) move(plugTool(MOUNT, PLUG), 0, i * 10, 0);
}
