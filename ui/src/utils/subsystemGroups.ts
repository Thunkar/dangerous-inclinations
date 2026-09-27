/**
 * The kinds of subsystem, the way a player thinks about them, in one place:
 * the Systems step lists a loadout by them and a tile's edge is coloured by
 * them.
 *
 *   weapon   · fires on your turn and nothing else (railgun, laser, missiles)
 *   defence  · powered to work on other players' turns: shields, and a
 *              ballistic rack, which also fires
 *   sensor   · the sensor array, powered or scanning
 *   passive  · works without energy (radiator, fuel compressor)
 *   utility  · the rest: the fixed engines, thrusters and scoop
 *
 * The glyph itself is in `art/glyphs.tsx` and never carries a colour; the
 * kind shows as a thin edge or a small badge.
 */
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { getSubsystemConfig, isPowerableType } from '@dangerous-inclinations/engine'
import { TABLE } from '../theme'

export type SubsystemGroup = 'weapon' | 'defence' | 'sensor' | 'passive' | 'utility'

export function subsystemGroup(type: SubsystemType): SubsystemGroup {
  if (type === 'sensor_array') return 'sensor'
  if (isPowerableType(type)) return 'defence'
  const config = getSubsystemConfig(type)
  if (config.weaponStats) return 'weapon'
  if (config.isPassive) return 'passive'
  return 'utility'
}

/** Edges and badges only, never the glyph. The sensor keeps the utility ink it always had. */
const GROUP_COLOR: Record<SubsystemGroup, string> = {
  weapon: TABLE.accent,
  defence: TABLE.energy,
  sensor: TABLE.fuel,
  passive: TABLE.inkFaint,
  utility: TABLE.fuel,
}

export function subsystemGroupColor(type: SubsystemType): string {
  return GROUP_COLOR[subsystemGroup(type)]
}
