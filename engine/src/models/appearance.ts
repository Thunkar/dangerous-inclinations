/** Cosmetic match data. Never read by movement, combat, or gameplay RNG. */
import { z } from "zod";

const paint = z.string().regex(/^#[0-9a-f]{6}$/i);
const dial = z.number().finite().min(0).max(1);
export const ShipAppearanceSchema = z
  .object({
    paint,
    secondaryPaint: paint,
    finish: z.enum(["matte", "metal"]),
    armorRelief: dial,
    spineHeight: dial,
  })
  .strict();

export type ShipAppearance = z.infer<typeof ShipAppearanceSchema>;
export const DEFAULT_SHIP_APPEARANCE: Readonly<ShipAppearance> = Object.freeze({
  paint: "#aab4b2",
  secondaryPaint: "#647776",
  finish: "matte",
  armorRelief: 0.5,
  spineHeight: 0.5,
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
