import type { ShipLoadout } from '../../models/game'
import { isDestroyShipMission, isDeliverCargoMission } from '../../models/missions'
import type { Mission } from '../../models/missions'

/**
 * Predefined loadout templates for bot ships.
 * Note: scoop is now a fixed subsystem (always present, no slot needed).
 * Ships have 1 forward slot and 4 side slots.
 *
 * | Template   | Forward    | Side                                      | When                    |
 * |------------|------------|-------------------------------------------|-------------------------|
 * | Combat     | railgun    | laser, laser, shields, missiles           | Destroy mission primary |
 * | Cargo      | sensor_array | shields, radiator, fuel_compressor, laser | Cargo missions primary  |
 * | Balanced   | railgun    | laser, sensor_array, shields, missiles    | Default                 |
 * | Aggressive | railgun    | laser, ballistic_rack, shields, missiles  | Close destroy target    |
 */

export const BOT_LOADOUT_TEMPLATES: Record<string, ShipLoadout> = {
  combat: {
    forwardSlots: ['railgun'],
    sideSlots: ['laser', 'laser', 'shields', 'missiles'],
  },
  cargo: {
    forwardSlots: ['sensor_array'],
    sideSlots: ['shields', 'radiator', 'fuel_compressor', 'laser'],
  },
  balanced: {
    forwardSlots: ['sensor_array'],
    sideSlots: ['laser', 'laser', 'shields', 'missiles'],
  },
  aggressive: {
    forwardSlots: ['railgun'],
    sideSlots: ['laser', 'ballistic_rack', 'shields', 'missiles'],
  },
}

/**
 * Select a bot loadout based on the bot's assigned missions.
 *
 * Strategy:
 * - Count destroy vs cargo missions
 * - If mostly destroy → combat or aggressive
 * - If mostly cargo → cargo
 * - If mixed → balanced
 */
export function selectBotLoadout(missions: Mission[]): ShipLoadout {
  const incompleteMissions = missions.filter(m => !m.isCompleted)

  if (incompleteMissions.length === 0) {
    return BOT_LOADOUT_TEMPLATES.balanced
  }

  const destroyCount = incompleteMissions.filter(isDestroyShipMission).length
  const cargoCount = incompleteMissions.filter(isDeliverCargoMission).length
  const total = incompleteMissions.length

  // All destroy missions → aggressive
  if (destroyCount === total && destroyCount >= 2) {
    return BOT_LOADOUT_TEMPLATES.aggressive
  }

  // Majority destroy → combat
  if (destroyCount > cargoCount) {
    return BOT_LOADOUT_TEMPLATES.combat
  }

  // Majority cargo → cargo
  if (cargoCount > destroyCount) {
    return BOT_LOADOUT_TEMPLATES.cargo
  }

  // Equal or mixed → balanced
  return BOT_LOADOUT_TEMPLATES.balanced
}
