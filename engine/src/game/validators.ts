/**
 * Action validators.
 *
 * Each `validate*Action` function inspects the current GameState and one
 * candidate action, returning a `string[]` of error messages (empty if the
 * action is valid). Validators NEVER mutate state.
 *
 * `validateActionSequence` is the only multi-action validator: it inspects an
 * entire submitted action list for ordering/sequence-number issues before any
 * single action is checked.
 *
 * The action processors in `actionProcessors.ts` call these before applying
 * each corresponding processor. Keeping validators in a dedicated file makes
 * the rules easy to find and the dispatch logic easier to read.
 */

import type {
  GameState,
  PlayerAction,
  AllocateEnergyAction,
  DeallocateEnergyAction,
  RotateAction,
  CoastAction,
  BurnAction,
  FireWeaponAction,
  WellTransferAction,
} from "../models/game.ts";
import { getSubsystemConfig } from "../models/subsystems.ts";
import {
  BURN_COSTS,
  WELL_TRANSFER_COSTS,
  getAdjustmentRange,
  calculateBurnMassCost,
} from "../models/rings.ts";
import { getGravityWell, TRANSFER_POINTS } from "../models/gravityWells.ts";
import { getMissileAmmo } from "./missiles.ts";

/**
 * Validate the shape of a submitted action list before any single action is
 * checked. Enforces sequence-number contracts on tactical actions and
 * cross-action constraints (well transfer + burn, ordering rules).
 */
export function validateActionSequence(actions: PlayerAction[]): string[] {
  const errors: string[] = [];

  const tacticalActions = actions.filter(
    (a) =>
      a.type === "rotate" ||
      a.type === "coast" ||
      a.type === "burn" ||
      a.type === "fire_weapon" ||
      a.type === "well_transfer"
  );

  if (tacticalActions.length === 0) {
    return [];
  }

  const missingSequence = tacticalActions.filter(
    (a) => a.sequence === undefined
  );
  if (missingSequence.length > 0) {
    errors.push(
      `Tactical actions must have sequence numbers (found ${missingSequence.length} without)`
    );
    return errors;
  }

  const sequences = tacticalActions
    .map((a) => a.sequence!)
    .sort((a, b) => a - b);

  const uniqueSequences = new Set(sequences);
  if (uniqueSequences.size !== sequences.length) {
    errors.push("Action sequences must be unique (no duplicates)");
  }

  for (let i = 0; i < sequences.length; i++) {
    if (sequences[i] !== i + 1) {
      errors.push(
        `Action sequences must be continuous starting from 1 (expected ${i + 1}, found ${sequences[i]})`
      );
      break;
    }
  }

  // Well transfer specific rules
  const wellTransferAction = tacticalActions.find(
    (a) => a.type === "well_transfer"
  );
  const burnAction = tacticalActions.find((a) => a.type === "burn");
  const coastAction = tacticalActions.find((a) => a.type === "coast");
  const moveAction = burnAction || coastAction;

  if (wellTransferAction && burnAction) {
    errors.push(
      "Cannot burn while initiating a well transfer (burning is disallowed during well transfers)"
    );
  }

  if (wellTransferAction && moveAction) {
    if (wellTransferAction.sequence! > moveAction.sequence!) {
      errors.push("Well transfer must happen before movement (coast) action");
    }
  }

  return errors;
}

