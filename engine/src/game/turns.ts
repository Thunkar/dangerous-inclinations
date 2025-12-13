import type {
  GameState,
  TurnLogEntry,
  PlayerAction,
  GameStatus,
} from "../models/game";
import { processActions } from "./actionProcessors";
import { processMissiles } from "./missiles";
import { calculateHeatDamage, resetHeat } from "./heat";
import { applyDirectDamage } from "./damage";
import {
  processDestroyMissionCompletion,
  processCargoMissionCompletion,
  checkForWinner,
} from "./missions/missionChecks";
import { processCargoAtStation } from "./cargo";
import { updateStationPositions } from "./stations";
import { processRespawn, needsRespawn } from "./respawn";
import { GRAVITY_WELLS } from "../models/gravityWells";

/**
 * Result of executing a complete game turn
 */
export interface TurnResult {
  gameState: GameState;
  logEntries: TurnLogEntry[];
  errors?: string[];
}

/**
 * Create a deep copy snapshot of game state for validation
 */
function createGameStateSnapshot(gameState: GameState): GameState {
  return {
    ...gameState,
    players: gameState.players.map((player) => ({
      ...player,
      ship: {
        ...player.ship,
        subsystems: player.ship.subsystems.map((s) => ({ ...s })),
        reactor: { ...player.ship.reactor },
        heat: { ...player.ship.heat },
        transferState: player.ship.transferState
          ? { ...player.ship.transferState }
          : null,
      },
      // Deep copy mission system fields
      missions: player.missions.map((m) => ({ ...m })),
      cargo: player.cargo.map((c) => ({ ...c })),
    })),
    turnLog: [...gameState.turnLog],
    missiles: gameState.missiles
      ? gameState.missiles.map((m) => ({ ...m }))
      : [], // Deep copy missiles array
    stations: gameState.stations
      ? gameState.stations.map((s) => ({ ...s }))
      : [], // Deep copy stations
  };
}

/**
 * Execute a complete game turn for the active player with snapshot-based validation
 *
 * @param gameState - Current game state
 * @param actions - Array of actions for the active player to execute
 *
 * Validation flow:
 * 1. Create a snapshot of the entire game state
 * 2. Process all actions on the snapshot (validation + execution in one step)
 * 3. If successful, use the snapshot as the new game state
 * 4. If errors occur, discard snapshot and return original state with errors
 *
 * Execution phases:
 * 1. Process actions in priority order:
 *    - Energy allocation
 *    - Energy deallocation
 *    - Heat venting
 *    - Rotation (if needed)
 *    - Movement (coast or burn)
 *    - Weapon firing (all simultaneous)
 *    - Heat damage (from previous turns)
 *    - Heat generation (from this turn)
 * 2. Move to next player
 * 3. Prepare next player's turn (resolve their transfer if arriving)
 */
