/**
 * Mission deck. Each player draws MISSION_OFFERS_PER_PLAYER cards from their
 * own shuffled deck of every mission they could hold, then keeps
 * MISSIONS_PER_PLAYER of them during loadout.
 *
 * Deck per player: one Destroy and one Intercept per opponent; every Deliver
 * route between two different planets; two Survey.
 */
import type { Player } from "../../models/game.ts";
import type { Cargo, Mission } from "../../models/missions.ts";
import { MISSIONS_PER_PLAYER, MISSION_OFFERS_PER_PLAYER } from "../../models/missions.ts";
import { PLANETS } from "../../models/gravityWells.ts";
import type { Rng } from "../../utils/rng.ts";
import type { RuleSet } from "../../models/rules.ts";
import { DEFAULT_RULES } from "../../models/rules.ts";

export const SURVEY_CARDS_PER_DECK = 2;

/** A card before it gets an id (distributive over the mission union). */
export type MissionBlueprint = {
  [K in Mission["type"]]: Omit<Extract<Mission, { type: K }>, "id">;
}[Mission["type"]];

/**
 * Every card a player could hold, in a fixed order. Ids are assigned AFTER
 * shuffling (see dealMissionOffers) so that an id says nothing about the
 * card: cargo and data chits are named after their mission id and are public
 * tokens, and a predictable id would let opponents read a crate's route.
 */
export function buildMissionDeck(
  opponents: ReadonlyArray<Pick<Player, "id">>,
  planetIds: readonly string[],
  routes: Array<[string, string]> = allRoutes(planetIds),
  /** Planets the Survey cards deliver to, one per card. */
  surveyPlanets: readonly string[] = planetIds.slice(0, SURVEY_CARDS_PER_DECK)
): MissionBlueprint[] {
  const deck: MissionBlueprint[] = [];

  for (const target of opponents) {
    deck.push({ type: "destroy_ship", isCompleted: false, targetPlayerId: target.id });
    deck.push({
      type: "intercept_transmission",
      isCompleted: false,
      targetPlayerId: target.id,
      scanAcquired: false,
      dataCargoId: "",
    });
  }
  for (const [pickup, delivery] of routes) {
    deck.push({
      type: "deliver_cargo",
      isCompleted: false,
      pickupPlanetId: pickup,
      deliveryPlanetId: delivery,
      cargoId: "",
    });
  }
  for (let i = 0; i < SURVEY_CARDS_PER_DECK; i++)
    deck.push({
      type: "survey",
      isCompleted: false,
      deliveryPlanetId: surveyPlanets[i % surveyPlanets.length],
      surveyTurns: 0,
      surveyAcquired: false,
      dataCargoId: "",
    });

  return deck;
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
    case "destroy_ship":
      return { ...card, id };
  }
}

/**
 * Deal offers to every player, advancing `rng`. Deterministic for a seed.
 * Ids are sequential over the shuffled decks, so they carry no information.
 */
export function dealMissionOffers(
  players: ReadonlyArray<Pick<Player, "id">>,
  rng: Rng,
  planetIds: readonly string[] = PLANETS.map((p) => p.id),
  rules: RuleSet = DEFAULT_RULES
): Map<string, Mission[]> {
  const offers = new Map<string, Mission[]>();
  let next = 0;
  for (const player of players) {
    const opponents = players.filter((p) => p.id !== player.id);
    // Rule knob: deal only some of the six routes (a seeded subset per player).
    const routes = rng
      .shuffle(allRoutes(planetIds))
      .slice(0, Math.max(0, Math.min(6, rules.deliverRoutesDealt)));
    // The two Survey cards deliver to two different planets, drawn per player.
    const surveyPlanets = rng.shuffle([...planetIds]).slice(0, SURVEY_CARDS_PER_DECK);
    const shuffled = rng.shuffle(buildMissionDeck(opponents, planetIds, routes, surveyPlanets));
    const deck = shuffled.map((card) => assignMissionId(card, `m${next++}`));
    offers.set(player.id, deck.slice(0, MISSION_OFFERS_PER_PLAYER));
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

/** Crates for every Deliver mission in the list, not yet picked up. */
export function cratesForMissions(missions: Mission[]): Cargo[] {
  return missions.flatMap((m) =>
    m.type === "deliver_cargo"
      ? [
          {
            id: m.cargoId,
            missionId: m.id,
            kind: "crate" as const,
            pickupPlanetId: m.pickupPlanetId,
            deliveryPlanetId: m.deliveryPlanetId,
            isPickedUp: false,
          },
        ]
      : []
  );
}
