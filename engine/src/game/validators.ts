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
  PowerAction,
  RotateAction,
  CoastAction,
  BurnAction,
  FireWeaponAction,
  RepairAction,
  ScanAction,
  WellTransferAction,
} from "../models/game.ts";
import { isOpeningRound, isQuietTurn, isTacticalAction } from "../models/game.ts";
import {
  energyStepOf,
  getSubsystemConfig,
  isPowerableType,
  isWeaponType,
} from "../models/subsystems.ts";
import {
  BURN_COSTS,
  COMPRESSED_JUMP_MASS,
  WELL_TRANSFER_COSTS,
  getAdjustmentRange,
  calculateBurnMassCost,
  calculateJumpMassCost,
} from "../models/rings.ts";
import { findJump, getJumpAdjustmentRange, getMaxRing } from "../models/gravityWells.ts";
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
  "power",
  "repair",
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

/**
 * Powering one of the tiles that work on other players' turns (RULES §Energy
 * and Heat). `amount` is what the tile holds once powered; absent is its
 * minimum. Allowed on a quiet turn: a wall or a rack answers other players,
 * and nobody is reached by it.
 *
 * Each tile does one thing a turn, so a tile already used or powered this turn
 * is refused, and the other way round a rack powered this turn cannot fire and
 * a sensor powered this turn cannot scan (both are `usedThisTurn`). Firing the
 * rack or scanning with the sensor leaves it up anyway.
 */
export function validatePowerAction(state: GameState, action: PowerAction): string[] {
  const player = requirePlayer(state, action.playerId);
  const sub = findSubsystem(player.ship, action.data.subsystemId);
  if (!sub) return [`Subsystem ${action.data.subsystemId} not found`];
  const config = getSubsystemConfig(sub.type);
  if (!isPowerableType(sub.type))
    return [`${config.name} is powered by the action that uses it, not by a power action`];
  if (sub.isBroken) return [`${config.name} is broken and cannot be powered`];
  if (sub.usedThisTurn)
    return [
      `${config.name} has already been used or powered this turn: a subsystem does one thing a turn`,
    ];

  const amount = action.data.amount ?? config.minEnergy;
  if (!Number.isInteger(amount)) return [`${config.name} is powered with a whole number of cubes`];
  const errors: string[] = [];
  if (amount < config.minEnergy)
    errors.push(`${config.name} needs at least ${config.minEnergy} cubes to work`);
  if (amount > config.maxEnergy)
    errors.push(`${config.name} holds at most ${config.maxEnergy} cubes`);
  const step = energyStepOf(sub.type);
  if (amount % step !== 0) errors.push(`${config.name} takes energy ${step} cubes at a time`);
  // Nothing else to check: nothing caps what a ship lights, and what the tile
  // costs is heat at the owner's check, which is their business.
  return errors;
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
  if (rotation.usedThisTurn) errors.push("Maneuvering thrusters already used this turn");
  return errors;
}

export function validateCoastAction(state: GameState, action: CoastAction): string[] {
  const player = requirePlayer(state, action.playerId);
  if (!action.data.activateScoop) return [];
  const scoop = findSubsystem(player.ship, "scoop");
  if (!scoop || scoop.isBroken) return ["Fuel scoop is broken"];
  if (scoop.usedThisTurn) return ["Fuel scoop already used this turn"];
  return [];
}

function validateEnginesReady(player: Player, what: string): string[] {
  const engines = findSubsystem(player.ship, "engines");
  if (!engines || engines.isBroken) return ["Engines are broken"];
  // The burn powers them itself, so all that is left to ask is whether they
  // have already gone once this turn.
  if (engines.usedThisTurn) return [`Engines already used this turn (${what})`];
  return [];
}

export function validateBurnAction(state: GameState, action: BurnAction): string[] {
  const player = requirePlayer(state, action.playerId);
  const cost = BURN_COSTS[action.data.burnIntensity];
  const adjustment = action.data.sectorAdjustment;
  const errors = validateEnginesReady(player, `a ${action.data.burnIntensity} burn`);

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
  // Just back from Home: untouchable until their returning turn is over
  // (RULES §Destruction and Respawn). Both a shot and a scan are refused,
  // which is the whole point: a ship that returns to a sector everyone knows
  // must not be a free kill.
  if (target.recovering)
    return { errors: [`${target.name} cannot be touched until their next turn is over`] };
  return { errors: [], target };
}

/**
 * The refusal a quiet turn owes the player, or null. Two turns are quiet: the
 * opening round, and a ship's first turn back from Home. The reasons read
 * differently because a player who cannot fire deserves to know which one it
 * is (RULES §A Turn, §Destruction and Respawn).
 */
