/**
 * Action validators. Each returns a list of error messages (empty = valid)
 * and never mutates state. Processors call the matching validator on the
 * current state right before applying each action, so range and energy checks
 * see the ship as it is at that point in the sequence.
 */
import type {
  GameState,
  Player,
  PlayerAction,
  AllocateEnergyAction,
  DeallocateEnergyAction,
  RotateAction,
  CoastAction,
  BurnAction,
  FireWeaponAction,
  ScanAction,
  WellTransferAction,
} from "../models/game.ts";
import { isTacticalAction } from "../models/game.ts";
import { getSubsystemConfig, isWeaponType } from "../models/subsystems.ts";
import {
  BURN_COSTS,
  WELL_TRANSFER_COSTS,
  getAdjustmentRange,
  calculateBurnMassCost,
} from "../models/rings.ts";
import { findJump, getMaxRing } from "../models/gravityWells.ts";
import { SCAN_SECTOR_RANGE } from "../models/missions.ts";
import { positionOf, ringVelocity, sectorDistance } from "./geometry.ts";
import { findSubsystem, hasWorkingCompressor, isDestroyed } from "./ship.ts";
import { isInWeaponRange } from "./targeting.ts";
import { findReadySensor } from "./scan.ts";

const MOVE_TYPES = new Set<PlayerAction["type"]>(["coast", "burn", "well_transfer"]);

const ACTIVE_ACTION_TYPES = new Set<string>([
  "rotate",
  "coast",
  "burn",
  "well_transfer",
  "fire_weapon",
  "scan",
  "allocate_energy",
  "deallocate_energy",
]);

export function validateActionSequence(actions: PlayerAction[]): string[] {
  const errors: string[] = [];
  for (const a of actions) {
    if (
      !a ||
      typeof a !== "object" ||
      !ACTIVE_ACTION_TYPES.has((a as { type?: unknown }).type as string)
    ) {
      errors.push(`Unknown or disallowed action type: ${String((a as { type?: unknown })?.type)}`);
    }
    if (!a?.data || typeof a.data !== "object")
      errors.push(`Action ${String(a?.type)} has no data`);
  }
  if (errors.length > 0) return errors;
  const tactical = actions.filter(isTacticalAction);
  if (tactical.length === 0) return errors;

  const missing = tactical.filter((a) => a.sequence === undefined);
  if (missing.length > 0) {
    return [`Tactical actions must have sequence numbers (found ${missing.length} without)`];
  }
  const sequences = tactical.map((a) => a.sequence!).sort((a, b) => a - b);
  if (new Set(sequences).size !== sequences.length) errors.push("Action sequences must be unique");
  for (let i = 0; i < sequences.length; i++) {
    if (sequences[i] !== i + 1) {
      errors.push(
        `Action sequences must be continuous starting from 1 (expected ${i + 1}, found ${sequences[i]})`
      );
      break;
    }
  }

  const moves = tactical.filter((a) => MOVE_TYPES.has(a.type));
  if (moves.length > 1) errors.push("Only one movement action per turn (coast, burn or jump)");

  return errors;
}

function findPlayer(state: GameState, playerId: string): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

function requirePlayer(state: GameState, playerId: string): Player {
  const player = findPlayer(state, playerId);
  if (!player) throw new Error(`Player ${playerId} not found`);
  return player;
}

export function validateAllocateEnergyAction(
  state: GameState,
  action: AllocateEnergyAction
): string[] {
  const player = requirePlayer(state, action.playerId);
  const sub = findSubsystem(player.ship, action.data.subsystemId);
  if (!sub) return [`Subsystem ${action.data.subsystemId} not found`];
  if (sub.isBroken) return [`${sub.id} is broken and cannot receive energy`];
  const config = getSubsystemConfig(sub.type);
  const errors: string[] = [];
  if (config.maxEnergy === 0) return [`${config.name} is passive and takes no energy`];
  if (!Number.isInteger(action.data.amount) || action.data.amount <= 0)
    errors.push("Allocation amount must be a positive integer");
  if (player.ship.reactor.availableEnergy < action.data.amount) {
    errors.push(
      `Not enough energy available (need ${action.data.amount}, have ${player.ship.reactor.availableEnergy})`
    );
  }
  const total = sub.allocatedEnergy + action.data.amount;
  if (total > config.maxEnergy)
    errors.push(`Would exceed ${config.name} maximum (${total}/${config.maxEnergy})`);
  if (sub.allocatedEnergy === 0 && total < config.minEnergy) {
    errors.push(`Must allocate at least ${config.minEnergy} energy to power ${config.name}`);
  }
  return errors;
}

