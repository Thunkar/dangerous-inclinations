/**
 * Mission Completion Checks for Dangerous Inclinations
 *
 * Pure functions to check if missions have been completed.
 * Called after relevant game events (ship destruction, cargo delivery).
 */

import type { GameState, Player, Station } from "../../models/game";
import type {
  Mission,
  DestroyShipMission,
  DeliverCargoMission,
  InterceptTransmissionMission,
  MissionCheckResult,
  Cargo,
} from "../../models/missions";
import {
  isDestroyShipMission,
  isDeliverCargoMission,
  isInterceptTransmissionMission,
} from "../../models/missions";

/** Sectors in outermost ring (Ring 5 transfer ring; Ring 3 is used for intercept range) */
const INTERCEPT_SECTOR_RANGE = 3;

/**
 * Check if a destroy ship mission is complete
 * Complete when the target player's ship HP reached 0
 * Note: This should be called when a ship is destroyed, before respawn
 */
export function checkDestroyMission(
  mission: DestroyShipMission,
  destroyedPlayerId: string
): boolean {
  return mission.targetPlayerId === destroyedPlayerId;
}

/**
 * Check if a cargo mission is complete
 * Complete when:
 * 1. Cargo has been picked up (isPickedUp = true)
 * 2. Player is at the delivery station
 */
export function checkCargoMission(
  mission: DeliverCargoMission,
  player: Player,
  stations: Station[]
): boolean {
  // Find the cargo for this mission
  const cargo = player.cargo.find((c) => c.missionId === mission.id);
  if (!cargo || !cargo.isPickedUp) {
    return false;
  }

  // Check if player is at the delivery station
  const deliveryStation = stations.find(
    (s) => s.planetId === mission.deliveryPlanetId
  );
  if (!deliveryStation) {
    return false;
  }

  return (
    player.ship.wellId === mission.deliveryPlanetId &&
    player.ship.ring === deliveryStation.ring &&
    player.ship.sector === deliveryStation.sector
  );
}

/**
 * Calculate the circular sector distance between two sectors in a ring
 */
function sectorDistance(sectorA: number, sectorB: number, totalSectors: number): number {
  const diff = Math.abs(sectorA - sectorB);
  return Math.min(diff, totalSectors - diff);
}

/**
 * Check if the scan conditions for an intercept transmission mission are met.
 * Conditions:
 * - Same well (wellId)
 * - Same ring
 * - Within ±INTERCEPT_SECTOR_RANGE sectors (circular distance)
 * - Spy's sensor_array is powered (not broken)
 */
export function checkInterceptScanConditions(
  mission: InterceptTransmissionMission,
  spy: Player,
  gameState: GameState
): boolean {
  if (mission.scanAcquired || mission.isCompleted) return false;

  const target = gameState.players.find((p) => p.id === mission.targetPlayerId);
  if (!target) return false;

  const spyShip = spy.ship;
  const targetShip = target.ship;

  // Must be in the same gravity well and same ring
  if (spyShip.wellId !== targetShip.wellId || spyShip.ring !== targetShip.ring) {
    return false;
  }

  // Get total sectors for this ring (from the well's ring config)
  // Ring sectors: ring 1=6, ring 2=12, ring 3=24, ring 4=48, ring 5=96
  const totalSectors = 6 * Math.pow(2, spyShip.ring - 1);

  // Must be within ±3 sectors
  if (sectorDistance(spyShip.sector, targetShip.sector, totalSectors) > INTERCEPT_SECTOR_RANGE) {
    return false;
  }

  // sensor_array must be powered (and not broken)
  const sensorArray = spyShip.subsystems.find(
    (s) => s.type === "sensor_array" && s.isPowered && !s.isBroken
  );
  if (!sensorArray) return false;

  return true;
}

/**
 * Process the intercept scan for all active players.
 * For each player with an intercept mission whose scan conditions are met,
 * mark scanAcquired and add scan_data cargo to their inventory.
 */
export function processInterceptScans(gameState: GameState): {
  gameState: GameState;
  scanEvents: Array<{ spyId: string; targetId: string }>;
} {
  if (gameState.phase !== "active") return { gameState, scanEvents: [] };

  const scanEvents: Array<{ spyId: string; targetId: string }> = [];

  const updatedPlayers = gameState.players.map((player) => {
    let updatedPlayer = player;

    for (const mission of player.missions) {
      if (!isInterceptTransmissionMission(mission)) continue;
      if (mission.scanAcquired || mission.isCompleted) continue;

      if (checkInterceptScanConditions(mission, player, gameState)) {
        // Mark scan acquired on mission
        const updatedMissions = updatedPlayer.missions.map((m) =>
          m.id === mission.id
            ? { ...m, scanAcquired: true } as InterceptTransmissionMission
            : m
        );

        // Add scan_data cargo to inventory (already picked up — no station visit needed)
        const scanCargo: Cargo = {
          id: mission.scanCargoId,
          missionId: mission.id,
          type: "scan_data",
          pickupPlanetId: player.ship.wellId,
          deliveryPlanetId: "any",
          isPickedUp: true,
        };

        updatedPlayer = {
          ...updatedPlayer,
          missions: updatedMissions,
          cargo: [...updatedPlayer.cargo, scanCargo],
        };

        scanEvents.push({ spyId: player.id, targetId: mission.targetPlayerId });
      }
    }

    return updatedPlayer;
  });

  return {
    gameState: { ...gameState, players: updatedPlayers },
    scanEvents,
  };
}

/**
 * Process intercept transmission mission completion for a player.
 * Called after cargo delivery — pass the delivered mission IDs directly,
 * since cargo has already been removed from inventory.
 */
