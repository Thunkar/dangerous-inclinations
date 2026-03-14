/**
 * Mission Deck System for Dangerous Inclinations
 *
 * Generates and deals missions to players at game start.
 * Each player receives exactly 3 missions:
 * - Destroy missions: Each player targets exactly ONE other player
 * - Cargo missions: Transport cargo between planet stations
 */

import type { Player, GravityWell } from "../../models/game";
import type {
  Mission,
  DestroyShipMission,
  DeliverCargoMission,
  InterceptTransmissionMission,
  Cargo,
} from "../../models/missions";

/**
 * Mission deck constants
 */
export const MISSION_CONSTANTS = {
  MISSIONS_PER_PLAYER: 3,
  MISSION_OFFERS_PER_PLAYER: 5,
} as const;

/**
 * Generate a unique mission ID
 */
function generateMissionId(type: string, index: number): string {
  return `mission-${type}-${index}-${Date.now()}`;
}

/**
 * Generate a unique cargo ID linked to a mission
 */
function generateCargoId(missionId: string): string {
  return `cargo-${missionId}`;
}

/**
 * Generate all possible destroy ship missions
 * Each mission targets a specific player
 * NOTE: Not currently used - we use circular targeting instead (dealDestroyMissions)
 */
function _generateDestroyMissions(players: Player[]): DestroyShipMission[] {
  return players.map((player, index) => ({
    id: generateMissionId("destroy", index),
    type: "destroy_ship" as const,
    isCompleted: false,
    targetPlayerId: player.id,
  }));
}
// Suppress unused warning - kept for potential future use
void _generateDestroyMissions;

/**
 * Generate all possible cargo delivery missions
 * Creates missions for all planet pairs (A→B, B→A, etc.)
 * 6 planets = 30 possible routes (6 * 5)
 */
