import type {
  GameState,
  PlayerAction,
  TurnLogEntry,
  CoastAction,
  BurnAction,
  RotateAction,
  AllocateEnergyAction,
  DeallocateEnergyAction,
  FireWeaponAction,
  WellTransferAction,
  ShipState,
  RingConfig,
} from "../models/game.ts";
import {
  applyOrbitalMovement,
  initiateBurn,
  applyRotation,
  completeRingTransfer,
} from "./movement.ts";
import { applyDamageWithShields, getWeaponDamage } from "./damage.ts";
import { getMaxReactionMass } from "./loadout.ts";
import { rollD10 } from "../utils/rng.ts";
import {
  BURN_COSTS,
  WELL_TRANSFER_COSTS,
  mapSectorOnTransfer,
  SECTORS_PER_RING,
} from "../models/rings.ts";
import { getSubsystemConfig } from "../models/subsystems.ts";
import { fireMissile, getMissileAmmo } from "./missiles.ts";
import { getGravityWell, TRANSFER_POINTS } from "../models/gravityWells.ts";
import { addHeat } from "./heat.ts";
import { resetSubsystemUsage } from "./energy.ts";
import {
  validateActionSequence,
  validateAllocateEnergyAction,
  validateDeallocateEnergyAction,
  validateRotateAction,
  validateCoastAction,
  validateBurnAction,
  validateFireWeaponAction,
  validateWellTransferAction,
} from "./validators.ts";

export interface ProcessResult {
  success: boolean;
  gameState: GameState;
  logEntries: TurnLogEntry[];
  errors?: string[];
}

/**
 * Helper to validate and process an array of actions
 */
function validateAndProcessActions<T extends PlayerAction>(
  gameState: GameState,
  actions: T[],
  validate: (state: GameState, action: T) => string[],
  process: (state: GameState, action: T) => ProcessResult
): ProcessResult {
  let currentGameState = gameState;
  const logEntries: TurnLogEntry[] = [];

  for (const action of actions) {
    const validationErrors = validate(currentGameState, action);
    if (validationErrors.length > 0) {
      return {
        success: false,
        gameState,
        logEntries: [],
        errors: validationErrors,
      };
    }
    const result = process(currentGameState, action);
    currentGameState = result.gameState;
    logEntries.push(...result.logEntries);
  }

  return {
    success: true,
    gameState: currentGameState,
    logEntries,
  };
}


/**
 * Process all actions for the active player in the correct order
 *
 * NEW Turn sequence:
 * Phase 0 (Start of Turn - Automatic):
 *   0a. Calculate heat damage (excess heat above dissipation capacity)
 *   0b. Apply heat dissipation (remove heat up to dissipation capacity)
 *
 * Phase 1 (Fixed order - Energy Management):
 *   1. Energy Allocation (unlimited)
 *   2. Energy Deallocation (unlimited)
 *
 * Phase 2 (User-specified order - Tactical Actions):
 *   - Rotation (generates heat when executed)
 *   - Movement: coast or burn (burn generates heat when executed)
 *   - Weapon Firing (generates heat when fired, includes shield absorption and crits)
 *   (Order determined by sequence field on each action)
 *
 * Phase 3 (Fixed order - End of Turn):
 *   - Reset Subsystem Usage (prepare for next turn)
 *
 * Note: Heat is now generated when subsystems are USED, not from overclocking.
 */
