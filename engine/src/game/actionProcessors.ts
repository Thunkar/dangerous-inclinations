/**
 * Action processing for one turn.
 *
 * Order: deallocations, allocations, then tactical actions in the sequence
 * the player chose. Each action is validated against the state as it stands
 * when its turn comes, then applied. Any failure aborts the whole turn.
 */
import type {
  GameState,
  PlayerAction,
  CoastAction,
  BurnAction,
  RotateAction,
  AllocateEnergyAction,
  DeallocateEnergyAction,
  FireWeaponAction,
  WellTransferAction,
  ScanAction,
  Player,
} from "../models/game.ts";
import { isTacticalAction, MAX_REACTION_MASS } from "../models/game.ts";
import type { EventDraft } from "../models/events.ts";
import { getSubsystemConfig, isWeaponType } from "../models/subsystems.ts";
import { BURN_COSTS, calculateJumpMassCost } from "../models/rings.ts";
import { findJump, getMaxRing, phasedJumpDestination } from "../models/gravityWells.ts";
import { rollD10 } from "../utils/rng.ts";
import { positionOf, ringVelocity } from "./geometry.ts";
import { applyOrbitalMovement, applyBurn, applyRotation } from "./movement.ts";
import { resolveAttack } from "./damage.ts";
import { createMissile, revealSensors } from "./missiles.ts";
import { processScan } from "./scan.ts";
import { isMooredAt } from "./stations.ts";
import {
  findSubsystem,
  hasWorkingCompressor,
  isDestroyed,
  revealSubsystem,
  updateSubsystem,
  useSubsystem,
} from "./ship.ts";
import {
  validateActionSequence,
  validateAllocateEnergyAction,
  validateDeallocateEnergyAction,
  validateRotateAction,
  validateCoastAction,
  validateBurnAction,
  validateFireWeaponAction,
  validateScanAction,
  validateWellTransferAction,
} from "./validators.ts";

export interface ProcessResult {
  success: boolean;
  state: GameState;
  events: EventDraft[];
  errors?: string[];
}

type Step = { state: GameState; events: EventDraft[] };

/**
 * A shot or scan declared at a ship that was destroyed earlier in the same
 * turn is simply not taken (nobody fires at debris). Targets that were never
 * valid still fail validation.
 */
function targetGone(state: GameState, targetId: string): boolean {
  const target = state.players.find((p) => p.id === targetId);
  return !!target && target.hasDeployed && isDestroyed(target.ship);
}

function withPlayer(state: GameState, playerId: string, update: (p: Player) => Player): GameState {
  return { ...state, players: state.players.map((p) => (p.id === playerId ? update(p) : p)) };
}