export function validateAllocateEnergyAction(
  gameState: GameState,
  action: AllocateEnergyAction
): string[] {
  const player = findPlayer(gameState, action.playerId);
  const errors: string[] = [];

  const subsystem = player.ship.subsystems.find(
    (s) => s.type === action.data.subsystemType
  );
  if (!subsystem) {
    errors.push(`Subsystem ${action.data.subsystemType} not found`);
    return errors;
  }

  // Broken subsystems can't receive energy.
  if (subsystem.isBroken) {
    errors.push(
      `${action.data.subsystemType} is broken and cannot receive energy`
    );
    return errors;
  }

  if (player.ship.reactor.availableEnergy < action.data.amount) {
    errors.push(
      `Not enough energy available (need ${action.data.amount}, have ${player.ship.reactor.availableEnergy})`
    );
  }

  const config = getSubsystemConfig(action.data.subsystemType);
  const newTotal = subsystem.allocatedEnergy + action.data.amount;
  if (newTotal > config.maxEnergy) {
    errors.push(
      `Would exceed ${action.data.subsystemType} absolute maximum capacity (${newTotal}/${config.maxEnergy})`
    );
  }

  // Powering up from 0 requires reaching at least minEnergy in one go.
  // Subsystems live in two states: off (0) or on (>= minEnergy).
  if (subsystem.allocatedEnergy === 0 && newTotal < config.minEnergy) {
    errors.push(
      `Must allocate at least ${config.minEnergy} energy to power ${action.data.subsystemType} (tried to allocate ${action.data.amount})`
    );
  }

  return errors;
}

export function validateDeallocateEnergyAction(
  gameState: GameState,
  action: DeallocateEnergyAction
): string[] {
  const player = findPlayer(gameState, action.playerId);
  const errors: string[] = [];

  const subsystem = player.ship.subsystems.find(
    (s) => s.type === action.data.subsystemType
  );
  if (!subsystem) {
    errors.push(`Subsystem ${action.data.subsystemType} not found`);
    return errors;
  }

  if (subsystem.allocatedEnergy === 0) {
    errors.push(`${action.data.subsystemType} has no energy to deallocate`);
  }

  if (action.data.amount > subsystem.allocatedEnergy) {
    errors.push(
      `Cannot deallocate ${action.data.amount} from ${action.data.subsystemType} (only ${subsystem.allocatedEnergy} allocated)`
    );
    return errors;
  }

  // Subsystems live in two states: off (0) or on (>= minEnergy). Reject
  // partial-power requests that would leave the subsystem stuck between.
  const config = getSubsystemConfig(action.data.subsystemType);
  const remaining = subsystem.allocatedEnergy - action.data.amount;
  if (remaining > 0 && remaining < config.minEnergy) {
    errors.push(
      `Cannot leave ${action.data.subsystemType} partially powered (${remaining}). Deallocate all ${subsystem.allocatedEnergy} to turn off, or deallocate less to stay at ${config.minEnergy}+ energy.`
    );
  }

  return errors;
}

export function validateRotateAction(
  gameState: GameState,
  action: RotateAction
): string[] {
  const player = findPlayer(gameState, action.playerId);
  const errors: string[] = [];

  if (player.ship.facing === action.data.targetFacing) {
    errors.push("Already facing that direction");
    return errors;
  }

  const rotationSubsystem = player.ship.subsystems.find(
    (s) => s.type === "rotation"
  );
  if (!rotationSubsystem) {
    errors.push("Rotation subsystem not found");
    return errors;
  }

  if (rotationSubsystem.isBroken) {
    errors.push("Maneuvering thrusters are broken and cannot be used");
    return errors;
  }

  if (rotationSubsystem.allocatedEnergy === 0) {
    errors.push("Rotation subsystem not powered");
  }

  if (rotationSubsystem.usedThisTurn) {
    errors.push("Rotation subsystem already used this turn");
  }

  return errors;
}

export function validateCoastAction(
  gameState: GameState,
  action: CoastAction
): string[] {
  const player = findPlayer(gameState, action.playerId);
  const errors: string[] = [];

  if (action.data.activateScoop) {
    const scoopSubsystem = player.ship.subsystems.find(
      (s) => s.type === "scoop"
    );
    const currentScoopEnergy = scoopSubsystem?.allocatedEnergy || 0;
    const scoopConfig = getSubsystemConfig("scoop");

    if (currentScoopEnergy < scoopConfig.minEnergy) {
      errors.push(
        `Need ${scoopConfig.minEnergy} energy in scoop to activate (have ${currentScoopEnergy})`
      );
    }
  }

  return errors;
}