export function processActions(
  gameState: GameState,
  actions: PlayerAction[]
): ProcessResult {
  const logEntries: TurnLogEntry[] = [];
  let currentGameState = gameState;
  const activePlayerIndex = gameState.activePlayerIndex;

  // Validate action sequence ordering
  const sequenceErrors = validateActionSequence(actions);
  if (sequenceErrors.length > 0) {
    return {
      success: false,
      gameState,
      logEntries: [],
      errors: sequenceErrors,
    };
  }

  // NOTE: Heat damage and reset are now handled in turns.ts when switching to next player
  // This ensures the player sees the damage BEFORE their turn starts

  // PHASE 1: Energy Management (fixed order, now unlimited)
  // IMPORTANT: Deallocations must be processed BEFORE allocations
  // so that freed energy is available for new allocations

  // Phase 1.1: Energy Deallocation (must come first to free up energy)
  const deallocateActions = actions.filter(
    (a) => a.type === "deallocate_energy"
  ) as DeallocateEnergyAction[];
  const deallocateResult = validateAndProcessActions(
    currentGameState,
    deallocateActions,
    validateDeallocateEnergyAction,
    processDeallocateEnergy
  );
  if (!deallocateResult.success) return deallocateResult;
  currentGameState = deallocateResult.gameState;
  logEntries.push(...deallocateResult.logEntries);

  // Phase 1.2: Energy Allocation (uses energy freed by deallocations)
  const allocateActions = actions.filter(
    (a) => a.type === "allocate_energy"
  ) as AllocateEnergyAction[];
  const allocateResult = validateAndProcessActions(
    currentGameState,
    allocateActions,
    validateAllocateEnergyAction,
    processAllocateEnergy
  );
  if (!allocateResult.success) return allocateResult;
  currentGameState = allocateResult.gameState;
  logEntries.push(...allocateResult.logEntries);

  // PHASE 2: Tactical Actions (user-specified order via sequence field)

  const tacticalActions = actions
    .filter(
      (a) =>
        a.type === "rotate" ||
        a.type === "coast" ||
        a.type === "burn" ||
        a.type === "fire_weapon" ||
        a.type === "well_transfer"
    )
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

  // Track whether movement has happened (for missile orbital skip logic)
  let movementHappened = false;

  for (const action of tacticalActions) {
    if (action.type === "rotate") {
      const rotateResult = validateAndProcessActions(
        currentGameState,
        [action as RotateAction],
        validateRotateAction,
        processRotation
      );
      if (!rotateResult.success) return rotateResult;
      currentGameState = rotateResult.gameState;
      logEntries.push(...rotateResult.logEntries);
    } else if (action.type === "coast") {
      const coastResult = validateAndProcessActions(
        currentGameState,
        [action as CoastAction],
        validateCoastAction,
        processCoast
      );
      if (!coastResult.success) return coastResult;
      currentGameState = coastResult.gameState;
      logEntries.push(...coastResult.logEntries);
      movementHappened = true;
    } else if (action.type === "burn") {
      const burnResult = validateAndProcessActions(
        currentGameState,
        [action as BurnAction],
        validateBurnAction,
        processBurn
      );
      if (!burnResult.success) return burnResult;
      currentGameState = burnResult.gameState;
      logEntries.push(...burnResult.logEntries);
      movementHappened = true;
    } else if (action.type === "fire_weapon") {
      const weaponResult = validateAndProcessActions(
        currentGameState,
        [action as FireWeaponAction],
        validateFireWeaponAction,
        processFireWeapon
      );
      if (!weaponResult.success) return weaponResult;
      currentGameState = weaponResult.gameState;
      logEntries.push(...weaponResult.logEntries);

      // If movement already happened, mark any new missiles to skip orbital this turn
      if (movementHappened) {
        const fireAction = action as FireWeaponAction;
        if (fireAction.data.weaponType === "missiles") {
          // Find newly added missiles (those without skipOrbitalThisTurn set yet)
          currentGameState = {
            ...currentGameState,
            missiles: currentGameState.missiles.map((m) =>
              m.turnFired === currentGameState.turn &&
              m.skipOrbitalThisTurn === undefined
                ? { ...m, skipOrbitalThisTurn: true }
                : m
            ),
          };
        }
      }
    } else if (action.type === "well_transfer") {
      const wellTransferResult = validateAndProcessActions(
        currentGameState,
        [action as WellTransferAction],
        validateWellTransferAction,
        processWellTransfer
      );
      if (!wellTransferResult.success) return wellTransferResult;
      currentGameState = wellTransferResult.gameState;
      logEntries.push(...wellTransferResult.logEntries);
      movementHappened = true;
    }
  }

  // PHASE 3: End of Turn (fixed order)

  // Reset subsystem usage flags for next turn
  const updatedPlayers = [...currentGameState.players];
  const currentPlayer = updatedPlayers[activePlayerIndex];
  updatedPlayers[activePlayerIndex] = {
    ...currentPlayer,
    ship: {
      ...currentPlayer.ship,
      subsystems: resetSubsystemUsage(currentPlayer.ship.subsystems),
    },
  };
  currentGameState = {
    ...currentGameState,
    players: updatedPlayers,
  };

  return {
    success: true,
    gameState: currentGameState,
    logEntries,
  };
}

