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
