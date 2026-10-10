/**
 * Action validators. Each returns a list of error messages (empty = valid)
 * and never mutates state. Processors call the matching validator on the
 * current state right before applying each action, so range, fuel and
 * "one thing a turn" checks see the ship as it is at that point in the sequence.
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
  DockSaleAction,
  EscortMarkAction,
  SalvageAction,
  SeizeAction,
  SurveyAction,
  ScanAction,
  WellTransferAction,
  Position,
} from "../models/game.ts";
import {
  MOVE_ACTION_TYPES,
  PLAYER_ACTION_TYPES,
  isOpeningRound,
  isQuietTurn,
  isTacticalAction,
} from "../models/game.ts";
import {
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
import { findJump, getJumpAdjustmentRange } from "../models/gravityWells.ts";
import { SCAN_SECTOR_RANGE } from "../models/missions.ts";
import { positionOf, ringVelocity, samePosition } from "./geometry.ts";
import { findSubsystem, hasWorkingCompressor, isOnBoard, requestedDraw } from "./ship.ts";
import { recoilRing, ringAfter } from "./movement.ts";
import { canBeTargeted, isTouchable, canFireFrom, isInWeaponRange } from "./targeting.ts";
import { findReadySensor, inScanRange } from "./scan.ts";
import { isMooredAt, isMooredMidTurn } from "./stations.ts";
import { freePiracyCards, seizableItemsNow } from "./piracy.ts";
import { escortCandidatesNow, markedBy, unplacedEscorts } from "./escort.ts";
import { onSurveyRing, surveyToTake } from "./survey.ts";
import { salvageToTake } from "./salvage.ts";

export function validateActionSequence(actions: PlayerAction[]): string[] {
  const errors: string[] = [];
  for (const a of actions) {
    if (
      !a ||
      typeof a !== "object" ||
      !PLAYER_ACTION_TYPES.has((a as { type?: unknown }).type as PlayerAction["type"])
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

  const moves = tactical.filter((a) => MOVE_ACTION_TYPES.has(a.type));
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

  const amount = requestedDraw(sub.type, action.data.amount);
  if (!Number.isInteger(amount)) return [`${config.name} is powered with a whole number of cubes`];
  const errors: string[] = [];
  if (amount < config.minEnergy)
    errors.push(`${config.name} needs at least ${config.minEnergy} cubes to work`);
  if (amount > config.maxEnergy)
    errors.push(`${config.name} holds at most ${config.maxEnergy} cubes`);
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
  if (ringAfter(player.ship, cost.rings) === null) {
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
  if (!isOnBoard(target)) return { errors: [`${target.name} is not on the board`] };
  // Just back from Home: untouchable until their returning turn is over
  // (RULES §Destruction and Respawn). Both a shot and a scan are refused,
  // which is the whole point: a ship that returns to a sector everyone knows
  // must not be a free kill.
  if (!isTouchable(target))
    return { errors: [`${target.name} cannot be touched until their next turn is over`] };
  return { errors: [], target };
}

/**
 * The refusal a quiet turn owes the player, or null. Two turns are quiet: the
 * opening round, and a ship's first turn back from Home. The reasons read
 * differently because a player who cannot fire deserves to know which one it
 * is (RULES §A Turn, §Destruction and Respawn).
 */
function quietTurnRefusal(
  state: GameState,
  player: Player,
  what: "fire" | "scan" | "seize"
): string | null {
  if (!isQuietTurn(state.turn, player)) return null;
  const opening = isOpeningRound(state.turn);
  switch (what) {
    case "fire":
      return opening
        ? "No weapon fires in the first round"
        : "Back from Home: this turn is a first round of your own, so no weapon of yours fires";
    case "scan":
      return opening
        ? "Nobody scans in the first round"
        : "Back from Home: this turn is a first round of your own, so you scan nobody";
    case "seize":
      return opening
        ? "Nobody seizes in the first round"
        : "Back from Home: this turn is a first round of your own, so you seize from nobody";
  }
}

/** What an action of the turn needs to know about the turn itself. */
export interface TurnContext {
  /** Where the acting ship began its turn: it is moored only while it holds that berth. */
  start: Position;
}

