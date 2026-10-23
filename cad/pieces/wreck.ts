// The wreck token: the ship token broken in two along a jagged crack across
// its middle notch, the bow knocked askew about the port end of the break so
// the crack gapes to starboard. The torn faces are square where the token's
// sides are chamfered, and the keel still holds the halves together low down
// across the gap, so it prints and plays as one piece.
import { fuse } from "fluidcad/core";
import { TOKEN, shipPlan, slab, type Plan } from "./token.ts";
import { block, move, turn, type Point, type Solid } from "../lib/solids.ts";

/** The crack, port to starboard, from the middle notch's floor on one side to its floor on the other. */
const CRACK: Point[] = [
  [0.15, 2.25],
  [-0.5, 1.3],
  [0.6, 0.5],
  [-0.3, -0.4],
  [0.5, -1.3],
  [-0.2, -2.25],
];
/** How far the bow turns about the crack's port end, and how far it is pushed back into the stern there. */
const KNOCK = { degrees: 24, back: 0.25 };
/** The keel left across the gap: its height off the bed and its half-width. */
const KEEL = { height: 2, half: 1 };

/** The ship's plan split along the crack: the stern and the bow, each clockwise. */
function halves(): { stern: Plan; bow: Plan } {
  const { pts, chamfered } = shipPlan();
  const n = pts.length;
  // The middle notch's floor is side 6 on port; its mirror, side n - 2 - 6, on starboard.
  const [port, starboard] = [6, n - 2 - 6];
  const crack = CRACK;
  const square = (k: number) => Array(k).fill(false);
  const stern: Plan = {
    pts: [...pts.slice(0, port + 1), ...crack, ...pts.slice(starboard + 1)],
    chamfered: [
      ...chamfered.slice(0, port),
      false,
      ...square(crack.length - 1),
      false,
      ...chamfered.slice(starboard + 1),
    ],
  };
  // From the crack's port end round the nose to its starboard end, then back up the crack.
  const bow: Plan = {
    pts: [...pts.slice(port + 1, starboard + 1), ...[...crack].reverse().slice(0, -1), crack[0]],
    chamfered: [...chamfered.slice(port + 1, starboard), false, ...square(crack.length - 1), false],
  };
  return { stern, bow };
}

export function buildWreckToken(): Solid {
  const { stern, bow } = halves();
  const [t, d] = [TOKEN.thickness, TOKEN.chamfer];
  const [hx, hy] = CRACK[0];
  const knocked = move(turn(move(slab(bow, t, d), -hx, -hy, 0), "z", KNOCK.degrees), hx - KNOCK.back, hy, 0);
  const keel = block([-1.6, -KEEL.half, 0], [1.8, KEEL.half, KEEL.height]);
  return fuse(slab(stern, t, d), knocked, keel);
}
