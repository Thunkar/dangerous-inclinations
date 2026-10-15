// The hull and fuel slider, 0 to 10. The slider rides a dovetail in the
// track and goes in at the open end. A tongue cut in its cap presses a ridge
// down onto the track; the push lifts the slider against the dovetail, which
// takes up the play, and at every step the ridge drops into a groove that is
// shallower than the ridge, so the tongue still presses and the slider locks.
//
// Prints as drawn (the slider cap down) with no supports.
import { subtract, fuse, sketch, plane, text, cut } from "fluidcad/core";
import { block, prism, move, turn, section, grow, type Point, type Solid } from "../lib/solids.ts";
import { SLIDER } from "../spec.ts";

const STEPS = SLIDER.steps;
const PITCH = SLIDER.pitch;
/** The pointer at step 0, from the open end. */
const START = 10;
/** The slider's foot: twice as long as it is wide, so it cannot rack. */
const FOOT = 10;
/** Long enough for the foot at step 10, with 2 to spare before the closed end. */
const LENGTH = START + (STEPS - 1) * PITCH + FOOT + 2;
const TOP = 5;
/** The numbers' band (they stand clear of the cap's pointer) and the grooves' side. */
const WIDTH = { label: -11.5, grooves: 8 };
const NUMBERS_AT = -10.8;

/** The track bar's size, for the base it drops into: x from 0, y across, z up. */
export const TRACK_SIZE = { length: LENGTH, y: [WIDTH.label, WIDTH.grooves], height: TOP };

/** The dovetail: 60 degree flanks (a 30 degree overhang prints smooth). */
const FLANK = (60 * Math.PI) / 180;
const DOVETAIL = { top: 2.6, depth: 1.8 };

/** The slider's cap, a finger's width long. */
const CAP = { half: 9, gap: 0.3, thick: 1.8, y0: -3.4 };
/** The tongue: fixed aft, free forward, 1.2 thick, 11 long. */
const TONGUE = { x0: -6, x1: 5, y0: 3.8, thick: 1.2, slot: 0.6 };
/** The ridge's 90 degree tip, near the tongue's free end. */
const RIDGE = { x: 3.8, tip: 0.8, half: 0.8, y: [4.2, 7.6] };
/** A 90 degree V, shallower than the ridge's tip, so the tongue still presses in it. */
const GROOVE = { depth: 0.6, y: [3.4, WIDTH.grooves] };
/** A normal gap c on a flank at FLANK lets the slider rise c / cos(FLANK). */
const lift = (c: number): number => c / Math.cos(FLANK);

/** The channel's section in (y, z), anticlockwise. */
function dovetail(): Point[] {
  const { top, depth } = DOVETAIL;
  const bottom = top + depth / Math.tan(FLANK);
  return [
    [-bottom, TOP - depth],
    [bottom, TOP - depth],
    [top, TOP + 0.01],
    [-top, TOP + 0.01],
  ];
}

/** Cut corner i of a polygon back by d along both its edges. */
function chamfer(points: Point[], i: number, d: number): Point[] {
  const n = points.length;
  const p = points[i];
  const along = (q: Point): Point => {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return [p[0] + ((q[0] - p[0]) * d) / len, p[1] + ((q[1] - p[1]) * d) / len];
  };
  return [
    ...points.slice(0, i),
    along(points[(i - 1 + n) % n]),
    along(points[(i + 1) % n]),
    ...points.slice(i + 1),
  ];
}

export function buildTrack(): void {
  let bar: Solid = block([0, WIDTH.label, 0], [LENGTH, WIDTH.grooves, TOP]);
  bar = subtract(bar, move(section(dovetail(), LENGTH - 2 + 1), -1, 0, 0));
  for (let i = 0; i < STEPS; i++) {
    const x = START + RIDGE.x + i * PITCH;
    const d = GROOVE.depth;
    const groove = section(
      [
        [-d, 0],
        [d, 0],
        [0, -d],
      ],
      GROOVE.y[1] + 1 - GROOVE.y[0]
    );
    // A section is drawn in (y, z) and pulled along x; turn it to run along y.
    bar = subtract(bar, move(turn(groove, "z", 90), x, GROOVE.y[0], TOP));
  }
  sketch(plane("xy", { offset: TOP }), () => {
    for (let i = 0; i < STEPS; i++) {
      text(String(i))
        .at([START + i * PITCH, NUMBERS_AT])
        .size(SLIDER.numberSize)
        .bold()
        .align("center");
    }
  });
  cut(0.6);
}

function slider(clearance: number): { solid: Solid; capTop: number } {
  const reach = SLIDER.engage + lift(clearance);
  // Upright on the track with the pointer at x = 0, then turned cap down.
  let foot = grow(dovetail(), -clearance);
  foot = chamfer(chamfer(foot, 1, 0.5), 0, 0.5);
  const footTop = TOP - clearance;
  const neckHalf = DOVETAIL.top - clearance / Math.sin(FLANK) - 0.1;
  const capBottom = TOP + CAP.gap;
  const capTop = capBottom + CAP.thick;
  let s: Solid = fuse(
    move(section(foot, 2 * FOOT), -FOOT, 0, 0),
    block([-FOOT, -neckHalf, footTop - 0.2], [FOOT, neckHalf, capBottom + 0.1]),
    block([-CAP.half, CAP.y0, capBottom], [CAP.half, WIDTH.grooves, capTop]),
    move(
      prism(
        [
          [-1.6, CAP.y0 + 0.01],
          [0, CAP.y0 - 2],
          [1.6, CAP.y0 + 0.01],
        ],
        CAP.thick
      ),
      0,
      0,
      capBottom
    )
  );
  // The tongue: a slot along its inner side and across its free end, and
  // thinned from below so it bends.
  const t = TONGUE;
  s = subtract(s, block([t.x0, t.y0 - t.slot, capBottom - 1], [t.x1 + t.slot, t.y0, capTop + 1]));
  s = subtract(
    s,
    block([t.x1, t.y0 - t.slot, capBottom - 1], [t.x1 + t.slot, WIDTH.grooves + 1, capTop + 1])
  );
  const under = capTop - t.thick;
  s = subtract(s, block([t.x0, t.y0, capBottom - 1], [t.x1, WIDTH.grooves + 1, under]));
  // The ridge hangs from the tongue to `reach` below the track top.
  const tip = TOP - reach;
  const r = RIDGE;
  const ridge = section(
    [
      [-r.half, under + 0.01],
      [-r.half, tip + r.tip],
      [0, tip],
      [r.half, tip + r.tip],
      [r.half, under + 0.01],
    ],
    r.y[1] - r.y[0]
  );
  s = fuse(s, move(turn(ridge, "z", 90), r.x, r.y[0], 0));
  return { solid: s, capTop };
}

export function buildSlider(): void {
  const { solid, capTop } = slider(SLIDER.clearance);
  move(turn(solid, "x", 180), START, 26, capTop);
}
