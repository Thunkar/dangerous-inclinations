/**
 * The mission deck: one pile, shuffled once, dealt round the table.
 *
 * It is a physical deck, so it is built the way a physical deck has to be.
 * There is no per-player deck and no card that knows who is holding it —
 * every card reads the same in every hand, which is the only way a face-down
 * card can leak nothing.
 *
 * **Naming a rival without naming a seat.** A Destroy card that said "destroy
 * Ada" could be drawn by Ada, and putting it back would tell her that nobody
 * holds it. So the cards count instead: *the player to your left*, *the second
 * to your left*, and so on. An offset is never zero, so the card can never
 * name its own holder, and since every copy reads identically it says nothing
 * about who is hunting whom until it is completed face-up.
 *
 * **Setup removes what will not fit.** Offsets run to {@link MAX_PLAYERS} - 1,
 * so a smaller table takes out the cards that would wrap onto the holder:
 * with N players, remove every card whose offset is N or more.
 *
 * The mix is two copies of everything — each offset of each rival card, each
 * cargo route, each secondary card — which keeps the same share of the deck
 * pointed at people as the old per-player decks had (31% at three seats, 53%
 * at six) while leaving enough cards to deal five to six players.
 */
import type { Player } from "../../models/game.ts";
import type { Cargo, SecondaryMission, Mission } from "../../models/missions.ts";
import {
  SECONDARY_MISSION_TYPES,
  MISSIONS_PER_PLAYER,
  MISSION_OFFERS_PER_PLAYER,
} from "../../models/missions.ts";
import { MAX_PLAYERS } from "../../models/game.ts";
import { BLACK_HOLE_ID, PLANETS } from "../../models/gravityWells.ts";
import type { Rng } from "../../utils/rng.ts";

/** Copies of each distinct card in the printed deck. */
export const COPIES_PER_CARD = 2;

/** Survey, Board, Garbage Disposal. */
export const SECONDARY_CARDS_PER_DECK = (SECONDARY_MISSION_TYPES.length + 1) * COPIES_PER_CARD;

/**
 * A card as it is printed: a rival card counts seats rather than naming one,
 * and the deal turns that count into the player sitting there.
 */
export type DeckCard =
  | { type: "destroy_ship"; targetOffset: number }
  | { type: "intercept_transmission"; targetOffset: number; deliveryPlanetId: string }
  | { type: "deliver_cargo"; pickupPlanetId: string; deliveryPlanetId: string }
  | { type: "survey" | "board"; deliveryPlanetId: string }
  | { type: "garbage_disposal" };

/** A card before it gets an id (distributive over the mission union). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type MissionBlueprint = DistributiveOmit<Mission, "id">;

/**
 * The printed deck, in a fixed order, minus the cards a table this size
 * cannot use.
 *
 * @param playerCount seats at the table; rival cards that would wrap onto
 *   their own holder are left in the box.
 */
export function buildMissionDeck(
  playerCount: number,
  planetIds: readonly string[] = PLANETS.map((p) => p.id)
): DeckCard[] {
  const deck: DeckCard[] = [];
  const offsets = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 1).filter(
    (offset) => offset < playerCount
  );

  for (let copy = 0; copy < COPIES_PER_CARD; copy++) {
    for (const targetOffset of offsets) {
      deck.push({ type: "destroy_ship", targetOffset });
      deck.push({
        type: "intercept_transmission",
        targetOffset,
        // The station is printed on the card, so a copy of the same offset is
        // still a different errand.
        deliveryPlanetId: planetIds[(targetOffset + copy) % planetIds.length],
      });
    }
    for (const [pickupPlanetId, deliveryPlanetId] of allRoutes(planetIds)) {
      deck.push({ type: "deliver_cargo", pickupPlanetId, deliveryPlanetId });
    }
    deck.push({ type: "garbage_disposal" });
    for (const type of SECONDARY_MISSION_TYPES) {
      // A chit is filed at whatever station the ship next docks at.
      deck.push({ type, deliveryPlanetId: "any" });
    }
  }
  return deck;
}

/**
 * Turn a printed card into one player's mission: the seat count becomes the
 * player sitting there, counting left from the holder in turn order.
 */