function quietTurnRefusal(state: GameState, player: Player, what: "fire" | "scan"): string | null {
  if (!isQuietTurn(state.turn, player)) return null;
  if (isOpeningRound(state.turn))
    return what === "fire" ? "No weapon fires in the first round" : "Nobody scans in the first round";
  return what === "fire"
    ? "Back from Home: this turn is a first round of your own, so no weapon of yours fires"
    : "Back from Home: this turn is a first round of your own, so you scan nobody";
}

export function validateFireWeaponAction(state: GameState, action: FireWeaponAction): string[] {
  const player = requirePlayer(state, action.playerId);
  const quiet = quietTurnRefusal(state, player, "fire");
  if (quiet) return [quiet];
  const weapon = findSubsystem(player.ship, action.data.subsystemId);
  if (!weapon) return [`Weapon ${action.data.subsystemId} not found`];
  if (!isWeaponType(weapon.type)) return [`${weapon.id} is not a weapon`];
  const config = getSubsystemConfig(weapon.type);
  if (weapon.isBroken) return [`${config.name} is broken`];

  const errors: string[] = [];
  if (weapon.usedThisTurn)
    errors.push(
      isPowerableType(weapon.type)
        ? `${config.name} has already been used or powered this turn: a subsystem does one thing a turn`
        : `${config.name} already fired this turn`
    );
  // A salvo is any number of the tile's remaining rounds in one action; every
  // other weapon fires once, so a count on one is a mistake worth refusing.
  const count = action.data.count;
  if (weapon.type === "missiles") {
    const ammo = weapon.ammo ?? 0;
    if (ammo <= 0) errors.push("No missiles remaining");
    else if (count !== undefined) {
      if (!Number.isInteger(count) || count < 1)
        errors.push("A salvo launches a whole number of missiles, at least one");
      else if (count > ammo) errors.push(`Only ${ammo} missiles remaining`);
    }
  } else if (count !== undefined && count !== 1) {
    errors.push(`${config.name} fires once: only a missiles subsystem launches a salvo`);
  }

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
      errors.push(...validateEnginesReady(player, "recoil compensation"));
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

/**
 * Naming the tile a cold ship's crew will fix. Refused when the slot is not
 * broken (there is nothing to do) or when the ship is already carrying heat,
 * because heat only rises during a turn: a ship that starts hot cannot be cold
 * at its check, and a repair it can never earn should not be submittable.
 */
export function validateRepairAction(state: GameState, action: RepairAction): string[] {
  const player = requirePlayer(state, action.playerId);
  const sub = findSubsystem(player.ship, action.data.subsystemId);
  if (!sub) return [`No subsystem ${action.data.subsystemId}`];
  if (!sub.isBroken) return [`${getSubsystemConfig(sub.type).name} is not broken`];
  if (player.ship.heat.currentHeat > 0) {
    return [
      `Carrying ${player.ship.heat.currentHeat} heat: a repair needs the ship cold at its heat check`,
    ];
  }
  return [];
}

export function validateScanAction(state: GameState, action: ScanAction): string[] {
  const player = requirePlayer(state, action.playerId);
  const quiet = quietTurnRefusal(state, player, "scan");
  if (quiet) return [quiet];
  if (!player.ship.subsystems.some((s) => s.type === "sensor_array"))
    return ["No sensor array installed"];
  const sensor = findReadySensor(player.ship);
  if (!sensor)
    return [
      "Sensor array must be unbroken and not yet used or powered this turn to scan: a subsystem does one thing a turn",
    ];
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
  const adjustment = action.data.sectorAdjustment;
  const errors = validateEnginesReady(player, "a jump");

  // Phasing a jump is bounded by the arrival arc, not by the ring's velocity:
  // a jump has no drift to brake against (RULES §Jump).
  if (!Number.isInteger(adjustment)) {
    errors.push("Sector adjustment must be an integer");
  } else {
    const { min, max } = getJumpAdjustmentRange(jump);
    if (adjustment < min || adjustment > max) {
      errors.push(
        `Sector adjustment ${adjustment} would land outside the arrival arc (${min} to ${max} from here)`
      );
    }
  }
  const compressor = hasWorkingCompressor(player.ship);
  const mass = calculateJumpMassCost(adjustment, compressor);
  if (player.ship.reactionMass < mass) {
    const breakdown = compressor
      ? `${COMPRESSED_JUMP_MASS} jump with the compressor + ${Math.abs(adjustment)} phasing`
      : `${WELL_TRANSFER_COSTS.mass} jump + ${Math.abs(adjustment)} phasing`;
    errors.push(
      `Not enough reaction mass for a jump (need ${mass}: ${breakdown}, have ${player.ship.reactionMass})`
    );
  }
  return errors;
}