export function processInterceptMissionCompletion(
  gameState: GameState,
  playerId: string,
  deliveredMissionIds: string[]
): GameState {
  if (deliveredMissionIds.length === 0) return gameState;

  const playerIndex = gameState.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1) return gameState;

  const player = gameState.players[playerIndex];
  let completedCount = 0;

  const deliveredSet = new Set(deliveredMissionIds);

  const updatedMissions = player.missions.map((mission) => {
    if (
      isInterceptTransmissionMission(mission) &&
      !mission.isCompleted &&
      mission.scanAcquired &&
      deliveredSet.has(mission.id)
    ) {
      completedCount++;
      return { ...mission, isCompleted: true };
    }
    return mission;
  });

  if (completedCount > 0) {
    const updatedPlayers = [...gameState.players];
    updatedPlayers[playerIndex] = {
      ...player,
      missions: updatedMissions,
      completedMissionCount: player.completedMissionCount + completedCount,
    };
    return { ...gameState, players: updatedPlayers };
  }

  return gameState;
}

/**
 * Process mission completion for a destroyed player
 * Checks all players' destroy missions against the destroyed player
 * Returns updated players with completed missions marked
 */
export function processDestroyMissionCompletion(
  gameState: GameState,
  destroyedPlayerId: string
): GameState {
  const updatedPlayers = gameState.players.map((player) => {
    // Check each mission for completion
    let missionCompleted = false;
    const updatedMissions = player.missions.map((mission) => {
      if (
        isDestroyShipMission(mission) &&
        !mission.isCompleted &&
        checkDestroyMission(mission, destroyedPlayerId)
      ) {
        missionCompleted = true;
        return { ...mission, isCompleted: true };
      }
      return mission;
    });

    if (missionCompleted) {
      return {
        ...player,
        missions: updatedMissions,
        completedMissionCount: player.completedMissionCount + 1,
      };
    }

    return player;
  });

  return { ...gameState, players: updatedPlayers };
}

/**
 * Process cargo mission completion for a player.
 * Called after cargo delivery — pass the delivered mission IDs directly,
 * since the cargo has already been removed from inventory by processCargoAtStation.
 * Handles both deliver_cargo and intercept_transmission (scan_data delivery).
 */
export function processCargoMissionCompletion(
  gameState: GameState,
  playerId: string,
  deliveredMissionIds: string[]
): GameState {
  if (deliveredMissionIds.length === 0) return gameState;

  let updatedState = gameState;

  // Handle standard cargo missions
  const playerIndex = gameState.players.findIndex((p) => p.id === playerId);
  if (playerIndex !== -1) {
    const player = gameState.players[playerIndex];
    let completedCount = 0;
    const deliveredSet = new Set(deliveredMissionIds);

    const updatedMissions = player.missions.map((mission) => {
      if (
        isDeliverCargoMission(mission) &&
        !mission.isCompleted &&
        deliveredSet.has(mission.id)
      ) {
        completedCount++;
        return { ...mission, isCompleted: true };
      }
      return mission;
    });

    if (completedCount > 0) {
      const updatedPlayers = [...updatedState.players];
      updatedPlayers[playerIndex] = {
        ...player,
        missions: updatedMissions,
        completedMissionCount: player.completedMissionCount + completedCount,
      };
      updatedState = { ...updatedState, players: updatedPlayers };
    }
  }

  // Handle intercept transmission missions (scan_data delivery)
  updatedState = processInterceptMissionCompletion(updatedState, playerId, deliveredMissionIds);

  return updatedState;
}

/**
 * Check all missions for a player and return completion status
 */
export function checkPlayerMissions(
  player: Player,
  gameState: GameState
): MissionCheckResult {
  let newlyCompleted: Mission[] = [];
  let totalCompleted = 0;

  const updatedMissions = player.missions.map((mission) => {
    if (mission.isCompleted) {
      totalCompleted++;
      return mission;
    }

    // Check cargo missions (destroy missions are checked separately via events)
    if (isDeliverCargoMission(mission)) {
      if (checkCargoMission(mission, player, gameState.stations)) {
        newlyCompleted.push(mission);
        totalCompleted++;
        return { ...mission, isCompleted: true };
      }
    }

    return mission;
  });

  return {
    player,
    updatedMissions,
    newlyCompletedMissions: newlyCompleted,
    completedMissionCount: totalCompleted,
    hasWon: totalCompleted >= 3,
  };
}

/**
 * Check if any player has won by completing all 3 missions
 */
export function checkForWinner(gameState: GameState): string | null {
  for (const player of gameState.players) {
    if (player.completedMissionCount >= 3) {
      return player.id;
    }
  }
  return null;
}

/**
 * Get mission progress summary for a player (for UI)
 */
export function getMissionProgress(player: Player): {
  completed: number;
  total: number;
  destroyComplete: boolean;
  cargoComplete: number;
  cargoTotal: number;
  interceptComplete: boolean;
} {
  const destroyMission = player.missions.find((m) => m.type === "destroy_ship");
  const cargoMissions = player.missions.filter(
    (m) => m.type === "deliver_cargo"
  );
  const interceptMission = player.missions.find((m) => m.type === "intercept_transmission");

  return {
    completed: player.completedMissionCount,
    total: player.missions.length,
    destroyComplete: destroyMission?.isCompleted ?? false,
    cargoComplete: cargoMissions.filter((m) => m.isCompleted).length,
    cargoTotal: cargoMissions.length,
    interceptComplete: interceptMission?.isCompleted ?? false,
  };
}