/**
 * Process a coast action (orbital movement only)
 */
function processCoast(
  gameState: GameState,
  action: CoastAction
): ProcessResult {
  const playerIndex = gameState.players.findIndex(
    (p) => p.id === action.playerId
  );
  const player = gameState.players[playerIndex];

  // Apply orbital movement
  let updatedShip = applyOrbitalMovement(player.ship);

  // Apply fuel scoop if activated
  let heatGenerated = 0;
  if (action.data.activateScoop) {
    const well = getGravityWell(updatedShip.wellId);
    const ringConfig = well?.rings.find((r) => r.ring === updatedShip.ring);
    const velocity = ringConfig?.velocity || 1;

    // Recover reaction mass equal to velocity, capped at effective max
    const massRecovered = Math.min(
      velocity,
      getMaxReactionMass(updatedShip.subsystems) - updatedShip.reactionMass
    );
    updatedShip = {
      ...updatedShip,
      reactionMass: updatedShip.reactionMass + massRecovered,
    };

    // Generate heat from scoop (heat = allocated energy)
    const scoopSubsystem = updatedShip.subsystems.find(
      (s) => s.type === "scoop"
    );
    if (scoopSubsystem) {
      heatGenerated = scoopSubsystem.allocatedEnergy;
      updatedShip = addHeat(updatedShip, heatGenerated);
    }
  }

  const updatedPlayers = [...gameState.players];
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip };

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: "Coast",
      result: `Moved to sector ${updatedShip.sector}${action.data.activateScoop ? ` (scoop recovered ${Math.min(getGravityWell(updatedShip.wellId)?.rings.find((r) => r.ring === updatedShip.ring)?.velocity || 1, getMaxReactionMass(player.ship.subsystems) - player.ship.reactionMass)} mass)${heatGenerated > 0 ? ` (+${heatGenerated} heat)` : ""}` : ""}`,
    },
  ];

  return {
    success: true,
    gameState: { ...gameState, players: updatedPlayers },
    logEntries,
  };
}

/**
 * Process a burn action (initiate and complete transfer on same turn)
 */
function processBurn(gameState: GameState, action: BurnAction): ProcessResult {
  const playerIndex = gameState.players.findIndex(
    (p) => p.id === action.playerId
  );
  const player = gameState.players[playerIndex];

  // Apply orbital movement first, then initiate burn
  let updatedShip = applyOrbitalMovement(player.ship);
  updatedShip = initiateBurn(updatedShip, action);

  // Complete the transfer immediately (all transfers complete same turn)
  const destinationRing = updatedShip.transferState?.destinationRing;
  if (updatedShip.transferState) {
    updatedShip = completeRingTransfer(updatedShip);
  }

  // Generate heat from engines (heat = allocated energy)
  const enginesSubsystem = updatedShip.subsystems.find(
    (s) => s.type === "engines"
  );
  const heatGenerated = enginesSubsystem?.allocatedEnergy || 0;
  if (heatGenerated > 0) {
    updatedShip = addHeat(updatedShip, heatGenerated);
  }

  const updatedPlayers = [...gameState.players];
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip };

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: "Burn",
      result: `${action.data.burnIntensity} burn completed to ring ${destinationRing}, sector ${updatedShip.sector}${heatGenerated > 0 ? ` (+${heatGenerated} heat)` : ""}`,
    },
  ];

  return {
    success: true,
    gameState: { ...gameState, players: updatedPlayers },
    logEntries,
  };
}

/**
 * Process rotation action
 */