export function processActions(state: GameState, actions: PlayerAction[]): ProcessResult {
  const sequenceErrors = validateActionSequence(actions);
  if (sequenceErrors.length > 0)
    return { success: false, state, events: [], errors: sequenceErrors };

  let current = state;
  const events: EventDraft[] = [];

  const run = <A extends PlayerAction>(
    action: A,
    validate: (s: GameState, a: A) => string[],
    process: (s: GameState, a: A) => Step
  ): string[] | null => {
    const errors = validate(current, action);
    if (errors.length > 0) return errors;
    const step = process(current, action);
    current = step.state;
    events.push(...step.events);
    return null;
  };

  const deallocations = actions.filter(
    (a): a is DeallocateEnergyAction => a.type === "deallocate_energy"
  );
  const allocations = actions.filter(
    (a): a is AllocateEnergyAction => a.type === "allocate_energy"
  );
  const tactical = actions
    .filter(isTacticalAction)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

  for (const a of deallocations) {
    const err = run(a, validateDeallocateEnergyAction, processDeallocateEnergy);
    if (err) return { success: false, state, events: [], errors: err };
  }
  for (const a of allocations) {
    const err = run(a, validateAllocateEnergyAction, processAllocateEnergy);
    if (err) return { success: false, state, events: [], errors: err };
  }
  // Ships alive when the turn began: shots at one of these that dies mid-turn are skipped, not errors.
  const aliveAtStart = new Set(
    state.players.filter((p) => p.hasDeployed && !isDestroyed(p.ship)).map((p) => p.id)
  );
  let movedThisTurn = false;
  for (const a of tactical) {
    let err: string[] | null = null;
    switch (a.type) {
      case "rotate":
        err = run(a, validateRotateAction, processRotation);
        break;
      case "coast":
        err = run(a, validateCoastAction, processCoast);
        movedThisTurn = true;
        break;
      case "burn":
        err = run(a, validateBurnAction, processBurn);
        movedThisTurn = true;
        break;
      case "well_transfer":
        err = run(a, validateWellTransferAction, processWellTransfer);
        movedThisTurn = true;
        break;
      case "fire_weapon":
        if (aliveAtStart.has(a.data.targetPlayerId) && targetGone(current, a.data.targetPlayerId)) {
          events.push({
            type: "action_skipped",
            playerId: a.playerId,
            action: "fire_weapon",
            targetId: a.data.targetPlayerId,
            reason: "target_destroyed",
          });
          break;
        }
        err = run(a, validateFireWeaponAction, (s, fa: FireWeaponAction) =>
          processFireWeapon(s, fa, movedThisTurn)
        );
        break;
      case "scan":
        if (aliveAtStart.has(a.data.targetPlayerId) && targetGone(current, a.data.targetPlayerId)) {
          events.push({
            type: "action_skipped",
            playerId: a.playerId,
            action: "scan",
            targetId: a.data.targetPlayerId,
            reason: "target_destroyed",
          });
          break;
        }
        err = run(a, validateScanAction, (s, sa: ScanAction) => processScan(s, sa));
        break;
    }
    if (err) return { success: false, state, events: [], errors: err };
  }

  // Orbital drift is not optional: a turn without a movement action coasts.
  if (
    !tactical.some((a) => a.type === "coast" || a.type === "burn" || a.type === "well_transfer")
  ) {
    const active = current.players[current.activePlayerIndex];
    const err = run(
      {
        type: "coast",
        playerId: active.id,
        sequence: tactical.length + 1,
        data: { activateScoop: false },
      } as CoastAction,
      validateCoastAction,
      processCoast
    );
    if (err) return { success: false, state, events: [], errors: err };
  }

  return { success: true, state: current, events };
}

// ---------------------------------------------------------------------------
// Energy
// ---------------------------------------------------------------------------

function processAllocateEnergy(state: GameState, action: AllocateEnergyAction): Step {
  const next = withPlayer(state, action.playerId, (p) => {
    let ship = updateSubsystem(p.ship, action.data.subsystemId, (s) => ({
      allocatedEnergy: s.allocatedEnergy + action.data.amount,
      isPowered: true,
    }));
    ship = {
      ...ship,
      reactor: {
        ...ship.reactor,
        availableEnergy: ship.reactor.availableEnergy - action.data.amount,
      },
    };
    return { ...p, ship };
  });
  return {
    state: next,
    events: [
      {
        type: "energy_allocated",
        playerId: action.playerId,
        subsystemId: action.data.subsystemId,
        amount: action.data.amount,
      },
    ],
  };
}