export function validateBurnAction(
  gameState: GameState,
  action: BurnAction
): string[] {
  const player = findPlayer(gameState, action.playerId);
  const errors: string[] = [];

  const burnCost = BURN_COSTS[action.data.burnIntensity];
  const sectorAdjustment = action.data.sectorAdjustment || 0;

  const enginesSubsystem = player.ship.subsystems.find(
    (s) => s.type === "engines"
  );

  if (enginesSubsystem?.isBroken) {
    errors.push("Engines are broken and cannot be used");
    return errors;
  }

  const currentEngineEnergy = enginesSubsystem?.allocatedEnergy || 0;

  if (currentEngineEnergy < burnCost.energy) {
    errors.push(
      `Need ${burnCost.energy} energy in engines for ${action.data.burnIntensity} burn (have ${currentEngineEnergy})`
    );
  }

  // Ring velocity dictates the allowed sector-adjustment band.
  const well = getGravityWell(player.ship.wellId);
  const ringConfig = well?.rings.find((r) => r.ring === player.ship.ring);
  const velocity = ringConfig?.velocity || 1;

  const { min, max } = getAdjustmentRange(velocity);
  if (sectorAdjustment < min || sectorAdjustment > max) {
    errors.push(
      `Sector adjustment ${sectorAdjustment} out of range (${min} to ${max} for velocity ${velocity})`
    );
  }

  const totalMassCost = calculateBurnMassCost(burnCost.mass, sectorAdjustment);
  if (player.ship.reactionMass < totalMassCost) {
    errors.push(
      `Need ${totalMassCost} reaction mass (${burnCost.mass} base + ${Math.abs(sectorAdjustment)} adjustment), have ${player.ship.reactionMass}`
    );
  }

  return errors;
}

export function validateFireWeaponAction(
  gameState: GameState,
  action: FireWeaponAction
): string[] {
  const player = findPlayer(gameState, action.playerId);
  const errors: string[] = [];

  // Find weapon subsystem: use subsystemIndex if provided, otherwise find by type
  const weaponSubsystem =
    action.data.subsystemIndex !== undefined
      ? player.ship.subsystems[action.data.subsystemIndex]
      : player.ship.subsystems.find((s) => s.type === action.data.weaponType);

  if (!weaponSubsystem || weaponSubsystem.type !== action.data.weaponType) {
    errors.push(`${action.data.weaponType} not found`);
    return errors;
  }

  if (weaponSubsystem.isBroken) {
    errors.push(`${action.data.weaponType} is broken and cannot be used`);
    return errors;
  }

  if (!weaponSubsystem.isPowered) {
    errors.push(`${action.data.weaponType} not powered`);
  }

  if (weaponSubsystem.usedThisTurn) {
    errors.push(`${action.data.weaponType} already used this turn`);
  }

  const weaponConfig = getSubsystemConfig(action.data.weaponType);
  if (!weaponConfig) {
    errors.push(`Unknown weapon type: ${action.data.weaponType}`);
    return errors;
  }

  if (action.data.targetPlayerIds.length === 0) {
    errors.push("Must have at least one target");
  }

  if (action.data.targetPlayerIds.length > 1) {
    errors.push(
      `${action.data.weaponType} can only target 1 player at a time, got ${action.data.targetPlayerIds.length}`
    );
  }

  const totalEnergyCost = weaponConfig.minEnergy;
  if (weaponSubsystem.allocatedEnergy < totalEnergyCost) {
    errors.push(
      `Not enough energy (need ${totalEnergyCost}, have ${weaponSubsystem.allocatedEnergy})`
    );
  }

  // Missile inventory lives on the missiles subsystem.
  if (action.data.weaponType === "missiles") {
    if (getMissileAmmo(player.ship.subsystems) <= 0) {
      errors.push("No missiles remaining");
    }
  }

  // Recoil validation (any weapon with hasRecoil — currently only railgun).
  if (weaponConfig.weaponStats?.hasRecoil) {
    const recoilDirection = player.ship.facing === "prograde" ? 1 : -1;
    const recoilRing = player.ship.ring + recoilDirection;
    const maxRing = getGravityWell(player.ship.wellId)?.rings.length ?? 5;

    if (action.data.compensateRecoil) {
      // Compensation requires engines powered at soft level (1) and not already used.
      const engines = player.ship.subsystems.find((s) => s.type === "engines");
      if (!engines || engines.allocatedEnergy < BURN_COSTS.soft.energy) {
        errors.push("Engines must be powered (level 1+) to compensate railgun recoil");
      }
      if (engines?.usedThisTurn) {
        errors.push("Engines already used this turn — cannot compensate recoil");
      }
      if (player.ship.reactionMass < BURN_COSTS.soft.mass) {
        errors.push("Not enough reaction mass to compensate recoil (need 1)");
      }
    } else {
      // No compensation — check if recoil would push ship to invalid ring.
      if (recoilRing < 1) {
        errors.push("Cannot fire railgun: recoil would push ship into the gravity well (compensate with engines or rotate)");
      }
      if (recoilRing > maxRing) {
        errors.push("Cannot fire railgun: recoil would push ship beyond outermost ring (compensate with engines or rotate)");
      }
    }
  }

  return errors;
}

