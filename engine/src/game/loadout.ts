/**
 * Ship loadout: validation and subsystem instantiation.
 * Ships have one forward slot and four side slots; every slot must be filled.
 */
import type { Subsystem, SubsystemType, SlotGroup } from "../models/subsystems.ts";
import {
  SUBSYSTEM_CONFIGS,
  FIXED_SUBSYSTEM_TYPES,
  FORWARD_SLOT_COUNT,
  SIDE_SLOT_COUNT,
  getSubsystemConfig,
  getMissileStats,
  slotSubsystemId,
} from "../models/subsystems.ts";
import type { ShipLoadout, LoadoutValidation } from "../models/game.ts";
import { DEFAULT_DISSIPATION_CAPACITY, STARTING_REACTION_MASS } from "../models/game.ts";
import type { MissionRequirement, MissionType } from "../models/missions.ts";
import { missionRequirements } from "../models/missions.ts";

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

export function validateLoadout(loadout: ShipLoadout): LoadoutValidation {
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
  // Repeats are allowed: any tile may fill any slot it fits.
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
  for (const type of [...loadout.forwardSlots, ...loadout.sideSlots]) {
    if (type === null) continue;
    dissipationCapacity += getSubsystemConfig(type).passiveEffect?.dissipationBonus ?? 0;
  }
  return { dissipationCapacity, reactionMass: STARTING_REACTION_MASS };
}

export function countSubsystemInLoadout(loadout: ShipLoadout, type: SubsystemType): number {
  return [...loadout.forwardSlots, ...loadout.sideSlots].filter((t) => t === type).length;
}

export function hasSubsystemInLoadout(loadout: ShipLoadout, type: SubsystemType): boolean {
  if (getSubsystemConfig(type).slotType === "fixed") return true;
  return countSubsystemInLoadout(loadout, type) > 0;
}

/** Tiles from a requirement that this mat actually carries; any one satisfies it. */
export function fittedForRequirement(
  loadout: ShipLoadout,
  requirement: MissionRequirement
): SubsystemType[] {
  return requirement.anyOf.filter((type) => hasSubsystemInLoadout(loadout, type));
}

/** A requirement of one card, checked against the mat being fitted. */
export interface MissionRequirementStatus {
  requirement: MissionRequirement;
  /** The tiles aboard that satisfy it, in requirement order. Empty when unmet. */
  fitted: SubsystemType[];
  met: boolean;
}

/** Every requirement of a card against a mat, met or not (for the loadout screen). */
export function missionRequirementStatus(
  type: MissionType,
  loadout: ShipLoadout
): MissionRequirementStatus[] {
  return missionRequirements(type).map((requirement) => {
    const fitted = fittedForRequirement(loadout, requirement);
    return { requirement, fitted, met: fitted.length > 0 };
  });
}

/** A kept card and the requirements its hull does not meet. */
export interface MissionLoadoutGap<M> {
  mission: M;
  missing: MissionRequirement[];
}

/**
 * Cards in `missions` that this mat could never complete, each with the
 * requirements it fails (MISSION_REQUIREMENTS). Empty means the hand and the
 * hull agree. The referee calls this before accepting a loadout and the
 * loadout screen calls it on every change, so a player sees the clash while
 * choosing rather than being refused at the end.
 */
export function missionsMissingRequirements<M extends { type: MissionType }>(
  missions: ReadonlyArray<M>,
  loadout: ShipLoadout
): Array<MissionLoadoutGap<M>> {
  const gaps: Array<MissionLoadoutGap<M>> = [];
  for (const mission of missions) {
    const missing = missionRequirements(mission.type).filter(
      (requirement) => fittedForRequirement(loadout, requirement).length === 0
    );
    if (missing.length > 0) gaps.push({ mission, missing });
  }
  return gaps;
}