function processDeallocateEnergy(state: GameState, action: DeallocateEnergyAction): Step {
  const next = withPlayer(state, action.playerId, (p) => {
    let ship = updateSubsystem(p.ship, action.data.subsystemId, (s) => {
      const remaining = s.allocatedEnergy - action.data.amount;
      return { allocatedEnergy: remaining, isPowered: remaining > 0 };
    });
    ship = {
      ...ship,
      reactor: {
        ...ship.reactor,
        availableEnergy: ship.reactor.availableEnergy + action.data.amount,
      },
    };
    return { ...p, ship };
  });
  return {
    state: next,
    events: [
      {
        type: "energy_deallocated",
        playerId: action.playerId,
        subsystemId: action.data.subsystemId,
        amount: action.data.amount,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

function processRotation(state: GameState, action: RotateAction): Step {
  const events: EventDraft[] = [];
  const next = withPlayer(state, action.playerId, (p) => {
    const used = useSubsystem(applyRotation(p.ship, action.data.targetFacing), p.id, "rotation");
    events.push(...used.events);
    return { ...p, ship: used.ship };
  });
  events.push({ type: "rotated", playerId: action.playerId, facing: action.data.targetFacing });
  return { state: next, events };
}

function processCoast(state: GameState, action: CoastAction): Step {
  const events: EventDraft[] = [];
  let massScooped = 0;
  let heat = 0;
  // A ship docked at a station is moored: it holds its berth and rides the
  // station at the end of the round instead of drifting now (RULES §Moored).
  const moored = isMooredAt(
    state.stations,
    positionOf(state.players.find((p) => p.id === action.playerId)!.ship)
  );
  const next = withPlayer(state, action.playerId, (p) => {
    let ship = applyOrbitalMovement(p.ship, moored);
    if (action.data.activateScoop) {
      const used = useSubsystem(ship, p.id, "scoop");
      ship = used.ship;
      heat = used.heat;
      events.push(...used.events);
      massScooped = Math.min(
        ringVelocity(ship.wellId, ship.ring),
        MAX_REACTION_MASS - ship.reactionMass
      );
      ship = { ...ship, reactionMass: ship.reactionMass + massScooped };
    }
    return { ...p, ship };
  });
  const to = positionOf(next.players.find((p) => p.id === action.playerId)!.ship);
  events.push({
    type: "coasted",
    playerId: action.playerId,
    to,
    scooped: action.data.activateScoop,
    heat,
    ...(moored ? { moored: true } : {}),
  });
  if (action.data.activateScoop) {
    // Fuel is behind the screen: the exact gain is the owner's business.
    events.push({
      type: "fuel_scooped",
      playerId: action.playerId,
      amount: massScooped,
      privateTo: [action.playerId],
    });
  }
  return { state: next, events };
}

function processBurn(state: GameState, action: BurnAction): Step {
  const events: EventDraft[] = [];
  const before = positionOf(state.players.find((p) => p.id === action.playerId)!.ship);
  let massSpent = 0;
  let heat = 0;
  const next = withPlayer(state, action.playerId, (p) => {
    const drifted = applyOrbitalMovement(p.ship);
    const burned = applyBurn(drifted, action.data.burnIntensity, action.data.sectorAdjustment ?? 0);
    massSpent = burned.massSpent;
    const used = useSubsystem(burned.ship, p.id, "engines");
    heat = used.heat;
    events.push(...used.events);
    return { ...p, ship: used.ship };
  });
  const to = positionOf(next.players.find((p) => p.id === action.playerId)!.ship);
  events.push({
    type: "burned",
    playerId: action.playerId,
    intensity: action.data.burnIntensity,
    from: before,
    to,
    massSpent,
    heat,
  });
  return { state: next, events };
}

function processWellTransfer(state: GameState, action: WellTransferAction): Step {
  const events: EventDraft[] = [];
  const player = state.players.find((p) => p.id === action.playerId)!;
  const from = positionOf(player.ship);
  const jump = findJump(from, action.data.destinationWellId)!;
  const sectorAdjustment = action.data.sectorAdjustment ?? 0;
  // Validated above: the phased landing is inside the arrival arc.
  const destination = phasedJumpDestination(jump, sectorAdjustment)!;
  let heat = 0;
  const refunded = hasWorkingCompressor(player.ship);
  // A compressor refunds the jump's own fuel; the phasing is paid either way.
  const massSpent = calculateJumpMassCost(sectorAdjustment, refunded);

  const next = withPlayer(state, action.playerId, (p) => {
    let ship = { ...p.ship, ...destination };
    if (massSpent > 0) ship = { ...ship, reactionMass: ship.reactionMass - massSpent };
    const used = useSubsystem(ship, p.id, "engines");
    ship = used.ship;
    heat = used.heat;
    events.push(...used.events);
    if (refunded) {
      for (const compressor of ship.subsystems.filter(
        (s) => s.type === "fuel_compressor" && !s.isBroken
      )) {
        const r = revealSubsystem(ship, p.id, compressor.id, "refunded_jump");
        ship = r.ship;
        events.push(...r.events);
      }
    }
    return { ...p, ship };
  });
  events.push({
    type: "jumped",
    playerId: action.playerId,
    from,
    to: destination,
    sectorAdjustment,
    massSpent,
    refunded,
    heat,
  });
  return { state: next, events };
}

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

function processFireWeapon(
  state: GameState,
  action: FireWeaponAction,
  movedThisTurn: boolean
): Step {
  const events: EventDraft[] = [];
  const players = [...state.players];
  const attackerIndex = players.findIndex((p) => p.id === action.playerId);
  const targetIndex = players.findIndex((p) => p.id === action.data.targetPlayerId);
  let attacker = players[attackerIndex];
  const weapon = findSubsystem(attacker.ship, action.data.subsystemId)!;
  if (!isWeaponType(weapon.type)) return { state, events };
  const config = getSubsystemConfig(weapon.type);
  const weaponType = weapon.type;

  const used = useSubsystem(attacker.ship, attacker.id, weapon.id, "fired");
  attacker = { ...attacker, ship: used.ship };
  events.push({
    type: "weapon_fired",
    attackerId: attacker.id,
    targetId: action.data.targetPlayerId,
    subsystemId: weapon.id,
    weaponType,
    heat: used.heat,
  });
  events.push(...used.events);

  let working: GameState = { ...state, players };

  if (weaponType === "missiles") {
    const missile = createMissile(
      working,
      attacker,
      action.data.targetPlayerId,
      action.data.criticalTarget,
      movedThisTurn
    );
    attacker = {
      ...attacker,
      ship: updateSubsystem(attacker.ship, weapon.id, (s) => ({ ammo: (s.ammo ?? 1) - 1 })),
    };
    players[attackerIndex] = attacker;
    working = { ...working, players, missiles: [...working.missiles, missile] };
    events.push({
      type: "missile_launched",
      ownerId: attacker.id,
      missileId: missile.id,
      targetId: action.data.targetPlayerId,
      at: positionOf(attacker.ship),
      criticalTarget: action.data.criticalTarget,
    });
  } else {
    players[attackerIndex] = attacker;
    const target = players[targetIndex];
    const roll = rollD10(working);
    const outcome = resolveAttack(
      target.ship,
      target.id,
      config.weaponStats!.damage,
      action.data.criticalTarget,
      roll,
      attacker.ship,
      attacker.id,
      config.weaponStats!.ignoresShields === true
    );
    players[targetIndex] = { ...target, ship: outcome.ship };
    events.push({
      type: "attack_resolved",
      attackerId: attacker.id,
      targetId: target.id,
      weaponType,
      roll,
      result: outcome.hitResult.result,
      damage: outcome.hitResult.damage,
      toHull: outcome.hitResult.damageToHull,
      toHeat: outcome.hitResult.damageToHeat,
      targetHullAfter: outcome.ship.hitPoints,
    });
    events.push(...outcome.events);
    if (outcome.hitResult.sensorAssistedCritical) {
      const revealed = revealSensors(attacker);
      attacker = revealed.player;
      players[attackerIndex] = attacker;
      events.push(...revealed.events);
    }
    if (isDestroyed(outcome.ship) && !isDestroyed(target.ship)) {
      events.push({
        type: "ship_destroyed",
        victimId: target.id,
        killerId: attacker.id,
        cause: "weapon",
      });
    }
    working = { ...working, players };
  }

  // Recoil.
  if (config.weaponStats?.hasRecoil) {
    if (action.data.compensateRecoil) {
      const compensated = useSubsystem(attacker.ship, attacker.id, "engines");
      const ship = {
        ...compensated.ship,
        reactionMass: compensated.ship.reactionMass - BURN_COSTS.soft.mass,
      };
      attacker = { ...attacker, ship };
      events.push(...compensated.events);
      events.push({
        type: "recoil",
        playerId: attacker.id,
        compensated: true,
        massSpent: BURN_COSTS.soft.mass,
        heat: compensated.heat,
      });
    } else {
      const pushed = attacker.ship.ring + (attacker.ship.facing === "prograde" ? 1 : -1);
      const ring = Math.max(1, Math.min(getMaxRing(attacker.ship.wellId), pushed)); // validated earlier; clamp defensively
      attacker = { ...attacker, ship: { ...attacker.ship, ring } };
      events.push({
        type: "recoil",
        playerId: attacker.id,
        compensated: false,
        to: positionOf(attacker.ship),
        massSpent: 0,
        heat: 0,
      });
    }
    players[attackerIndex] = attacker;
    working = { ...working, players };
  }

  return { state: working, events };
}