function processRotation(
  gameState: GameState,
  action: RotateAction
): ProcessResult {
  const playerIndex = gameState.players.findIndex(
    (p) => p.id === action.playerId
  );
  const player = gameState.players[playerIndex];

  let updatedShip = applyRotation(player.ship, action.data.targetFacing);

  // Mark rotation subsystem as used
  const rotationSubsystem = updatedShip.subsystems.find(
    (s) => s.type === "rotation"
  );
  const updatedSubsystems = updatedShip.subsystems.map((s) =>
    s.type === "rotation" ? { ...s, usedThisTurn: true } : s
  );

  updatedShip = {
    ...updatedShip,
    subsystems: updatedSubsystems,
  };

  // Generate heat from rotation (heat = allocated energy)
  const heatGenerated = rotationSubsystem?.allocatedEnergy || 0;
  if (heatGenerated > 0) {
    updatedShip = addHeat(updatedShip, heatGenerated);
  }

  const updatedPlayers = [...gameState.players];
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip };

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: "Rotate",
      result: `Rotated to ${action.data.targetFacing}${heatGenerated > 0 ? ` (+${heatGenerated} heat)` : ""}`,
    },
  ];

  return {
    success: true,
    gameState: { ...gameState, players: updatedPlayers },
    logEntries,
  };
}

/**
 * Process energy allocation action
 */
function processAllocateEnergy(
  gameState: GameState,
  action: AllocateEnergyAction
): ProcessResult {
  const playerIndex = gameState.players.findIndex(
    (p) => p.id === action.playerId
  );
  const player = gameState.players[playerIndex];

  const subsystemIndex = player.ship.subsystems.findIndex(
    (s) => s.type === action.data.subsystemType
  );
  const subsystem = player.ship.subsystems[subsystemIndex];
  const newAllocatedEnergy = subsystem.allocatedEnergy + action.data.amount;

  // Create new subsystems array with updated subsystem
  const updatedSubsystems = [...player.ship.subsystems];
  updatedSubsystems[subsystemIndex] = {
    ...subsystem,
    allocatedEnergy: newAllocatedEnergy,
    isPowered: newAllocatedEnergy > 0,
  };

  // Update reactor and ship
  const updatedShip = {
    ...player.ship,
    subsystems: updatedSubsystems,
    reactor: {
      ...player.ship.reactor,
      availableEnergy: player.ship.reactor.availableEnergy - action.data.amount,
    },
  };

  const updatedPlayers = [...gameState.players];
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip };

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: "Allocate Energy",
      result: `+${action.data.amount} to ${action.data.subsystemType}`,
    },
  ];

  return {
    success: true,
    gameState: { ...gameState, players: updatedPlayers },
    logEntries,
  };
}

/**
 * Process energy deallocation action
 */
function processDeallocateEnergy(
  gameState: GameState,
  action: DeallocateEnergyAction
): ProcessResult {
  const playerIndex = gameState.players.findIndex(
    (p) => p.id === action.playerId
  );
  const player = gameState.players[playerIndex];

  const subsystemIndex = player.ship.subsystems.findIndex(
    (s) => s.type === action.data.subsystemType
  );
  const subsystem = player.ship.subsystems[subsystemIndex];
  const amountToReturn = Math.min(
    action.data.amount,
    subsystem.allocatedEnergy
  );
  const newAllocatedEnergy = subsystem.allocatedEnergy - amountToReturn;

  // Create new subsystems array with updated subsystem
  const updatedSubsystems = [...player.ship.subsystems];
  updatedSubsystems[subsystemIndex] = {
    ...subsystem,
    allocatedEnergy: newAllocatedEnergy,
    isPowered: newAllocatedEnergy > 0,
  };

  // Update reactor (energy returns WITHOUT generating heat - heat only generated from overclocking)
  const updatedShip = {
    ...player.ship,
    subsystems: updatedSubsystems,
    reactor: {
      ...player.ship.reactor,
      availableEnergy: player.ship.reactor.availableEnergy + amountToReturn,
    },
  };

  const updatedPlayers = [...gameState.players];
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip };

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: "Deallocate Energy",
      result: `Deallocated ${amountToReturn} from ${action.data.subsystemType} (${newAllocatedEnergy} remaining)`,
    },
  ];

  return {
    success: true,
    gameState: { ...gameState, players: updatedPlayers },
    logEntries,
  };
}

