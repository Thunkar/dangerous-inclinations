/**
 * Ship loadout: validation and subsystem instantiation.
 * Ships have one forward slot and four side slots; every slot must be filled.
 */
import type { Subsystem, SubsystemType, SlotGroup } from "../models/subsystems.ts";
import { DEFAULT_RULES } from "../models/rules.ts";
import type { RuleSet } from "../models/rules.ts";
import {
  SUBSYSTEM_CONFIGS,
  FIXED_SUBSYSTEM_TYPES,
  FORWARD_SLOT_COUNT,
  SIDE_SLOT_COUNT,
  getSubsystemConfig,
  getMaxPerShip,
  getMissileStats,
  slotSubsystemId,
} from "../models/subsystems.ts";
import type { ShipLoadout, LoadoutValidation } from "../models/game.ts";
import { DEFAULT_DISSIPATION_CAPACITY, STARTING_REACTION_MASS } from "../models/game.ts";

const byGroup = (predicate: (slotType: string) => boolean): SubsystemType[] =>
  (Object.keys(SUBSYSTEM_CONFIGS) as SubsystemType[]).filter((t) =>
    predicate(SUBSYSTEM_CONFIGS[t].slotType)
  );

export const FORWARD_SLOT_SUBSYSTEMS: SubsystemType[] = byGroup((s) => s === "forward");
export const SIDE_SLOT_SUBSYSTEMS: SubsystemType[] = byGroup((s) => s === "side");
export const EITHER_SLOT_SUBSYSTEMS: SubsystemType[] = byGroup((s) => s === "either");
export const INSTALLABLE_SUBSYSTEMS: SubsystemType[] = byGroup((s) => s !== "fixed");

export function canInstallInSlot(type: SubsystemType, group: SlotGroup): boolean {
  const slotType = getSubsystemConfig(type).slotType;
  return slotType === group || slotType === "either";
}

export function validateLoadout(
  loadout: ShipLoadout,
  rules: RuleSet = DEFAULT_RULES
): LoadoutValidation {
  const errors: string[] = [];
  if (!Array.isArray(loadout?.forwardSlots) || loadout.forwardSlots.length !== FORWARD_SLOT_COUNT) {
    return {
      valid: false,
      errors: [`Loadout must have exactly ${FORWARD_SLOT_COUNT} forward slot`],
    };
  }
  if (!Array.isArray(loadout.sideSlots) || loadout.sideSlots.length !== SIDE_SLOT_COUNT) {
    return { valid: false, errors: [`Loadout must have exactly ${SIDE_SLOT_COUNT} side slots`] };
  }
  const check = (slots: ReadonlyArray<SubsystemType | null>, group: SlotGroup, label: string) => {
    slots.forEach((type, i) => {
      if (type === null) {
        errors.push(`${label} slot ${i + 1}: must be filled`);
      } else if (!canInstallInSlot(type, group)) {
        errors.push(
          `${label} slot ${i + 1}: ${getSubsystemConfig(type).name} cannot be installed in a ${group} slot`
        );
      }
    });
  };
  check(loadout.forwardSlots, "forward", "Forward");
  check(loadout.sideSlots, "side", "Side");

  // Repeats are allowed unless the tileLimits knob is on (at most maxPerShip of each type).
  const counts = new Map<SubsystemType, number>();
  if (!rules.tileLimits) return { valid: errors.length === 0, errors };
  for (const type of [...loadout.forwardSlots, ...loadout.sideSlots]) {
    if (type !== null) counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  for (const [type, n] of counts) {
    const max = getMaxPerShip(type);
    if (n > max)
      errors.push(`${getSubsystemConfig(type).name}: only ${max} per ship (loadout has ${n})`);
  }
  return { valid: errors.length === 0, errors };
}

function createSubsystemInstance(
  type: SubsystemType,
  slot?: { group: SlotGroup; index: number }
): Subsystem {
  const subsystem: Subsystem = {
    id: slot ? slotSubsystemId(slot.group, slot.index) : type,
    type,
    allocatedEnergy: 0,
    isPowered: false,
    usedThisTurn: false,
    isBroken: false,
    isRevealed: slot === undefined, // fixed systems are always known
    ...(slot && { slotGroup: slot.group, slotIndex: slot.index }),
  };
  if (type === "missiles") subsystem.ammo = getMissileStats().maxAmmo;
  return subsystem;
}

/** Fixed systems first, then forward slots, then side slots. */
export function createSubsystemsFromLoadout(loadout: ShipLoadout): Subsystem[] {
  const subsystems: Subsystem[] = FIXED_SUBSYSTEM_TYPES.map((t) => createSubsystemInstance(t));
  loadout.forwardSlots.forEach((type, i) => {
    if (type !== null)
      subsystems.push(createSubsystemInstance(type, { group: "forward", index: i }));
  });
  loadout.sideSlots.forEach((type, i) => {
    if (type !== null) subsystems.push(createSubsystemInstance(type, { group: "side", index: i }));
  });
  return subsystems;
}

/** Starting stats implied by a loadout (for the loadout screen). */
export function calculateShipStatsFromLoadout(loadout: ShipLoadout): {
  dissipationCapacity: number;
  reactionMass: number;
} {
  let dissipationCapacity = DEFAULT_DISSIPATION_CAPACITY;
  let reactionMass = STARTING_REACTION_MASS;
  for (const type of [...loadout.forwardSlots, ...loadout.sideSlots]) {
    if (type === null) continue;
    const effect = getSubsystemConfig(type).passiveEffect;
    dissipationCapacity += effect?.dissipationBonus ?? 0;
    reactionMass += effect?.reactionMassBonus ?? 0;
  }
  return { dissipationCapacity, reactionMass };
}

export function countSubsystemInLoadout(loadout: ShipLoadout, type: SubsystemType): number {
  return [...loadout.forwardSlots, ...loadout.sideSlots].filter((t) => t === type).length;
}

export function hasSubsystemInLoadout(loadout: ShipLoadout, type: SubsystemType): boolean {
  if (getSubsystemConfig(type).slotType === "fixed") return true;
  return countSubsystemInLoadout(loadout, type) > 0;
}
