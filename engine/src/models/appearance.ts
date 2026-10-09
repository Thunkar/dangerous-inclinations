/** Cosmetic match data. Never read by movement, combat, or gameplay RNG. */
import { z } from "zod";

const paint = z.string().regex(/^#[0-9a-f]{6}$/i);

/**
 * The livery: a pattern sprayed over the hull paint, the way a model is masked
 * and painted. The player picks its shape; its colour is always the seat's,
 * like the ship's token, so a stripe says whose ship it is at a glance. There
 * is no plain hull: every shape carries the seat's colour somewhere it shows.
 */
export const LIVERIES = ["band", "split", "chevron", "stern", "spine"] as const;
export type Livery = (typeof LIVERIES)[number];

/**
 * The hull: the shape built around the same five mounts and the same drive.
 * The corvette is the reference; the shrike stands its side mounts in one
 * column on a tall chassis over a swept blade; the mantis is a U open forward,
 * the bow mount in the gap between two side hulls that carry the flank
 * mounts. Every hull carries the same slots, so the choice is cosmetic and
 * nothing else.
 */
export const HULLS = ["corvette", "shrike", "mantis"] as const;
export type Hull = (typeof HULLS)[number];

export const ShipAppearanceSchema = z
  .object({
    hull: z.enum(HULLS),
    paint,
    secondaryPaint: paint,
    livery: z.enum(LIVERIES),
  })
  .strict();

export type ShipAppearance = z.infer<typeof ShipAppearanceSchema>;
export const DEFAULT_SHIP_APPEARANCE: Readonly<ShipAppearance> = Object.freeze({
  hull: "corvette",
  paint: "#d6cfbd",
  secondaryPaint: "#6b6a66",
  livery: "band",
});

/**
 * A player who has not painted a ship flies the reference corvette. Nothing is
 * repaired or carried forward: an appearance this schema refuses renders as the
 * reference corvette too, because this is called from views and renders that
 * must not throw.
 */
export function resolveShipAppearance(value: unknown): ShipAppearance {
  if (value === undefined || value === null) return { ...DEFAULT_SHIP_APPEARANCE };
  const result = ShipAppearanceSchema.safeParse(value);
  return result.success ? result.data : { ...DEFAULT_SHIP_APPEARANCE };
}