function generateCargoMissions(planets: GravityWell[]): DeliverCargoMission[] {
  const missions: DeliverCargoMission[] = [];
  let index = 0;

  for (const pickupPlanet of planets) {
    for (const deliveryPlanet of planets) {
      if (pickupPlanet.id !== deliveryPlanet.id) {
        const missionId = generateMissionId("cargo", index);
        missions.push({
          id: missionId,
          type: "deliver_cargo" as const,
          isCompleted: false,
          pickupPlanetId: pickupPlanet.id,
          deliveryPlanetId: deliveryPlanet.id,
          cargoId: generateCargoId(missionId),
        });
        index++;
      }
    }
  }

  return missions;
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Deal destroy missions so each player targets exactly one other player
 * Uses a circular assignment: player[0] targets player[1], player[1] targets player[2], etc.
 * The last player targets player[0], completing the circle.
 * This ensures everyone is targeted by exactly one player.
 */
function dealDestroyMissions(
  players: Player[]
): Map<string, DestroyShipMission> {
  const assignments = new Map<string, DestroyShipMission>();

  // Shuffle player order for randomization
  const shuffledPlayers = shuffleArray(players);

  for (let i = 0; i < shuffledPlayers.length; i++) {
    const attacker = shuffledPlayers[i];
    const target = shuffledPlayers[(i + 1) % shuffledPlayers.length];

    assignments.set(attacker.id, {
      id: generateMissionId("destroy", i),
      type: "destroy_ship",
      isCompleted: false,
      targetPlayerId: target.id,
    });
  }

  return assignments;
}

/**
 * Deal cargo missions from the available pool
 * Each player gets 1 cargo mission
 * (1 destroy + 1 intercept + 1 cargo = 3 missions total)
 */
function dealCargoMissions(
  players: Player[],
  cargoMissions: DeliverCargoMission[]
): Map<string, DeliverCargoMission[]> {
  const assignments = new Map<string, DeliverCargoMission[]>();
  const shuffledMissions = shuffleArray(cargoMissions);
  let missionIndex = 0;

  const cargoMissionsPerPlayer = 1;

  for (const player of players) {
    const playerMissions: DeliverCargoMission[] = [];

    for (
      let i = 0;
      i < cargoMissionsPerPlayer && missionIndex < shuffledMissions.length;
      i++
    ) {
      // Create a new mission with a unique ID for this player
      const baseMission = shuffledMissions[missionIndex];
      const missionId = generateMissionId("cargo", missionIndex);
      playerMissions.push({
        ...baseMission,
        id: missionId,
        cargoId: generateCargoId(missionId),
      });
      missionIndex++;
    }

    assignments.set(player.id, playerMissions);
  }

  return assignments;
}

/**
 * Create cargo objects for cargo missions
 */
function createCargoForMissions(missions: DeliverCargoMission[]): Cargo[] {
  return missions.map((mission) => ({
    id: mission.cargoId,
    missionId: mission.id,
    type: "standard" as const,
    pickupPlanetId: mission.pickupPlanetId,
    deliveryPlanetId: mission.deliveryPlanetId,
    isPickedUp: false,
  }));
}

/**
 * Deal intercept transmission missions — each player targets a different player
 * Uses circular assignment similar to destroy missions.
 * The assigned target is the player whose transmission they must intercept.
 */
function dealInterceptMissions(
  players: Player[]
): Map<string, InterceptTransmissionMission> {
  const assignments = new Map<string, InterceptTransmissionMission>();

  // Shuffle in reverse direction to avoid same pairing as destroy missions
  const shuffledPlayers = shuffleArray([...players]).reverse();

  for (let i = 0; i < shuffledPlayers.length; i++) {
    const spy = shuffledPlayers[i];
    const target = shuffledPlayers[(i + 1) % shuffledPlayers.length];
    const missionId = generateMissionId("intercept", i);
    assignments.set(spy.id, {
      id: missionId,
      type: "intercept_transmission",
      isCompleted: false,
      targetPlayerId: target.id,
      scanAcquired: false,
      scanCargoId: generateCargoId(missionId),
    });
  }

  return assignments;
}

/**
 * Result of dealing missions to players
 */
export interface DealMissionsResult {
  playerMissions: Map<string, Mission[]>;
  playerCargo: Map<string, Cargo[]>;
}

/**
 * Deal missions to all players
 * Each player receives:
 * - 1 destroy ship mission (targeting one specific other player)
 * - 1 intercept transmission mission (shadow a different player with sensor_array)
 * - 1 cargo delivery mission
 *
 * Returns a map of playerId -> missions and playerId -> cargo
 */
export function dealMissions(
  players: Player[],
  planets: GravityWell[]
): DealMissionsResult {
  // Generate mission pools
  const cargoMissions = generateCargoMissions(planets);

  // Deal destroy missions (one per player, circular targeting)
  const destroyAssignments = dealDestroyMissions(players);

  // Deal intercept missions (different circular order from destroy)
  const interceptAssignments = dealInterceptMissions(players);

  // Deal cargo missions (1 per player instead of 2)
  const cargoAssignments = dealCargoMissions(players, cargoMissions);

  // Combine missions and create cargo objects
  const playerMissions = new Map<string, Mission[]>();
  const playerCargo = new Map<string, Cargo[]>();

  for (const player of players) {
    const missions: Mission[] = [];

    // Add destroy mission
    const destroyMission = destroyAssignments.get(player.id);
    if (destroyMission) {
      missions.push(destroyMission);
    }

    // Add intercept mission
    const interceptMission = interceptAssignments.get(player.id);
    if (interceptMission) {
      missions.push(interceptMission);
    }

    // Add cargo mission (1 per player)
    const cargoMissionsList = cargoAssignments.get(player.id) || [];
    missions.push(...cargoMissionsList);

    playerMissions.set(player.id, missions);

    // Create cargo for standard cargo missions only (scan_data cargo is created at scan time)
    playerCargo.set(player.id, createCargoForMissions(cargoMissionsList));
  }

  return { playerMissions, playerCargo };
}

/**
 * Get the destroy target for a player (for UI/debug purposes)
 */
export function getDestroyTarget(missions: Mission[]): string | undefined {
  const destroyMission = missions.find((m) => m.type === "destroy_ship") as
    | DestroyShipMission
    | undefined;
  return destroyMission?.targetPlayerId;
}

/**
 * Get cargo missions for a player
 */
export function getCargoMissions(missions: Mission[]): DeliverCargoMission[] {
  return missions.filter(
    (m) => m.type === "deliver_cargo"
  ) as DeliverCargoMission[];
}

/**
 * Result of dealing mission offers
 */
export interface DealMissionOffersResult {
  playerOffers: Map<string, Mission[]>;
}

/**
 * Build a full mission deck for one player, containing every possible mission
 * they could draw. The deck is shuffled and they draw MISSION_OFFERS_PER_PLAYER
 * cards from the top — just like a real tabletop card draw.
 */
function buildPlayerDeck(
  _player: Player,
  otherPlayers: Player[],
  planets: GravityWell[]
): Mission[] {
  const deck: Mission[] = [];
  let idx = 0;

  // Destroy missions — one per opponent
  for (const target of otherPlayers) {
    deck.push({
      id: generateMissionId("destroy", idx++),
      type: "destroy_ship",
      isCompleted: false,
      targetPlayerId: target.id,
    });
  }

  // Intercept missions — one per opponent
  for (const target of otherPlayers) {
    const missionId = generateMissionId("intercept", idx++);
    deck.push({
      id: missionId,
      type: "intercept_transmission",
      isCompleted: false,
      targetPlayerId: target.id,
      scanAcquired: false,
      scanCargoId: generateCargoId(missionId),
    });
  }

  // Cargo missions — all planet pair routes
  for (const pickup of planets) {
    for (const delivery of planets) {
      if (pickup.id !== delivery.id) {
        const missionId = generateMissionId("cargo", idx++);
        deck.push({
          id: missionId,
          type: "deliver_cargo",
          isCompleted: false,
          pickupPlanetId: pickup.id,
          deliveryPlanetId: delivery.id,
          cargoId: generateCargoId(missionId),
        });
      }
    }
  }

  return shuffleArray(deck);
}

/**
 * Deal mission offers to all players.
 * Each player draws MISSION_OFFERS_PER_PLAYER (5) from their own shuffled deck.
 * The draw is completely random — mimicking a real tabletop card draw.
 * They will pick MISSIONS_PER_PLAYER (3) when submitting their loadout.
 */
export function dealMissionOffers(
  players: Player[],
  planets: GravityWell[]
): DealMissionOffersResult {
  const playerOffers = new Map<string, Mission[]>();

  for (const player of players) {
    const otherPlayers = players.filter((p) => p.id !== player.id);
    const deck = buildPlayerDeck(player, otherPlayers, planets);
    const drawn = deck.slice(0, MISSION_CONSTANTS.MISSION_OFFERS_PER_PLAYER);
    playerOffers.set(player.id, drawn);
  }

  return { playerOffers };
}

/**
 * Select missions from a player's offered pool and create associated cargo.
 * Validates that exactly MISSIONS_PER_PLAYER IDs are selected, all from the offer.
 * Returns the selected missions and their cargo items.
 */
export function selectMissionsFromOffers(
  offeredMissions: Mission[],
  selectedIds: string[]
): { missions: Mission[]; cargo: Cargo[]; error?: string } {
  if (selectedIds.length !== MISSION_CONSTANTS.MISSIONS_PER_PLAYER) {
    return {
      missions: [],
      cargo: [],
      error: `Must select exactly ${MISSION_CONSTANTS.MISSIONS_PER_PLAYER} missions (got ${selectedIds.length})`,
    };
  }

  const selectedSet = new Set(selectedIds);
  const selected = offeredMissions.filter((m) => selectedSet.has(m.id));

  if (selected.length !== MISSION_CONSTANTS.MISSIONS_PER_PLAYER) {
    return {
      missions: [],
      cargo: [],
      error: "One or more selected mission IDs not found in your offers",
    };
  }

  // Create cargo for deliver_cargo missions
  const cargo: Cargo[] = selected
    .filter((m): m is DeliverCargoMission => m.type === "deliver_cargo")
    .map((m) => ({
      id: m.cargoId,
      missionId: m.id,
      type: "standard" as const,
      pickupPlanetId: m.pickupPlanetId,
      deliveryPlanetId: m.deliveryPlanetId,
      isPickedUp: false,
    }));

  return { missions: selected, cargo };
}
