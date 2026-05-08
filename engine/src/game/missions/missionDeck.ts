/**
 * Mission Deck System for Dangerous Inclinations
 *
 * Generates and deals missions to players at game start.
 * Each player receives exactly 3 missions:
 * - Destroy missions: Each player targets exactly ONE other player
 * - Cargo missions: Transport cargo between planet stations
 */

import type { Player, GravityWell } from "../../models/game.ts";
import type {
  Mission,
  DestroyShipMission,
  DeliverCargoMission,
  InterceptTransmissionMission,
  Cargo,
} from "../../models/missions.ts";
import type { Rng } from "../../utils/rng.ts";

/**
 * Mission deck constants
 */
export const MISSION_CONSTANTS = {
  MISSIONS_PER_PLAYER: 3,
  MISSION_OFFERS_PER_PLAYER: 5,
} as const;

/**
 * Mutable issuer for deterministic mission/cargo IDs.
 * Pass through deck generation so all IDs are stable for a given game seed.
 */
interface IdIssuer {
  next: number;
}

function generateMissionId(issuer: IdIssuer, type: string): string {
  return `mission-${type}-${issuer.next++}`;
}

function generateCargoId(missionId: string): string {
  return `cargo-${missionId}`;
}

/**
 * Generate all possible cargo delivery missions
 * Creates missions for all planet pairs (A→B, B→A, etc.)
 * 6 planets = 30 possible routes (6 * 5)
 */
function generateCargoMissions(
  planets: GravityWell[],
  issuer: IdIssuer
): DeliverCargoMission[] {
  const missions: DeliverCargoMission[] = [];

  for (const pickupPlanet of planets) {
    for (const deliveryPlanet of planets) {
      if (pickupPlanet.id !== deliveryPlanet.id) {
        const missionId = generateMissionId(issuer, "cargo");
        missions.push({
          id: missionId,
          type: "deliver_cargo" as const,
          isCompleted: false,
          pickupPlanetId: pickupPlanet.id,
          deliveryPlanetId: deliveryPlanet.id,
          cargoId: generateCargoId(missionId),
        });
      }
    }
  }

  return missions;
}

/**
 * Deal destroy missions so each player targets exactly one other player
 * Uses a circular assignment: player[0] targets player[1], player[1] targets player[2], etc.
 * The last player targets player[0], completing the circle.
 * This ensures everyone is targeted by exactly one player.
 */
function dealDestroyMissions(
  players: Player[],
  rng: Rng,
  issuer: IdIssuer
): Map<string, DestroyShipMission> {
  const assignments = new Map<string, DestroyShipMission>();

  // Shuffle player order for randomization
  const shuffledPlayers = rng.shuffle(players);

  for (let i = 0; i < shuffledPlayers.length; i++) {
    const attacker = shuffledPlayers[i];
    const target = shuffledPlayers[(i + 1) % shuffledPlayers.length];

    assignments.set(attacker.id, {
      id: generateMissionId(issuer, "destroy"),
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
  cargoMissions: DeliverCargoMission[],
  rng: Rng,
  issuer: IdIssuer
): Map<string, DeliverCargoMission[]> {
  const assignments = new Map<string, DeliverCargoMission[]>();
  const shuffledMissions = rng.shuffle(cargoMissions);
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
      const missionId = generateMissionId(issuer, "cargo");
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
  players: Player[],
  rng: Rng,
  issuer: IdIssuer
): Map<string, InterceptTransmissionMission> {
  const assignments = new Map<string, InterceptTransmissionMission>();

  // Shuffle in reverse direction to avoid same pairing as destroy missions
  const shuffledPlayers = rng.shuffle(players).reverse();

  for (let i = 0; i < shuffledPlayers.length; i++) {
    const spy = shuffledPlayers[i];
    const target = shuffledPlayers[(i + 1) % shuffledPlayers.length];
    const missionId = generateMissionId(issuer, "intercept");
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
 *
 * The supplied Rng instance is mutated; pass a fresh handle derived from
 * GameState if you want the deck deal to be replayable.
 */
export function dealMissions(
  players: Player[],
  planets: GravityWell[],
  rng: Rng
): DealMissionsResult {
  const issuer: IdIssuer = { next: 0 };

  // Generate mission pools
  const cargoMissions = generateCargoMissions(planets, issuer);

  // Deal destroy missions (one per player, circular targeting)
  const destroyAssignments = dealDestroyMissions(players, rng, issuer);

  // Deal intercept missions (different circular order from destroy)
  const interceptAssignments = dealInterceptMissions(players, rng, issuer);

  // Deal cargo missions (1 per player instead of 2)
  const cargoAssignments = dealCargoMissions(players, cargoMissions, rng, issuer);

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
  planets: GravityWell[],
  rng: Rng,
  issuer: IdIssuer
): Mission[] {
  const deck: Mission[] = [];

  // Destroy missions — one per opponent
  for (const target of otherPlayers) {
    deck.push({
      id: generateMissionId(issuer, "destroy"),
      type: "destroy_ship",
      isCompleted: false,
      targetPlayerId: target.id,
    });
  }

  // Intercept missions — one per opponent
  for (const target of otherPlayers) {
    const missionId = generateMissionId(issuer, "intercept");
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
        const missionId = generateMissionId(issuer, "cargo");
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

  return rng.shuffle(deck);
}

/**
 * Deal mission offers to all players.
 * Each player draws MISSION_OFFERS_PER_PLAYER (5) from their own shuffled deck.
 * The draw uses the supplied Rng (mutated) — mimicking a tabletop card draw,
 * but deterministic for a given seed.
 * They will pick MISSIONS_PER_PLAYER (3) when submitting their loadout.
 */
export function dealMissionOffers(
  players: Player[],
  planets: GravityWell[],
  rng: Rng
): DealMissionOffersResult {
  const playerOffers = new Map<string, Mission[]>();
  const issuer: IdIssuer = { next: 0 };

  for (const player of players) {
    const otherPlayers = players.filter((p) => p.id !== player.id);
    const deck = buildPlayerDeck(player, otherPlayers, planets, rng, issuer);
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
