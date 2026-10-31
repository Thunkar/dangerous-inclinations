// The board's inlaid numbers (BOARD.number): the size they are set at, their
// outlines, and the pockets that take them. The board's rings and the dice
// both cut their pockets from here, so an inlay printed for one fits the other.
import { BOARD } from "../spec.ts";
import { outlines, glyphOutlines, flatten, grow, area, box, type Contour } from "./glyphs.ts";
import type { Point } from "./solids.ts";

/** The font size at which a "0" stands `number.height` tall. */
let fontSize = 0;
export function numberSize(): number {
  if (!fontSize) {
    const [lo, hi] = box(outlines(BOARD.number.font, "0", 1));
    fontSize = BOARD.number.height / (hi[1] - lo[1]);
  }
  return fontSize;
}

/** A number's outlines at the inlays' size, pen at the origin, baseline on y = 0. */
export function numberContours(label: string): Contour[] {
  return outlines(BOARD.number.font, label, numberSize());
}

/**
 * A number's pockets, glyph by glyph: each outline grown by the inlay's
 * clearance away from the number, in the frame of `numberContours`. One
 * glyph's polygons are one region (its counters as holes, even-odd); cut
 * them one glyph at a time, since a cut by several solids that do not touch
 * cuts nothing.
 */
export function numberPockets(label: string): Point[][][] {
  return glyphOutlines(BOARD.number.font, label, numberSize()).map((glyph) => {
    const flat = glyph.map((c) => flatten(c));
    // The outline with the most area is the glyph's outside: the material
    // lies to one side of it, the same side of every contour in the font.
    const outside = flat.reduce((a, b) => (Math.abs(area(b)) > Math.abs(area(a)) ? b : a));
    const away = area(outside) < 0 ? 1 : -1;
    return flat.map((poly) => grow(poly, BOARD.number.clearance, away));
  });
}