export function validateDeallocateEnergyAction(
  state: GameState,
  action: DeallocateEnergyAction
): string[] {
  const player = requirePlayer(state, action.playerId);
  const sub = findSubsystem(player.ship, action.data.subsystemId);
  if (!sub) return [`Subsystem ${action.data.subsystemId} not found`];
  if (!Number.isInteger(action.data.amount) || action.data.amount <= 0)
    return ["Deallocation amount must be a positive integer"];
  if (sub.allocatedEnergy === 0) return [`${sub.id} has no energy to deallocate`];
  if (action.data.amount > sub.allocatedEnergy) {
    return [
      `Cannot deallocate ${action.data.amount} from ${sub.id} (only ${sub.allocatedEnergy} allocated)`,
    ];
  }
  const config = getSubsystemConfig(sub.type);
  const remaining = sub.allocatedEnergy - action.data.amount;
  if (remaining > 0 && remaining < config.minEnergy) {
    return [
      `Cannot leave ${config.name} partially powered (${remaining}); deallocate all or stay at ${config.minEnergy}+`,
    ];
  }
  return [];
}

export function validateRotateAction(state: GameState, action: RotateAction): string[] {
  const player = requirePlayer(state, action.playerId);
  if (action.data.targetFacing !== "prograde" && action.data.targetFacing !== "retrograde") {
    return [`Unknown facing ${String(action.data.targetFacing)}`];
  }
  if (player.ship.facing === action.data.targetFacing) return ["Already facing that direction"];
  const rotation = findSubsystem(player.ship, "rotation");
  if (!rotation) return ["Rotation subsystem not found"];
  if (rotation.isBroken) return ["Maneuvering thrusters are broken"];
  const errors: string[] = [];
  if (!rotation.isPowered) errors.push("Maneuvering thrusters not powered");
  if (rotation.usedThisTurn) errors.push("Maneuvering thrusters already used this turn");
  return errors;
}

export function validateCoastAction(state: GameState, action: CoastAction): string[] {
  const player = requirePlayer(state, action.playerId);
  if (!action.data.activateScoop) return [];
  const scoop = findSubsystem(player.ship, "scoop");
  const config = getSubsystemConfig("scoop");
  if (!scoop || scoop.isBroken) return ["Fuel scoop is broken"];
  if (scoop.allocatedEnergy < config.minEnergy) {
    return [
      `Need ${config.minEnergy} energy in the scoop to activate it (have ${scoop.allocatedEnergy})`,
    ];
  }
  if (scoop.usedThisTurn) return ["Fuel scoop already used this turn"];
  return [];
}

function validateEnginesReady(player: Player, energyNeeded: number, what: string): string[] {
  const engines = findSubsystem(player.ship, "engines");
  if (!engines || engines.isBroken) return ["Engines are broken"];
  const errors: string[] = [];
  if (engines.allocatedEnergy < energyNeeded) {
    errors.push(
      `Need ${energyNeeded} energy in engines for ${what} (have ${engines.allocatedEnergy})`
    );
  }
  if (engines.usedThisTurn) errors.push("Engines already used this turn");
  return errors;
}

export function validateBurnAction(state: GameState, action: BurnAction): string[] {
  const player = requirePlayer(state, action.playerId);
  const cost = BURN_COSTS[action.data.burnIntensity];
  const adjustment = action.data.sectorAdjustment ?? 0;
  const errors = validateEnginesReady(player, cost.energy, `a ${action.data.burnIntensity} burn`);

  if (!Number.isInteger(adjustment)) {
    errors.push("Sector adjustment must be an integer");
  } else {
    const { min, max } = getAdjustmentRange(ringVelocity(player.ship.wellId, player.ship.ring));
    if (adjustment < min || adjustment > max) {
      errors.push(`Sector adjustment ${adjustment} out of range (${min} to ${max})`);
    }
  }
  // A burn changes exactly its number of rings; there is no partial burn off the edge.
  const target = player.ship.ring + (player.ship.facing === "prograde" ? 1 : -1) * cost.rings;
  if (target < 1 || target > getMaxRing(player.ship.wellId)) {
    errors.push(
      `A ${action.data.burnIntensity} burn ${player.ship.facing === "prograde" ? "outward" : "inward"} from ring ${player.ship.ring} would leave the rings`
    );
  }
  const mass = calculateBurnMassCost(cost.mass, adjustment);
  if (player.ship.reactionMass < mass) {
    errors.push(
      `Need ${mass} reaction mass (${cost.mass} burn + ${Math.abs(adjustment)} phasing), have ${player.ship.reactionMass}`
    );
  }
  return errors;
}

