// A carried item: a neutral token with its kind debossed in the top and the
// loot mark (Piracy's skull) debossed in the bed face, mirrored so it reads
// when the token is turned over; a seized item is flipped to its loot face.
// The bed pocket's roof is a bridge, as wide as the skull's widest part
// (about 8.8 mm), with the sockets and teeth standing in it as pillars. The
// depth of both is MARKER.depth (spec.ts), settled by coupons/marker-depth.
import { MARKER } from "../../spec.ts";
import type { Point, Solid } from "../../lib/solids.ts";
import { chamferedSlab } from "./common.ts";
import { cutGlyph, placed, type GlyphName } from "./glyphs.ts";

/** The loot mark, the same size on every item so the backs read as one kind: its teeth come out 0.61 apart, over FDM.minFeature. */
export const LOOT = { glyph: "piracy" as GlyphName, size: 14 };

export interface Item {
  outline: Point[];
  thickness: number;
  chamfer: number;
  front: GlyphName;
  frontSize: number;
}

export function buildItem(s: Item): Solid {
  const d = MARKER.depth;
  let t = chamferedSlab(s.outline, s.thickness, s.chamfer);
  t = cutGlyph(t, placed(s.front, s.frontSize), s.thickness - d, s.thickness + 1);
  return cutGlyph(t, placed(LOOT.glyph, LOOT.size, [0, 0], { mirror: true }), -1, d);
}
