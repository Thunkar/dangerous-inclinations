/**
 * What the loadout cards know about the presets that the engine does not:
 * the primary a role is for (the card that chooses it, whose family ink the
 * role prints in) and the subsystem each preset is known by, drawn in its
 * insignia. Design data, not rules: the presets' slots and the secondaries
 * that ask for them are the engine's (`BOT_PRESET_LOADOUTS`,
 * `presetSecondaries`).
 */
import { MISSION_FAMILY } from '@dangerous-inclinations/engine'
import type {
  BotPresetId,
  BotRole,
  MissionType,
  SubsystemType,
} from '@dangerous-inclinations/engine'
import { FAMILY_INK } from '../../design/press'

/** The primary each role is for: the card that chooses it. */
export const PRIMARY: Record<BotRole, MissionType> = {
  hunter: 'destroy_ship',
  interceptor: 'intercept_transmission',
  hauler: 'deliver_cargo',
}

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
  return FAMILY_INK[MISSION_FAMILY[PRIMARY[role]]]
}