export function executeTurn(
  gameState: GameState,
  actions: PlayerAction[]
): TurnResult {
  const activePlayerIndex = gameState.activePlayerIndex;
  let activePlayer = gameState.players[activePlayerIndex];
  const allLogEntries: TurnLogEntry[] = [];

  // Handle respawn at the start of a dead player's turn
  let workingState = gameState;
  if (needsRespawn(activePlayer)) {
    workingState = processRespawn(workingState, activePlayer.id);
    activePlayer = workingState.players[activePlayerIndex];
    allLogEntries.push({
      turn: workingState.turn,
      playerId: activePlayer.id,
      playerName: activePlayer.name,
      action: "Respawn",
      result: `Respawned at BH Ring 4, Sector ${activePlayer.ship.sector}`,
    });
  }

  // Validate all actions belong to the active player
  const wrongPlayerActions = actions.filter(
    (a) => a.playerId !== activePlayer.id
  );
  if (wrongPlayerActions.length > 0) {
    return {
      gameState,
      logEntries: [],
      errors: ["All actions must belong to the active player"],
    };
  }

  // Create a snapshot of the game state
  const snapshot = createGameStateSnapshot(workingState);

  // Process actions on the snapshot (validation + execution in one step)
  const processResult = processActions(snapshot, actions);

  // If processing failed, discard snapshot and return original state
  if (!processResult.success) {
    return {
      gameState,
      logEntries: [],
      errors: processResult.errors || ["Failed to process actions"],
    };
  }

  // Success - use the snapshot as the new game state
  let updatedGameState = processResult.gameState;
  allLogEntries.push(...processResult.logEntries);

  // Process missiles owned by the active player (after their actions complete)
  if (updatedGameState.missiles.length > 0) {
    const playerMissiles = updatedGameState.missiles.filter(
      (m) => m.ownerId === activePlayer.id
    );
    if (playerMissiles.length > 0) {
      const missileResult = processMissiles(updatedGameState, activePlayer.id);
      updatedGameState = missileResult.gameState;
      allLogEntries.push(...missileResult.logEntries);
    }
  }

  // Check for destroyed ships and process destroy mission completion
  // (only in active phase with missions)
  if (
    updatedGameState.phase === "active" &&
    updatedGameState.stations.length > 0
  ) {
    for (const player of updatedGameState.players) {
      if (player.ship.hitPoints <= 0) {
        // Check if any player had a destroy mission for this player
        const beforeCompletionCount = updatedGameState.players.reduce(
          (sum, p) => sum + p.completedMissionCount,
          0
        );
        updatedGameState = processDestroyMissionCompletion(
          updatedGameState,
          player.id
        );
        const afterCompletionCount = updatedGameState.players.reduce(
          (sum, p) => sum + p.completedMissionCount,
          0
        );

        if (afterCompletionCount > beforeCompletionCount) {
          // Find who completed the mission
          const completingPlayer = updatedGameState.players.find(
            (p) =>
              p.completedMissionCount >
              (workingState.players.find((gp) => gp.id === p.id)
                ?.completedMissionCount ?? 0)
          );
          if (completingPlayer) {
            allLogEntries.push({
              turn: updatedGameState.turn,
              playerId: completingPlayer.id,
              playerName: completingPlayer.name,
              action: "Mission Complete",
              result: `Completed destroy mission: ${player.name} destroyed`,
            });
          }
        }
      }
    }

    // Process cargo pickup/delivery for the active player after movement
    const cargoResult = processCargoAtStation(
      updatedGameState.players[activePlayerIndex],
      updatedGameState.stations
    );

    if (
      cargoResult.pickedUpCargo.length > 0 ||
      cargoResult.deliveredCargo.length > 0
    ) {
      const updatedPlayers = [...updatedGameState.players];
      updatedPlayers[activePlayerIndex] = cargoResult.player;
      updatedGameState = { ...updatedGameState, players: updatedPlayers };

      // Log cargo events
      for (const msg of cargoResult.logMessages) {
        allLogEntries.push({
          turn: updatedGameState.turn,
          playerId: activePlayer.id,
          playerName: activePlayer.name,
          action: "Cargo",
          result: msg,
        });
      }

      // Check for cargo mission completion
      updatedGameState = processCargoMissionCompletion(
        updatedGameState,
        activePlayer.id
      );
    }
  }

  // Move to next player
  let nextPlayerIndex =
    (workingState.activePlayerIndex + 1) % updatedGameState.players.length;
  let isNewRound = nextPlayerIndex === 0;

  // Update station positions at the end of each round
  if (isNewRound && updatedGameState.stations.length > 0) {
    updatedGameState = {
      ...updatedGameState,
      stations: updateStationPositions(
        updatedGameState.stations,
        GRAVITY_WELLS
      ),
    };
    allLogEntries.push({
      turn: updatedGameState.turn,
      playerId: "system",
      playerName: "System",
      action: "Station Movement",
      result: "All stations advanced 4 sectors in their orbits",
    });
  }

  updatedGameState = {
    ...updatedGameState,
    turn: isNewRound ? workingState.turn + 1 : workingState.turn,
    activePlayerIndex: nextPlayerIndex,
    turnLog: [...workingState.turnLog, ...allLogEntries],
  };

  // Apply heat damage to the NEXT player at the start of their turn
  // This happens BEFORE they see their turn, so they see the damage immediately
  const nextPlayer = updatedGameState.players[nextPlayerIndex];
  if (nextPlayer.ship.hitPoints > 0) {
    const heatDamage = calculateHeatDamage(nextPlayer.ship);

    if (heatDamage > 0) {
      const updatedPlayers = [...updatedGameState.players];
      const damagedShip = applyDirectDamage(nextPlayer.ship, heatDamage);
      updatedPlayers[nextPlayerIndex] = { ...nextPlayer, ship: damagedShip };
      updatedGameState = { ...updatedGameState, players: updatedPlayers };

      allLogEntries.push({
        turn: updatedGameState.turn,
        playerId: nextPlayer.id,
        playerName: nextPlayer.name,
        action: "Heat Damage",
        result: `Took ${heatDamage} hull damage from excess heat (${nextPlayer.ship.heat.currentHeat} heat - ${nextPlayer.ship.dissipationCapacity} dissipation = ${heatDamage} damage)`,
      });

      // Update the turnLog with the new entry
      updatedGameState = {
        ...updatedGameState,
        turnLog: [
          ...updatedGameState.turnLog.slice(0, -allLogEntries.length + 1),
          ...allLogEntries,
        ],
      };
    }

    // Reset heat for the next player (after damage is applied)
    {
      const updatedPlayers = [...updatedGameState.players];
      const playerToReset = updatedPlayers[nextPlayerIndex];
      const heatBefore = playerToReset.ship.heat.currentHeat;
      const resetShip = resetHeat(playerToReset.ship);
      updatedPlayers[nextPlayerIndex] = { ...playerToReset, ship: resetShip };
      updatedGameState = { ...updatedGameState, players: updatedPlayers };

      if (heatBefore > 0) {
        allLogEntries.push({
          turn: updatedGameState.turn,
          playerId: nextPlayer.id,
          playerName: nextPlayer.name,
          action: "Heat Reset",
          result: `Cleared ${heatBefore} heat (dissipation capacity: ${nextPlayer.ship.dissipationCapacity})`,
        });
      }
    }
  }

  // Check for win/loss conditions
  updatedGameState = checkGameStatus(updatedGameState);

  // All transfers complete immediately, no need to resolve on turn start

  return {
    gameState: updatedGameState,
    logEntries: allLogEntries,
  };
}

/**
 * Check for win/loss conditions
 * In mission mode: First to complete 3 missions wins
 * In legacy mode: Last ship standing wins
 * Note: Dead players are NOT removed from the array - they stay for UI/history purposes
 */
function checkGameStatus(gameState: GameState): GameState {
  // Don't check if game is already over
  if (gameState.status !== "active") {
    return gameState;
  }

  // Check for mission-based victory (3 completed missions)
  const missionWinner = checkForWinner(gameState);
  if (missionWinner) {
    const humanPlayer = gameState.players[0];

    return {
      ...gameState,
      phase: "ended",
      status: missionWinner === humanPlayer.id ? "victory" : "defeat",
      winnerId: missionWinner,
    };
  }

  return gameState;
}
