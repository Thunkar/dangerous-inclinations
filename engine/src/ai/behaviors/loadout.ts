import type { ShipLoadout } from '../../models/game.ts'
import { isDestroyShipMission } from '../../models/missions.ts'
import type { Mission } from '../../models/missions.ts'
import { classifyArchetype } from './missions.ts'
import type { BotArchetype } from './missions.ts'

/**
 * Predefined loadout templates for bot ships. Each template targets one of
 * three archetypes the mission selector picks. Ships have 1 forward slot
 * and 4 side slots; the fuel scoop is fixed (always present, doesn't
 * consume a slot).
 *
 * | Template            | Forward      | Side                                            | Archetype                                       |
 * |---------------------|--------------|-------------------------------------------------|-------------------------------------------------|
 * | combat              | railgun      | laser, ballistic_rack, shields, missiles        | destroyer (2 destroy, no intercept)             |
 * | aggressive          | railgun      | laser, ballistic_rack, shields, missiles        | destroyer (3 destroy, all-in)                   |
 * | cargo               | sensor_array | shields, radiator, fuel_compressor, laser       | cargo_trucker                                    |
 * | stealth             | sensor_array | shields, fuel_compressor, missiles, laser       | stealth_interceptor (also fallback)             |
 *
 * `combat` used to carry two lasers, but the engine's `allocate_energy`
 * action targets subsystems by TYPE (not slot index) — see
 * actionProcessors.ts:processAllocateEnergy — so a second laser of the
 * same type can never be powered. We swapped the duplicate slot for
 * `ballistic_rack` (a PDC that intercepts incoming missiles and adds a
 * 1-damage close-range option). Sensor_array can't go here because it's
 * a forward-only subsystem; instead, `classifyArchetype` ensures bots
 * with any intercept mission are routed to the stealth or cargo
 * archetype, both of which include sensor_array.
 */
export const BOT_LOADOUT_TEMPLATES: Record<string, ShipLoadout> = {
  combat: {
    forwardSlots: ['railgun'],
    sideSlots: ['laser', 'ballistic_rack', 'shields', 'missiles'],
  },
  aggressive: {
    forwardSlots: ['railgun'],
    sideSlots: ['laser', 'ballistic_rack', 'shields', 'missiles'],
  },
  cargo: {
    forwardSlots: ['sensor_array'],
    sideSlots: ['shields', 'radiator', 'fuel_compressor', 'laser'],
  },
  stealth: {
    forwardSlots: ['sensor_array'],
    sideSlots: ['shields', 'fuel_compressor', 'missiles', 'laser'],
  },
  // Backward compat alias — older callers expecting "balanced" get the
  // stealth loadout, which is the closest equivalent (sensor + flex).
  balanced: {
    forwardSlots: ['sensor_array'],
    sideSlots: ['shields', 'fuel_compressor', 'missiles', 'laser'],
  },
}

/**
 * Map archetype → loadout. `destroyer` checks whether the bot has 3 destroy
 * missions and goes all-in (aggressive) vs. carrying a backup loadout
 * slot (combat).
 */
function loadoutForArchetype(
  archetype: BotArchetype,
  destroyCount: number,
): ShipLoadout {
  switch (archetype) {
    case 'destroyer':
      return destroyCount >= 3
        ? BOT_LOADOUT_TEMPLATES.aggressive
        : BOT_LOADOUT_TEMPLATES.combat
    case 'cargo_trucker':
      return BOT_LOADOUT_TEMPLATES.cargo
    case 'stealth_interceptor':
      return BOT_LOADOUT_TEMPLATES.stealth
  }
}

/**
 * Select a bot loadout based on the bot's chosen missions.
 *
 * The mission selector classifies the trio into one of three archetypes
 * (destroyer, cargo_trucker, stealth_interceptor); this function maps that
 * classification to the right hardware. With no missions, falls back to
 * the stealth loadout — its sensor + missile + fuel_compressor mix is the
 * least-bad default.
 */
export function selectBotLoadout(missions: Mission[]): ShipLoadout {
  const incomplete = missions.filter(m => !m.isCompleted)
  if (incomplete.length === 0) return BOT_LOADOUT_TEMPLATES.stealth

  const archetype = classifyArchetype(incomplete)
  const destroyCount = incomplete.filter(isDestroyShipMission).length
  return loadoutForArchetype(archetype, destroyCount)
}
