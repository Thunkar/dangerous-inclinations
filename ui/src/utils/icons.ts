/**
 * How a subsystem is coloured. The glyph itself is in `art/glyphs.tsx` and is
 * always one flat silhouette; colour never comes from the mark. A tile's
 * category shows as a thin edge or a small badge instead.
 */
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { getSubsystemConfig } from '@dangerous-inclinations/engine'
import { TABLE } from '../theme'

export type SubsystemCategory = 'weapon' | 'defence' | 'passive' | 'utility'

export function subsystemCategory(type: SubsystemType): SubsystemCategory {
  const config = getSubsystemConfig(type)
  if (config.weaponStats) return 'weapon'
  if (type === 'shields') return 'defence'
  if (config.isPassive) return 'passive'
  return 'utility'
}

/** Category colours are for edges and badges only, never for the glyph. */
export const CATEGORY_COLOR: Record<SubsystemCategory, string> = {
  weapon: '#ff9a63',
  defence: TABLE.energy,
  passive: TABLE.hull,
  utility: TABLE.fuel,
}

export function subsystemCategoryColor(type: SubsystemType): string {
  return CATEGORY_COLOR[subsystemCategory(type)]
}