export function cardForPlayer(
  card: DeckCard,
  holderIndex: number,
  players: ReadonlyArray<Pick<Player, "id">>
): MissionBlueprint {
  const rival = (offset: number) => players[(holderIndex + offset) % players.length].id;
  switch (card.type) {
    case "destroy_ship":
      return { type: card.type, isCompleted: false, targetPlayerId: rival(card.targetOffset) };
    case "intercept_transmission":
      return {
        type: card.type,
        isCompleted: false,
        targetPlayerId: rival(card.targetOffset),
        deliveryPlanetId: card.deliveryPlanetId,
        scanAcquired: false,
        dataCargoId: "",
      };
    case "deliver_cargo":
      return {
        type: card.type,
        isCompleted: false,
        pickupPlanetId: card.pickupPlanetId,
        deliveryPlanetId: card.deliveryPlanetId,
        cargoId: "",
      };
    case "garbage_disposal":
      return { type: card.type, isCompleted: false, cargoId: "" };
    default: {
      const secondary: Omit<SecondaryMission, "id"> = {
        type: card.type,
        isCompleted: false,
        deliveryPlanetId: card.deliveryPlanetId,
        acquired: false,
        dataCargoId: "",
      };
      return secondary;
    }
  }
}

/** Every ordered pair of distinct planets. */
export function allRoutes(planetIds: readonly string[]): Array<[string, string]> {
  const routes: Array<[string, string]> = [];
  for (const a of planetIds) for (const b of planetIds) if (a !== b) routes.push([a, b]);
  return routes;
}

/** Give a shuffled card its (opaque) id and derived token ids. */
export function assignMissionId(card: MissionBlueprint, id: string): Mission {
  switch (card.type) {
    case "deliver_cargo":
      return { ...card, id, cargoId: `crate-${id}` };
    case "intercept_transmission":
      return { ...card, id, dataCargoId: `data-${id}` };
    case "survey":
    case "board":
      return { ...card, id, dataCargoId: `data-${id}` };
    case "garbage_disposal":
      return { ...card, id, cargoId: `load-${id}` };
    case "destroy_ship":
      return { ...card, id };
  }
}

/**
 * Shuffle the deck and deal round the table, advancing `rng`. Deterministic
 * for a seed.
 *
 * One pile, dealt a card at a time the way a dealer would: the same card can
 * only reach one hand, so a route somebody else is flying is a route you were
 * not offered. Ids are handed out as the cards land, so an id says nothing
 * about what the card is — crates and chits are named after their mission and
 * sit on the table for everyone to see.
 */
export function dealMissionOffers(
  players: ReadonlyArray<Pick<Player, "id">>,
  rng: Rng,
  planetIds: readonly string[] = PLANETS.map((p) => p.id)
): Map<string, Mission[]> {
  const deck = rng.shuffle(buildMissionDeck(players.length, planetIds));
  const offers = new Map<string, Mission[]>(players.map((p) => [p.id, []]));
  let next = 0;
  let onTop = 0;
  for (let round = 0; round < MISSION_OFFERS_PER_PLAYER; round++) {
    players.forEach((player, seat) => {
      const card = deck[onTop++];
      if (!card) return;
      offers
        .get(player.id)!
        .push(assignMissionId(cardForPlayer(card, seat, players), `m${next++}`));
    });
  }
  return offers;
}

/**
 * Keep MISSIONS_PER_PLAYER of the offered missions. Creates the crates for
 * Deliver missions (to be picked up at their origin station).
 */
export function selectMissionsFromOffers(
  offers: Mission[],
  selectedIds: string[]
): { missions: Mission[]; cargo: Cargo[]; error?: string } {
  if (selectedIds.length !== MISSIONS_PER_PLAYER) {
    return {
      missions: [],
      cargo: [],
      error: `Must select exactly ${MISSIONS_PER_PLAYER} missions (got ${selectedIds.length})`,
    };
  }
  const selected = new Set(selectedIds);
  const missions = offers.filter((m) => selected.has(m.id));
  if (missions.length !== MISSIONS_PER_PLAYER) {
    return {
      missions: [],
      cargo: [],
      error: "One or more selected mission IDs not found in your offers",
    };
  }
  return { missions, cargo: cratesForMissions(missions) };
}

/**
 * The crates a hand starts with, none of them loaded yet: one per Deliver
 * route, and one load of garbage per disposal card.
 *
 * A load of garbage is collected at *any* station and goes over the side on
 * the black hole's innermost ring, so it is the one crate whose pickup is
 * "any" and whose destination is a place with no station at all — which is
 * exactly why docking never takes it off your hands.
 */
export function cratesForMissions(missions: Mission[]): Cargo[] {
  return missions.flatMap((m) => {
    if (m.type === "deliver_cargo") {
      return [
        {
          id: m.cargoId,
          missionId: m.id,
          kind: "crate" as const,
          pickupPlanetId: m.pickupPlanetId,
          deliveryPlanetId: m.deliveryPlanetId,
          isPickedUp: false,
        },
      ];
    }
    if (m.type === "garbage_disposal") {
      return [
        {
          id: m.cargoId,
          missionId: m.id,
          kind: "crate" as const,
          pickupPlanetId: "any",
          deliveryPlanetId: BLACK_HOLE_ID,
          isPickedUp: false,
        },
      ];
    }
    return [];
  });
}