export function validateFireWeaponAction(
  state: GameState,
  action: FireWeaponAction,
  turn: TurnContext
): string[] {
  const player = requirePlayer(state, action.playerId);
  const quiet = quietTurnRefusal(state, player, "fire");
  if (quiet) return [quiet];
  // A moored ship neither fires nor is fired at (RULES §Stations, Moored). A
  // ship is moored from the moment it docks at the end of the turn it arrives
  // until it leaves the sector: one that began the turn at a berth fires once
  // it has burned off, and one arriving this turn fires before and after its move.
  if (!canFireFrom(turn.start, player.ship, state.stations))
    return ["A moored ship fires at nobody: burn off the berth first"];
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
  // A berth is safe: no weapon reaches it, missiles included.
  if (target && !canBeTargeted(target, state.stations))
    errors.push(`${target.name} is moored: nobody fires at a ship at a berth`);
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
      if (recoilRing(player.ship) === null) {
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

/**
 * Naming what a visit sells. Only the name is checked: whether the turn
 * arrives anywhere, and what the station would buy there, is known when it
 * docks, and a sale it cannot make falls back to the default
 * (game/docking.ts).
 */
export function validateDockSaleAction(_state: GameState, action: DockSaleAction): string[] {
  const sale = action.data?.sale;
  if (typeof sale !== "string" || sale.length === 0)
    return [`A sale names an item's cargo id, "fuel" or "none", not ${String(sale)}`];
  return [];
}

/**
 * An Escort marker at its point in the sequence (RULES §Missions, Escort): a
 * marker is in hand, the carrier is a rival on the escort's ring there with
 * cargo aboard and no marker on it, it is not just back from Home, and
 * neither ship is moored (the escort by the berth it began the turn on, as
 * for firing). Allowed on a quiet turn: a marker is neither a shot, a scan
 * nor a seizure. A carrier destroyed earlier in the turn is skipped before
 * this is asked (actionProcessors.ts).
 */
export function validateEscortMarkAction(
  state: GameState,
  action: EscortMarkAction,
  turn: TurnContext
): string[] {
  const carrierId = action.data.carrierId;
  if (typeof carrierId !== "string" || !findPlayer(state, carrierId))
    return [`An Escort marker goes on a player at the table, not ${String(carrierId)}`];
  if (carrierId === action.playerId) return ["An Escort marker goes on a rival, not your own ship"];
  const escort = requirePlayer(state, action.playerId);
  const carrier = requirePlayer(state, carrierId);
  if (unplacedEscorts(escort.missions).length === 0)
    return ["No Escort marker in hand: one marker per undone Escort"];
  if (!isOnBoard(carrier)) return [`${carrier.name} is not on the board`];
  if (!isTouchable(carrier))
    return [`${carrier.name} cannot be touched until their next turn is over`];
  if (isMooredMidTurn(state.stations, turn.start, positionOf(escort.ship)))
    return ["A moored ship marks nobody: burn off the berth first"];
  if (state.players.some((p) => markedBy(p).has(carrierId)))
    return [`${carrier.name} already carries an Escort marker: a ship takes one`];
  if (
    carrier.ship.wellId !== escort.ship.wellId ||
    carrier.ship.ring !== escort.ship.ring
  )
    return [`${carrier.name} is not on your ring at this point in the turn`];
  if (isMooredAt(state.stations, positionOf(carrier.ship)))
    return [`${carrier.name} is moored: a berth takes no marker`];
  if (!carrier.cargo.some((c) => c.isPickedUp)) return [`${carrier.name} carries nothing`];
  // Every check above is the referee list's, said item by item; this is the
  // list itself, so the two cannot drift.
  if (!escortCandidatesNow(state, escort.id, turn.start).includes(carrierId))
    return [`${carrier.name} cannot take your marker here`];
  return [];
}

/**
 * A dive at its point in the sequence (RULES §Missions, Survey): the ship is
 * on Black Hole Ring 1 there and an undone Survey has no data aboard. Allowed
 * on a quiet turn: it touches nobody. One dive a turn is checked over the
 * whole turn (actionProcessors.ts).
 */
export function validateSurveyAction(state: GameState, action: SurveyAction): string[] {
  const player = requirePlayer(state, action.playerId);
  if (!surveyToTake(player))
    return ["No Survey card wants data: each takes one, and its data must be filed first"];
  if (!onSurveyRing(positionOf(player.ship)))
    return ["A survey is taken on Black Hole Ring 1: you are not on it at this point in the turn"];
  return [];
}

/**
 * A salvage at its point in the sequence (RULES §Missions, Salvage): an
 * undone Salvage has no black box aboard, and a wreck it names is on the
 * ship's sector there, moored or not. One that names none takes the first
 * wreck there, and finding none is skipped rather than refused
 * (actionProcessors.ts): whether the shot before it killed is the dice's.
 * Allowed on a quiet turn: a wreck is nobody. One wreck a turn is checked
 * over the whole turn (actionProcessors.ts).
 */
export function validateSalvageAction(state: GameState, action: SalvageAction): string[] {
  const wreckId = action.data?.wreckId;
  if (wreckId !== undefined && typeof wreckId !== "string")
    return [`A salvage names a wreck by its id, not ${String(wreckId)}`];
  const player = requirePlayer(state, action.playerId);
  if (!salvageToTake(player))
    return ["No Salvage card wants a black box: each takes one, and it must be filed first"];
  if (wreckId === undefined) return [];
  const wreck = state.wrecks.find((w) => w.id === wreckId);
  if (!wreck) return [`No wreck ${wreckId} on the board`];
  if (!samePosition(wreck, positionOf(player.ship)))
    return [`Wreck ${wreckId} is not in your sector at this point in the turn`];
  return [];
}

/**
 * A seizure at its point in the sequence (RULES §Missions, Piracy): the item
 * is aboard a rival in the pirate's sector there, neither ship is moored (the
 * pirate by the berth it began the turn on, as for firing), the rival is not
 * just back from Home, and a Piracy card is free to take it. Refused on a
 * quiet turn, as a shot and a scan are: the opening round and a ship's first
 * turn back from Home reach nobody. A ship destroyed earlier in the turn is
 * skipped before this is asked (actionProcessors.ts).
 */
export function validateSeizeAction(
  state: GameState,
  action: SeizeAction,
  turn: TurnContext
): string[] {
  const { victimId, cargoId } = action.data;
  if (typeof victimId !== "string" || !findPlayer(state, victimId))
    return [`A seizure is made from a player at the table, not ${String(victimId)}`];
  if (victimId === action.playerId) return ["A seizure is made from a rival, not your own ship"];
  if (typeof cargoId !== "string")
    return [`The item seized is named by its cargo id, not ${String(cargoId)}`];
  const pirate = requirePlayer(state, action.playerId);
  const victim = requirePlayer(state, victimId);
  const quiet = quietTurnRefusal(state, pirate, "seize");
  if (quiet) return [quiet];
  if (freePiracyCards(pirate.missions, pirate.cargo).length === 0)
    return ["No Piracy card free to take an item: each takes one, and its loot must be sold first"];
  if (!isOnBoard(victim)) return [`${victim.name} is not on the board`];
  if (!isTouchable(victim))
    return [`${victim.name} cannot be touched until their next turn is over`];
  if (isMooredMidTurn(state.stations, turn.start, positionOf(pirate.ship)))
    return ["A moored ship seizes nothing: burn off the berth first"];
  if (!samePosition(positionOf(victim.ship), positionOf(pirate.ship)))
    return [`${victim.name} is not in your sector at this point in the turn`];
  if (isMooredAt(state.stations, positionOf(victim.ship)))
    return [`${victim.name} is moored: nothing changes hands at a berth`];
  if (!victim.cargo.some((c) => c.id === cargoId && c.isPickedUp))
    return [`${victim.name} carries no item ${cargoId}`];
  // Every check above is the referee list's, said item by item; this is the
  // list itself, so the two cannot drift.
  const listed = seizableItemsNow(state, pirate.id, turn.start);
  if (!listed.some((i) => i.victimId === victimId && i.cargoId === cargoId))
    return [`${cargoId} cannot be seized from ${victim.name} here`];
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
  // A berth is safe from scans too (RULES §Stations); a moored ship may still scan.
  if (!canBeTargeted(target, state.stations))
    errors.push(`${target.name} is moored: nobody scans a ship at a berth`);
  if (!inScanRange(player.ship, positionOf(target.ship))) {
    const sameRing =
      target.ship.wellId === player.ship.wellId && target.ship.ring === player.ship.ring;
    errors.push(
      sameRing
        ? `${target.name} is not ahead of you within ${SCAN_SECTOR_RANGE} sectors: rotate to face them, or close in`
        : `${target.name} must be on your ring to scan`
    );
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
  if (player.ship.facing !== "prograde")
    errors.push("A jump is a burn out of the well: face prograde (rotate first)");

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