function validateTarget(
  state: GameState,
  attacker: Player,
  targetId: string
): { errors: string[]; target?: Player } {
  if (targetId === attacker.id) return { errors: ["Cannot target yourself"] };
  const target = findPlayer(state, targetId);
  if (!target) return { errors: [`Target ${targetId} not found`] };
  if (!target.hasDeployed || isDestroyed(target.ship))
    return { errors: [`${target.name} is not on the board`] };
  return { errors: [], target };
}

export function validateFireWeaponAction(state: GameState, action: FireWeaponAction): string[] {
  const player = requirePlayer(state, action.playerId);
  const weapon = findSubsystem(player.ship, action.data.subsystemId);
  if (!weapon) return [`Weapon ${action.data.subsystemId} not found`];
  if (!isWeaponType(weapon.type)) return [`${weapon.id} is not a weapon`];
  const config = getSubsystemConfig(weapon.type);
  if (weapon.isBroken) return [`${config.name} is broken`];

  const errors: string[] = [];
  if (!weapon.isPowered || weapon.allocatedEnergy < config.minEnergy)
    errors.push(`${config.name} not powered`);
  if (weapon.usedThisTurn) errors.push(`${config.name} already fired this turn`);
  if (weapon.type === "missiles" && (weapon.ammo ?? 0) <= 0) errors.push("No missiles remaining");

  const { errors: targetErrors, target } = validateTarget(
    state,
    player,
    action.data.targetPlayerId
  );
  errors.push(...targetErrors);
  if (target) {
    if (!isInWeaponRange(weapon, player.ship, positionOf(target.ship))) {
      errors.push(`${target.name} is out of range for ${config.name}`);
    }
    if (!findSubsystem(target.ship, action.data.criticalTarget)) {
      errors.push(
        `Critical target ${action.data.criticalTarget} is not a slot on ${target.name}'s ship`
      );
    }
  }

  if (config.weaponStats?.hasRecoil) {
    if (action.data.compensateRecoil) {
      errors.push(...validateEnginesReady(player, BURN_COSTS.soft.energy, "recoil compensation"));
      if (player.ship.reactionMass < BURN_COSTS.soft.mass)
        errors.push("Not enough reaction mass to compensate recoil (need 1)");
    } else {
      const recoilRing = player.ship.ring + (player.ship.facing === "prograde" ? 1 : -1);
      if (recoilRing < 1 || recoilRing > getMaxRing(player.ship.wellId)) {
        errors.push("Recoil would push the ship off the rings; compensate with engines or rotate");
      }
    }
  }
  return errors;
}

export function validateScanAction(state: GameState, action: ScanAction): string[] {
  const player = requirePlayer(state, action.playerId);
  if (!player.ship.subsystems.some((s) => s.type === "sensor_array"))
    return ["No sensor array installed"];
  const sensor = findReadySensor(player.ship);
  if (!sensor) return ["Sensor array must be powered, unbroken and unused this turn to scan"];
  const { errors, target } = validateTarget(state, player, action.data.targetPlayerId);
  if (!target) return errors;
  if (target.ship.wellId !== player.ship.wellId || target.ship.ring !== player.ship.ring) {
    errors.push(`${target.name} must be on your ring to scan`);
  } else if (sectorDistance(player.ship.sector, target.ship.sector) > SCAN_SECTOR_RANGE) {
    errors.push(`${target.name} must be within ${SCAN_SECTOR_RANGE} sectors to scan`);
  }
  const slot = findSubsystem(target.ship, action.data.peekSlot);
  if (!slot || slot.slotGroup === undefined) {
    errors.push(`Slot ${action.data.peekSlot} is not a loadout slot`);
  }
  // Naming a slot you already know is fine: the scan peeks the next face-down
  // slot instead (see choosePeekSlot in scan.ts).
  return errors;
}

export function validateWellTransferAction(state: GameState, action: WellTransferAction): string[] {
  const player = requirePlayer(state, action.playerId);
  const jump = findJump(positionOf(player.ship), action.data.destinationWellId);
  if (!jump) return ["No transfer lane from this position to that destination"];
  const errors = validateEnginesReady(player, WELL_TRANSFER_COSTS.energy, "a jump");
  if (!hasWorkingCompressor(player.ship) && player.ship.reactionMass < WELL_TRANSFER_COSTS.mass) {
    errors.push(
      `Not enough reaction mass for a jump (need ${WELL_TRANSFER_COSTS.mass}, have ${player.ship.reactionMass})`
    );
  }
  return errors;
}
