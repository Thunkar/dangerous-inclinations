/**
 * The mission decks: two piles, each shuffled once and dealt round the table.
 *
 * They are physical decks, so they are built the way physical decks have to be.
 * There is no per-player deck and no card that knows who is holding it —
 * every card reads the same in every hand, which is the only way a face-down
 * card can leak nothing.
 *
 * **Why two piles.** A hand is one primary and two secondaries (RULES
 * §Missions), so each pile is dealt against the choice it carries: three
 * primaries to pick the primary mission from, three secondaries to pick two of. Mixing
 * them in one pile made the shape of a hand an accident of the shuffle, and
 * because primaries are most of the cards the accident nearly always fell the
 * same way.
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
 * The primary pile is two copies of everything — each offset of each rival
 * card, each cargo route — which keeps the same share of it pointed at people
 * as the old per-player decks had (31% at three seats, 53% at six).
 *
 * The secondary pile is {@link SECONDARY_COPIES_PER_CARD} of each, which is
 * {@link MAX_PLAYERS}: three secondaries a seat means a full table needs
 * eighteen, so the printed pile is sized by the biggest table rather than by
 * symmetry with the other one. A hand may therefore hold two of the same
 * secondary, which is two separate chits and two separate filings.
 */
import type { Player } from "../../models/game.ts";
import type { Cargo, SecondaryMission, Mission } from "../../models/missions.ts";
import {
  SECONDARY_MISSION_TYPES,
  MISSIONS_PER_PLAYER,
  PRIMARIES_PER_PLAYER,
  PRIMARY_OFFERS_PER_PLAYER,
  SECONDARIES_PER_PLAYER,
  SECONDARY_OFFERS_PER_PLAYER,
  isPrimaryType,
} from "../../models/missions.ts";
import { MAX_PLAYERS } from "../../models/game.ts";
import { PLANETS } from "../../models/gravityWells.ts";
import type { Rng } from "../../utils/rng.ts";

/** Copies of each distinct card in the printed primary deck. */
export const COPIES_PER_CARD = 2;

/**
 * Copies of each secondary. Three are dealt to every seat, so a full table
 * needs {@link MAX_PLAYERS} of each for the pile to go round.
 */
export const SECONDARY_COPIES_PER_CARD = MAX_PLAYERS;

/** Survey, Piracy, Tanker: three stacks, and every seat takes one off each. */
export const SECONDARY_STACKS = 3;
export const SECONDARY_CARDS_PER_DECK = SECONDARY_STACKS * SECONDARY_COPIES_PER_CARD;

/**
 * A card as it is printed: a rival card counts seats rather than naming one,
 * and the deal turns that count into the player sitting there.
 */
export type DeckCard =
  | { type: "destroy_ship"; targetOffset: number }
  | { type: "intercept_transmission"; targetOffset: number; deliveryPlanetId: string }
  | { type: "deliver_cargo"; pickupPlanetId: string; deliveryPlanetId: string }
  | { type: "survey"; deliveryPlanetId: string }
  | { type: "piracy" }
  | { type: "tanker" };

/** A card before it gets an id (distributive over the mission union). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type MissionBlueprint = DistributiveOmit<Mission, "id">;

/**
 * The printed primary pile, in a fixed order, minus the cards a table this
 * size cannot use.
 *
 * @param playerCount seats at the table; rival cards that would wrap onto
 *   their own holder are left in the box.
 */
export function buildPrimaryDeck(
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
        // still a different primary mission.
        deliveryPlanetId: planetIds[(targetOffset + copy) % planetIds.length],
      });
    }
    for (const [pickupPlanetId, deliveryPlanetId] of allRoutes(planetIds)) {
      deck.push({ type: "deliver_cargo", pickupPlanetId, deliveryPlanetId });
    }
  }
  return deck;
}

/**
 * The printed secondary pile. It names no rival and no route, so it is the
 * same pile at every table size.
 */
export function buildSecondaryDeck(): DeckCard[] {
  const deck: DeckCard[] = [];
  for (let copy = 0; copy < SECONDARY_COPIES_PER_CARD; copy++) {
    deck.push({ type: "piracy" });
    deck.push({ type: "tanker" });
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
    case "piracy":
      return { type: card.type, isCompleted: false, cargoId: "" };
    case "tanker":
      return { type: card.type, isCompleted: false };
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
      return { ...card, id, dataCargoId: `data-${id}` };
    case "piracy":
      return { ...card, id, cargoId: `loot-${id}` };
    case "tanker":
    case "destroy_ship":
      return { ...card, id };
  }
}

