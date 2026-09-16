/** Cosmetic match data. Never read by movement, combat, or gameplay RNG. */
import { z } from "zod";

const paint = z.string().regex(/^#[0-9a-f]{6}$/i);
const dial = z.number().finite().min(0).max(1);
export const ShipAppearanceSchema = z
  .object({
    version: z.literal(1),
    paint,
    secondaryPaint: paint,
    livery: z.enum(["panels", "bands", "split"]),
    finish: z.enum(["matte", "metal"]),
    armorRelief: dial,
    spineHeight: dial,
    wear: dial,
  })
  .strict();

export type ShipAppearance = z.infer<typeof ShipAppearanceSchema>;
export const DEFAULT_SHIP_APPEARANCE: Readonly<ShipAppearance> = Object.freeze({
  version: 1,
  paint: "#aab4b2",
  secondaryPaint: "#647776",
  livery: "panels",
  finish: "matte",
  armorRelief: 0.5,
  spineHeight: 0.5,
  wear: 0,
});

/** Older snapshots and unsupported stored versions render as the reference ship. */
export function resolveShipAppearance(value: unknown): ShipAppearance {
  if (value === undefined || value === null) return { ...DEFAULT_SHIP_APPEARANCE };
  const result = ShipAppearanceSchema.safeParse(value);
  return result.success ? result.data : { ...DEFAULT_SHIP_APPEARANCE };
}