export function validateWellTransferAction(
  gameState: GameState,
  action: WellTransferAction
): string[] {
  const player = findPlayer(gameState, action.playerId);
  const errors: string[] = [];

  const currentWell = getGravityWell(player.ship.wellId);
  if (!currentWell) {
    errors.push("Current gravity well not found");
    return errors;
  }

  // Ship must be on outermost ring of current well.
  const outermostRing = currentWell.rings[currentWell.rings.length - 1];
  if (player.ship.ring !== outermostRing.ring) {
    errors.push(
      `Well transfers can only be initiated from Ring ${outermostRing.ring} (outermost ring of ${currentWell.name || currentWell.id})`
    );
    return errors;
  }

  if (player.ship.transferState) {
    errors.push("Cannot initiate well transfer while already in transfer");
    return errors;
  }

  // Check if a transfer point exists from current position to destination.
  const transferPoint = TRANSFER_POINTS.find(
    (tp) =>
      tp.fromWellId === player.ship.wellId &&
      tp.fromSector === player.ship.sector &&
      tp.toWellId === action.data.destinationWellId
  );

  if (!transferPoint) {
    errors.push(
      "No transfer point available from current position to destination well"
    );
    return errors;
  }

  // Engine level requirement (elliptic transfers).
  if (transferPoint.requiredEngineLevel) {
    const enginesSubsystem = player.ship.subsystems.find(
      (s) => s.type === "engines"
    );
    if (
      !enginesSubsystem ||
      enginesSubsystem.allocatedEnergy < transferPoint.requiredEngineLevel
    ) {
      errors.push(
        `Well transfer requires engines at level ${transferPoint.requiredEngineLevel} (current: ${enginesSubsystem?.allocatedEnergy || 0})`
      );
      return errors;
    }
  }

  if (player.ship.facing !== "prograde") {
    errors.push("Ship must be facing prograde to initiate well transfer");
    return errors;
  }

  if (player.ship.reactionMass < WELL_TRANSFER_COSTS.mass) {
    errors.push(
      `Not enough reaction mass for well transfer (need ${WELL_TRANSFER_COSTS.mass}, have ${player.ship.reactionMass})`
    );
    return errors;
  }

  return errors;
}

/**
 * Lookup helper. Validators trust that the action's playerId references a
 * known player — the higher-level dispatch already filters by active player.
 * If the id is missing this returns the index-`-1` lookup which yields
 * `undefined`; callers will surface clearer errors than this would.
 */
function findPlayer(gameState: GameState, playerId: string) {
  const playerIndex = gameState.players.findIndex((p) => p.id === playerId);
  return gameState.players[playerIndex];
}
