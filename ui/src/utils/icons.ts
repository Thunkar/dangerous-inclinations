/**
 * Subsystem icons.
 *
 * The PNGs in /assets/icons come from several sources and are not consistent:
 * some are dark on transparent, some light, one is tinted. They all carry an
 * alpha channel, so every icon is flattened to a single silhouette with
 * `brightness(0) invert(1)` and rendered light — one treatment everywhere, on
 * tiles, in the palette, in slots and on the mats.
 *
 * Colour never comes from the icon itself: a tile's category shows as a thin
 * edge or a small badge, never as the glyph's fill.
 */
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { getSubsystemConfig } from '@dangerous-inclinations/engine'
import { TABLE } from '../theme'

export const SUBSYSTEM_ICONS: Record<SubsystemType, string> = {
  engines: '/assets/icons/thrusters.png',
  rotation: '/assets/icons/maneuvering_thrusters.png',
  scoop: '/assets/icons/scoop.png',
  railgun: '/assets/icons/railgun.png',
  sensor_array: '/assets/icons/antenna.png',
  laser: '/assets/icons/laser.png',
  shields: '/assets/icons/shield.png',
  radiator: '/assets/icons/heat.png',
  fuel_compressor: '/assets/icons/fuel.png',
  missiles: '/assets/icons/missile_rack.png',
  ballistic_rack: '/assets/icons/ballistic_rack.png',
}

/** Flatten any source artwork to one light silhouette. */
export const ICON_FILTER = 'brightness(0) invert(1)'

export type SubsystemCategory = 'weapon' | 'defence' | 'passive' | 'utility'

export function subsystemCategory(type: SubsystemType): SubsystemCategory {
  const config = getSubsystemConfig(type)
  if (config.weaponStats) return 'weapon'
  if (type === 'shields') return 'defence'
  if (config.isPassive) return 'passive'
  return 'utility'
}

/** Category colours are for edges and badges only — never for the glyph. */
export const CATEGORY_COLOR: Record<SubsystemCategory, string> = {
  weapon: '#ff9a63',
  defence: TABLE.energy,
  passive: TABLE.hull,
  utility: TABLE.fuel,
}

export const CATEGORY_LABEL: Record<SubsystemCategory, string> = {
  weapon: 'weapon',
  defence: 'defence',
  passive: 'passive',
  utility: 'utility',
}

export function subsystemCategoryColor(type: SubsystemType): string {
  return CATEGORY_COLOR[subsystemCategory(type)]
}
