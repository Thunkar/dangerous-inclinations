/**
 * Which drawing belongs to which tile.
 *
 * The artwork predates the rules and is named after what it depicts; the
 * engine names tiles after what they do. This is the map between them, kept
 * apart from the components so `glyphs.tsx` exports nothing but components.
 */
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { TRACED_PATHS } from './paths'

export type IconName = keyof typeof TRACED_PATHS

export const SUBSYSTEM_ICON: Record<SubsystemType, IconName> = {
  engines: 'thrusters',
  rotation: 'maneuvering_thrusters',
  scoop: 'scoop',
  railgun: 'railgun',
  sensor_array: 'antenna',
  laser: 'laser',
  shields: 'shield',
  radiator: 'heat',
  fuel_compressor: 'fuel',
  missiles: 'missile_rack',
  ballistic_rack: 'ballistic_rack',
}