/**
 * Process well transfer action (complete transfer between gravity wells immediately)
 * Well transfers happen instantly on the same turn - ship changes wells and moves with destination ring's velocity
 */
function processWellTransfer(
  gameState: GameState,
  action: WellTransferAction
): ProcessResult {
  const playerIndex = gameState.players.findIndex(
    (p) => p.id === action.playerId
  );
  const player = gameState.players[playerIndex];

  // Find the transfer point
  const transferPoint = TRANSFER_POINTS.find(
    (tp) =>
      tp.fromWellId === player.ship.wellId &&
      tp.fromSector === player.ship.sector &&
      tp.toWellId === action.data.destinationWellId
  );

  if (!transferPoint) {
    return {
      success: false,
      gameState,
      logEntries: [],
      errors: ["Transfer point no longer available"],
    };
  }

  // Get destination well and ring config for orbital movement
  const destinationWell = getGravityWell(action.data.destinationWellId);
  if (!destinationWell) {
    return {
      success: false,
      gameState,
      logEntries: [],
      errors: ["Destination well not found"],
    };
  }

  const destinationRing = destinationWell.rings.find(
    (r: RingConfig) => r.ring === transferPoint.toRing
  );
  if (!destinationRing) {
    return {
      success: false,
      gameState,
      logEntries: [],
      errors: ["Destination ring not found"],
    };
  }

  // Consume reaction mass (fuel compressor scoops during jump, recovering the cost)
  const hasFuelCompressor = player.ship.subsystems.some(s => s.type === "fuel_compressor");
  const massAfterTransfer = player.ship.reactionMass - WELL_TRANSFER_COSTS.mass;
  const newReactionMass = hasFuelCompressor
    ? Math.min(massAfterTransfer + WELL_TRANSFER_COSTS.mass, getMaxReactionMass(player.ship.subsystems))
    : massAfterTransfer;

  // Transfer to destination well immediately
  // Engines are used for the transfer burn — generate heat
  const enginesSubsystem = player.ship.subsystems.find(s => s.type === "engines");
  const engineHeat = enginesSubsystem ? enginesSubsystem.allocatedEnergy : 0;

  const updatedShip: ShipState = {
    ...player.ship,
    wellId: action.data.destinationWellId,
    ring: transferPoint.toRing,
    sector: transferPoint.toSector,
    reactionMass: newReactionMass,
    heat: {
      currentHeat: player.ship.heat.currentHeat + engineHeat,
    },
    subsystems: player.ship.subsystems.map(s =>
      s.type === "engines" ? { ...s, usedThisTurn: true } : s
    ),
    // Facing is preserved (sector numbering handles direction reversal)
  };

  const updatedPlayers = [...gameState.players];
  updatedPlayers[playerIndex] = { ...player, ship: updatedShip };

  // Get well names for logging
  const fromWell = getGravityWell(player.ship.wellId);
  const toWell = getGravityWell(action.data.destinationWellId);

  const logEntries: TurnLogEntry[] = [
    {
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: "Well Transfer",
      result: `Transferred from ${fromWell?.name || player.ship.wellId} to ${toWell?.name || action.data.destinationWellId} R${updatedShip.ring}S${updatedShip.sector}`,
    },
  ];

  return {
    success: true,
    gameState: { ...gameState, players: updatedPlayers },
    logEntries,
  };
}

/**
 * Process weapon firing action
 */
