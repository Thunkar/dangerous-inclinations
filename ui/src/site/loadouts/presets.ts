/**
 * What the loadout cards know about the presets that the engine does not:
 * the subsystem each preset is known by, drawn in its insignia. Design data,
 * not rules: the presets' slots, the primary a role is for and the
 * secondaries that ask for them are the engine's (`BOT_PRESET_LOADOUTS`,
 * `ROLE_PRIMARY`, `presetSecondaries`).
 */
import { MISSION_FAMILY, ROLE_PRIMARY } from '@dangerous-inclinations/engine'
import type { BotPresetId, BotRole, SubsystemType } from '@dangerous-inclinations/engine'
import { FAMILY_INK } from '../../design/press'

/** The subsystem each preset is known by, drawn in its insignia. */
export const SIGNATURE: Record<BotPresetId, SubsystemType> = {
  gunship: 'railgun',
  lancer: 'plasma_cannon',
  corsair: 'missiles',
  warden: 'disruptor',
  raider: 'sensor_array',
  watcher: 'shields',
  picket: 'missiles',
  sentry: 'ballistic_rack',
  freighter: 'fuel_compressor',
  convoy: 'ballistic_rack',
  smuggler: 'missiles',
  ghost: 'disruptor',
}

/** A role's ink: its primary's family, as the mission card prints it. */
export function roleInk(role: BotRole): string {
  return FAMILY_INK[MISSION_FAMILY[ROLE_PRIMARY[role]]]
}