/**
 * Shuffle both piles and deal round the table, advancing `rng`. Deterministic
 * for a seed.
 *
 * Each pile is dealt a card at a time the way a dealer would: the same card can
 * only reach one hand, so a route somebody else is flying is a route you were
 * not offered. Primaries first, then secondaries, so a seat's offers arrive in
 * the order the loadout screen reads them. Ids are handed out as the cards
 * land, so an id says nothing about what the card is — crates and chits are
 * named after their mission and sit on the table for everyone to see.
 */
export function dealMissionOffers(
  players: ReadonlyArray<Pick<Player, "id">>,
  rng: Rng,
  planetIds: readonly string[] = PLANETS.map((p) => p.id)
): Map<string, Mission[]> {
  const offers = new Map<string, Mission[]>(players.map((p) => [p.id, []]));
  let next = 0;
  const deal = (deck: DeckCard[], rounds: number, fix?: (dealt: DeckCard[][]) => void) => {
    const hands: DeckCard[][] = players.map(() => []);
    let onTop = 0;
    for (let round = 0; round < rounds; round++) {
      players.forEach((_player, seat) => {
        const card = deck[onTop++];
        if (card) hands[seat].push(card);
      });
    }
    fix?.(hands);
    players.forEach((player, seat) => {
      for (const card of hands[seat]) {
        offers
          .get(player.id)!
          .push(assignMissionId(cardForPlayer(card, seat, players), `m${next++}`));
      }
    });
    return onTop;
  };

  deal(rng.shuffle(buildPrimaryDeck(players.length, planetIds)), PRIMARY_OFFERS_PER_PLAYER);

  /**
   * The secondaries are not a pile you cut into — they are three stacks, one
   * per kind, and every player takes one off each. A hand keeps two of them
   * and they have to differ, so dealing three of a kind would be dealing a
   * seat no choice at all; at six seats the pile is exactly consumed, so there
   * is nothing left to redraw from and a "draw again" rule has a hole in it
   * precisely where the table is fullest.
   *
   * Taking one of each closes that by construction, needs no redraw and no
   * deck sized to the player count, and is one sentence at the table. The
   * price is that everybody is offered the same three, so the choice is which
   * one to leave rather than what turned up — and the three had better be
   * worth roughly the same, or it is not a choice.
   */
  const stacks = new Map<string, DeckCard[]>();
  for (const card of buildSecondaryDeck()) {
    const stack = stacks.get(card.type) ?? [];
    stack.push(card);
    stacks.set(card.type, stack);
  }
  // One stack per kind, and a seat takes one off each of them.
  for (const stack of [...stacks.values()].slice(0, SECONDARY_OFFERS_PER_PLAYER)) {
    const shuffled = rng.shuffle(stack);
    players.forEach((player, seat) => {
      const card = shuffled[seat];
      if (!card) return;
      offers.get(player.id)!.push(assignMissionId(cardForPlayer(card, seat, players), `m${next++}`));
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
  const fail = (error: string) => ({ missions: [], cargo: [], error });
  if (selectedIds.length !== MISSIONS_PER_PLAYER) {
    return fail(`Must select exactly ${MISSIONS_PER_PLAYER} missions (got ${selectedIds.length})`);
  }
  const selected = new Set(selectedIds);
  const missions = offers.filter((m) => selected.has(m.id));
  if (missions.length !== MISSIONS_PER_PLAYER) {
    return fail("One or more selected mission IDs not found in your offers");
  }
  // The two piles are dealt separately and kept separately: the shape of a
  // hand is the rule, not an outcome of the shuffle (RULES §Missions).
  const primaries = missions.filter((m) => isPrimaryType(m.type)).length;
  if (primaries !== PRIMARIES_PER_PLAYER) {
    return fail(
      `A hand is ${PRIMARIES_PER_PLAYER} primary and ${SECONDARIES_PER_PLAYER} secondaries (got ${primaries} primary)`
    );
  }
  // Two of the same secondary is one plan done twice: the pair has to differ,
  // so the second choice is a different thing to go and do.
  const secondaries = missions.filter((m) => !isPrimaryType(m.type));
  if (new Set(secondaries.map((m) => m.type)).size !== secondaries.length) {
    return fail("Your two secondaries must be different cards");
  }
  return { missions, cargo: cratesForMissions(missions) };
}

/**
 * The crates a hand starts with, none of them loaded yet: one per Deliver
 * route, and nothing else.
 *
 * A Piracy card owns a crate too, but it is somebody else's until it is taken:
 * the loot comes into being at the seizure (`missionChecks.ts`), not at the
 * deal.
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
    return [];
  });
}