function processFireWeapon(
  gameState: GameState,
  action: FireWeaponAction
): ProcessResult {
  const playerIndex = gameState.players.findIndex(
    (p) => p.id === action.playerId
  );
  const player = gameState.players[playerIndex];
  const logEntries: TurnLogEntry[] = [];

  const weaponConfig = getSubsystemConfig(action.data.weaponType);
  // Find weapon subsystem: use subsystemIndex if provided, otherwise find by type
  const weaponSubsystemIndex =
    action.data.subsystemIndex !== undefined
      ? action.data.subsystemIndex
      : player.ship.subsystems.findIndex((s) => s.type === action.data.weaponType);
  const weaponSubsystem = player.ship.subsystems[weaponSubsystemIndex];
  const heatGenerated = weaponSubsystem?.allocatedEnergy || 0;

  // Special handling for missiles: create missile entity instead of dealing instant damage
  if (action.data.weaponType === "missiles") {
    const targetId = action.data.targetPlayerIds[0]; // Missiles target one player at a time
    const targetPlayer = gameState.players.find((p) => p.id === targetId);

    if (!targetPlayer) {
      return {
        success: false,
        gameState,
        logEntries: [],
        errors: ["Target player not found"],
      };
    }

    const { missile, error } = fireMissile(gameState, player.id, targetId);

    if (error || !missile) {
      return {
        success: false,
        gameState,
        logEntries: [],
        errors: [error || "Failed to fire missile"],
      };
    }

    // Add missile to game state, decrement ammo on missiles subsystem, mark used, and generate heat
    const currentAmmo = getMissileAmmo(player.ship.subsystems);
    let updatedAttackerShip = {
      ...player.ship,
      subsystems: player.ship.subsystems.map((s, i) =>
        i === weaponSubsystemIndex
          ? { ...s, usedThisTurn: true, ammo: currentAmmo - 1 }
          : s
      ),
    };

    // Generate heat from firing
    if (heatGenerated > 0) {
      updatedAttackerShip = addHeat(updatedAttackerShip, heatGenerated);
    }

    const updatedPlayers = gameState.players.map((p) =>
      p.id === player.id ? { ...p, ship: updatedAttackerShip } : p
    );

    logEntries.push({
      turn: gameState.turn,
      playerId: player.id,
      playerName: player.name,
      action: "Fire Missile",
      result: `Fired missile at ${targetPlayer.name} (${currentAmmo - 1} missiles remaining)${heatGenerated > 0 ? ` (+${heatGenerated} heat)` : ""}`,
    });

    return {
      success: true,
      gameState: {
        ...gameState,
        missiles: [...gameState.missiles, missile],
        players: updatedPlayers,
      },
      logEntries,
    };
  }

  // Regular weapons (laser, railgun): instant damage with shields and criticals
  const damage = getWeaponDamage(action.data.weaponType);

  // Apply damage to each target
  const updatedPlayers = [...gameState.players];

  // Update attacker's ship first (mark specific weapon instance used, generate heat)
  let updatedAttackerShip = {
    ...player.ship,
    subsystems: player.ship.subsystems.map((s, i) =>
      i === weaponSubsystemIndex ? { ...s, usedThisTurn: true } : s
    ),
  };

  // Generate heat from firing
  if (heatGenerated > 0) {
    updatedAttackerShip = addHeat(updatedAttackerShip, heatGenerated);
  }

  updatedPlayers[playerIndex] = { ...player, ship: updatedAttackerShip };

  for (const targetId of action.data.targetPlayerIds) {
    const targetIndex = updatedPlayers.findIndex((p) => p.id === targetId);
    if (targetIndex === -1) continue;

    const target = updatedPlayers[targetIndex];
    if (target.ship.hitPoints <= 0) continue; // Already destroyed

    // Apply damage with d10 hit resolution
    // Pass attacker ship to calculate critical chance (sensor array bonus)
    const damageRoll = rollD10(gameState);
    const { ship: updatedTargetShip, hitResult } = applyDamageWithShields(
      target.ship,
      damage,
      action.data.criticalTarget,
      damageRoll,
      updatedAttackerShip
    );
    updatedPlayers[targetIndex] = { ...target, ship: updatedTargetShip };

    // Log based on hit result
    if (hitResult.result === "miss") {
      // Roll 1 - Miss
      logEntries.push({
        turn: gameState.turn,
        playerId: player.id,
        playerName: player.name,
        action: `${weaponConfig.name} Miss`,
        result:
          `Rolled ${hitResult.roll} - missed ${target.name}!` +
          (heatGenerated > 0 ? ` (+${heatGenerated} heat to attacker)` : ""),
      });
    } else {
      // Roll 2-10 - Hit or Critical
      let resultMsg = "";
      if (hitResult.damageToHeat > 0) {
        resultMsg = `Rolled ${hitResult.roll} - dealt ${damage} damage to ${target.name} (${hitResult.damageToHeat} absorbed by shields → heat, ${hitResult.damageToHull} to hull, ${updatedTargetShip.hitPoints}/${target.ship.maxHitPoints} HP)`;
      } else {
        resultMsg = `Rolled ${hitResult.roll} - dealt ${damage} damage to ${target.name} (${updatedTargetShip.hitPoints}/${target.ship.maxHitPoints} HP)`;
      }

      logEntries.push({
        turn: gameState.turn,
        playerId: player.id,
        playerName: player.name,
        action:
          hitResult.result === "critical"
            ? `${weaponConfig.name} CRITICAL!`
            : `${weaponConfig.name} Hit`,
        result:
          resultMsg +
          (heatGenerated > 0 ? ` (+${heatGenerated} heat to attacker)` : ""),
      });

      // Log critical hit effect if it occurred
      if (hitResult.result === "critical" && hitResult.criticalEffect) {
        const critEffect = hitResult.criticalEffect;
        logEntries.push({
          turn: gameState.turn,
          playerId: player.id,
          playerName: player.name,
          action: "Subsystem BROKEN!",
          result: `${target.name}'s ${getSubsystemConfig(critEffect.targetSubsystem).name} was destroyed! (${critEffect.energyLost} energy → ${critEffect.heatAdded} heat)`,
        });
      }

      if (updatedTargetShip.hitPoints <= 0) {
        logEntries.push({
          turn: gameState.turn,
          playerId: target.id,
          playerName: target.name,
          action: "Ship Destroyed",
          result: `${target.name} has been destroyed!`,
        });
      }
    }
  }

  // Recoil: shift attacker 1 ring in facing direction (like a soft burn)
  if (weaponConfig.weaponStats?.hasRecoil) {
    const attackerIndex = playerIndex;
    const attacker = updatedPlayers[attackerIndex];
    const recoilDirection = attacker.ship.facing === "prograde" ? 1 : -1;

    if (action.data.compensateRecoil) {
      // Engine compensation: cancel recoil, but costs 1 mass and generates engine heat
      const engines = attacker.ship.subsystems.find(s => s.type === "engines");
      const engineHeat = engines ? engines.allocatedEnergy : 0;
      const compensatedShip: ShipState = {
        ...attacker.ship,
        reactionMass: attacker.ship.reactionMass - BURN_COSTS.soft.mass,
        heat: { currentHeat: attacker.ship.heat.currentHeat + engineHeat },
        subsystems: attacker.ship.subsystems.map(s =>
          s.type === "engines" ? { ...s, usedThisTurn: true } : s
        ),
      };
      updatedPlayers[attackerIndex] = { ...attacker, ship: compensatedShip };
      logEntries.push({
        turn: gameState.turn,
        playerId: attacker.id,
        playerName: attacker.name,
        action: "Recoil Compensated",
        result: `Engines fired to compensate ${weaponConfig.name} recoil (-1 mass, +${engineHeat} heat)`,
      });
    } else {
      // Uncompensated recoil: drift 1 ring in facing direction
      const newRing = attacker.ship.ring + recoilDirection;
      const newSector = mapSectorOnTransfer(attacker.ship.ring, newRing, attacker.ship.sector);
      const recoiledShip: ShipState = {
        ...attacker.ship,
        ring: newRing,
        sector: newSector % SECTORS_PER_RING,
      };
      updatedPlayers[attackerIndex] = { ...attacker, ship: recoiledShip };
      logEntries.push({
        turn: gameState.turn,
        playerId: attacker.id,
        playerName: attacker.name,
        action: "Weapon Recoil",
        result: `${weaponConfig.name} recoil pushed ship to Ring ${newRing} (${attacker.ship.facing === "prograde" ? "outward" : "inward"})`,
      });
    }
  }

  return {
    success: true,
    gameState: { ...gameState, players: updatedPlayers },
    logEntries,
  };
}
