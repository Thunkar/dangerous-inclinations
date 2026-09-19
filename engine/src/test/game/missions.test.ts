import { describe, it, expect } from "vitest";
import type { ShipLoadout } from "../../models/game.ts";
import {
  COPIES_PER_CARD,
  buildPrimaryDeck,
  buildSecondaryDeck,
  cardForPlayer,
  cratesForMissions,
  dealMissionOffers,
  selectMissionsFromOffers,
} from "../../game/missions/missionDeck.ts";
import { checkForWinner, completedMissions } from "../../game/missions/missionChecks.ts";
import { createGame } from "../../game/setup.ts";
import { viewFor } from "../../game/view.ts";
import {
  SECONDARY_CARDS_PER_DECK,
  SECONDARY_COPIES_PER_CARD,
} from "../../game/missions/missionDeck.ts";
import {
  DEFAULT_POINTS_TO_WIN,
  MISSION_FAMILY,
  SURVEY_RING,
  MISSION_POINTS,
  MISSIONS_PER_PLAYER,
  MISSION_OFFERS_PER_PLAYER,
  PRIMARIES_PER_PLAYER,
  PRIMARY_OFFERS_PER_PLAYER,
  SECONDARIES_PER_PLAYER,
  isPrimaryType,
  SECONDARY_OFFERS_PER_PLAYER,
} from "../../models/missions.ts";
import type { Mission } from "../../models/missions.ts";
import type { GameState } from "../../models/game.ts";
import { PLANETS, STATION_RING } from "../../models/gravityWells.ts";
import { Rng } from "../../utils/rng.ts";
import {
  ALPHA,
  BETA,
  BH,
  GAMMA,
  approachSector,
  coast,
  secondaryMission,
  deliverMission,
  garbageMission,
  destroyMission,
  eventsOf,
  eventTypes,
  executeTurnAs,
  fire,
  getPlayer,
  interceptMission,
  makeGameState,
  makePlayer,
  makeTwoPlayerGame,
  mustExecute,
  surveyMission,
  withMissile,
  withMissions,
  withPlayer,
  withPower,
  withShip,
} from "../testUtils.ts";

const PLANET_IDS = PLANETS.map((p) => p.id);
const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));

describe("missions: deck", () => {
  /** Rival cards per offset per copy: one Destroy and one Intercept. */
  const RIVAL_CARDS = 2;
  const ROUTES = 6;

  it.each([2, 3, 4, 5, 6])("a %i-player primary deck drops the offsets that would wrap", (players) => {
    const deck = buildPrimaryDeck(players, PLANET_IDS);
    const offsets = deck.flatMap((c) => ("targetOffset" in c ? [c.targetOffset] : []));
    // Counting left from a holder, an offset of `players` is the holder again.
    expect(Math.max(...offsets)).toBe(players - 1);
    expect(new Set(offsets)).toEqual(new Set(Array.from({ length: players - 1 }, (_, i) => i + 1)));

    const count = (type: Mission["type"]) => deck.filter((c) => c.type === type).length;
    expect(count("destroy_ship")).toBe((players - 1) * COPIES_PER_CARD);
    expect(count("intercept_transmission")).toBe((players - 1) * COPIES_PER_CARD);
    expect(count("deliver_cargo")).toBe(ROUTES * COPIES_PER_CARD);
    // Not one secondary in it: the two piles are dealt apart.
    expect(deck.filter((c) => MISSION_FAMILY[c.type] === "secondary")).toHaveLength(0);
    expect(deck).toHaveLength(
      (players - 1) * RIVAL_CARDS * COPIES_PER_CARD + ROUTES * COPIES_PER_CARD
    );
  });

  it("the secondary deck is the same pile at every table size", () => {
    const deck = buildSecondaryDeck();
    expect(deck).toHaveLength(SECONDARY_CARDS_PER_DECK);
    expect(deck.every((c) => MISSION_FAMILY[c.type] === "secondary")).toBe(true);
    for (const type of ["survey", "board", "garbage_disposal"] as const) {
      expect(deck.filter((c) => c.type === type), type).toHaveLength(SECONDARY_COPIES_PER_CARD);
    }
  });

  it.each([2, 3, 4, 5, 6])("both %i-player piles hold enough to deal the table", (players) => {
    expect(buildPrimaryDeck(players, PLANET_IDS).length).toBeGreaterThanOrEqual(
      players * PRIMARY_OFFERS_PER_PLAYER
    );
    expect(buildSecondaryDeck().length).toBeGreaterThanOrEqual(
      players * SECONDARY_OFFERS_PER_PLAYER
    );
  });

  it("prints no card that names a seat: a rival card counts, it does not point", () => {
    const deck = buildPrimaryDeck(6, PLANET_IDS);
    for (const card of deck) {
      expect(card).not.toHaveProperty("targetPlayerId");
      if ("targetOffset" in card) expect(card.targetOffset).toBeGreaterThan(0);
    }
  });

  it.each([2, 3, 4, 5, 6])(
    "no hand at a %i-player table is ever dealt a card naming its own holder",
    (players) => {
      // The reason the cards count seats instead of naming them: a Destroy on
      // yourself could not be put back without telling the table it exists.
      for (let seed = 1; seed <= 30; seed++) {
        const offers = dealMissionOffers(ids(players), new Rng(seed));
        for (const [holder, hand] of offers) {
          for (const card of hand) {
            if ("targetPlayerId" in card) expect(card.targetPlayerId).not.toBe(holder);
          }
        }
      }
    }
  );

  it("counts left in turn order: the same printed card names a different rival in each hand", () => {
    const players = ids(4);
    const card = { type: "destroy_ship" as const, targetOffset: 1 };
    const targets = players.map((_, seat) => {
      const mission = cardForPlayer(card, seat, players);
      return "targetPlayerId" in mission ? mission.targetPlayerId : null;
    });
    expect(targets).toEqual(["p2", "p3", "p4", "p1"]);
  });

  it("is one pile: a card dealt to one hand is not dealt to another", () => {
    const players = ids(6);
    const offers = dealMissionOffers(players, new Rng(11));
    // Cards are only distinguishable by what they say, and the deck holds
    // COPIES_PER_CARD of each — so no card may appear more often than that.
    const seen = new Map<string, number>();
    for (const [holder, hand] of offers) {
      const seat = players.findIndex((p) => p.id === holder);
      for (const card of hand) {
        // Read the rival back as an offset so two hands describe a card the same way.
        const offset =
          "targetPlayerId" in card
            ? (players.findIndex((p) => p.id === card.targetPlayerId) - seat + players.length) %
              players.length
            : "";
        const { id: _id, ...rest } = card;
        const key = JSON.stringify({ ...rest, targetPlayerId: undefined, offset });
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    for (const [key, n] of seen) expect(n, key).toBeLessThanOrEqual(COPIES_PER_CARD);
  });

  it("every card starts uncompleted and with empty progress once it is dealt", () => {
    const hand = [...dealMissionOffers(ids(3), new Rng(5)).values()].flat();
    expect(hand.every((m) => !m.isCompleted)).toBe(true);
    expect(
      hand.filter((m) => m.type === "intercept_transmission").every((m) => !m.scanAcquired)
    ).toBe(true);
    expect(hand.filter((m) => "acquired" in m).every((m) => "acquired" in m && !m.acquired)).toBe(
      true
    );
  });

  it("covers every ordered planet pair, and no route to itself", () => {
    const routes = buildPrimaryDeck(3, PLANET_IDS).flatMap((c) =>
      c.type === "deliver_cargo" ? [`${c.pickupPlanetId}>${c.deliveryPlanetId}`] : []
    );
    expect(new Set(routes).size).toBe(6);
    expect(routes.some((r) => r.split(">")[0] === r.split(">")[1])).toBe(false);
  });

  it("ids are assigned after shuffling, so a crate id says nothing about its route", () => {
    // Across many seeds the same id must map to different routes.
    const routesForId = new Map<string, Set<string>>();
    for (let seed = 1; seed <= 40; seed++) {
      const offers = dealMissionOffers(ids(2), new Rng(seed));
      for (const m of offers.get("p1") ?? []) {
        if (m.type !== "deliver_cargo") continue;
        const set = routesForId.get(m.cargoId) ?? new Set<string>();
        set.add(`${m.pickupPlanetId}>${m.deliveryPlanetId}`);
        routesForId.set(m.cargoId, set);
      }
    }
    expect([...routesForId.values()].some((routes) => routes.size > 1)).toBe(true);
    // And ids never embed a planet name.
    for (const id of routesForId.keys()) expect(id).not.toMatch(/alpha|beta|gamma/);
  });

  it("deals 5 offers per player with unique ids, deterministically for a seed", () => {
    const a = dealMissionOffers(ids(3), new Rng(42));
    const b = dealMissionOffers(ids(3), new Rng(42));
    const c = dealMissionOffers(ids(3), new Rng(43));
    for (const player of ids(3)) expect(a.get(player.id)).toHaveLength(MISSION_OFFERS_PER_PLAYER);
    const all = [...a.values()].flat().map((m) => m.id);
    expect(new Set(all).size).toBe(all.length);
    expect([...a.values()]).toEqual([...b.values()]);
    // Ids are opaque and identical across seeds; the cards behind them are not.
    const cards = (m: Map<string, Mission[]>) =>
      [...m.values()].flat().map(({ id: _id, ...card }) => card);
    expect(cards(a)).not.toEqual(cards(c));
  });

  it("keeps exactly a hand of offered missions and issues their crates", () => {
    const offers = dealMissionOffers(ids(2), new Rng(7)).get("p1")!;
    const hand = [
      ...offers.filter((m) => isPrimaryType(m.type)).slice(0, PRIMARIES_PER_PLAYER),
      ...offers.filter((m) => !isPrimaryType(m.type)).slice(0, SECONDARIES_PER_PLAYER),
    ];
    const picked = selectMissionsFromOffers(
      offers,
      hand.map((m) => m.id)
    );
    expect(picked.error).toBeUndefined();
    expect(picked.missions).toEqual(hand);
    expect(picked.cargo).toEqual(cratesForMissions(hand));
  });

  // Sized off the rule, not off a number: the hand has already changed once.
  it.each([
    ["too few", (o: Mission[]) => o.slice(0, MISSIONS_PER_PLAYER - 1).map((m) => m.id)],
    ["too many", (o: Mission[]) => o.slice(0, MISSIONS_PER_PLAYER + 1).map((m) => m.id)],
    [
      "an unknown id",
      (o: Mission[]) => [...o.slice(0, MISSIONS_PER_PLAYER - 1).map((m) => m.id), "nope"],
    ],
    [
      "a duplicate",
      (o: Mission[]) => [o[0].id, ...o.slice(0, MISSIONS_PER_PLAYER - 1).map((m) => m.id)],
    ],
  ])("rejects a selection with %s", (_label, pick) => {
    const offers = dealMissionOffers(ids(2), new Rng(7)).get("p1")!;
    const picked = selectMissionsFromOffers(offers, pick(offers));
    expect(picked.error).toBeDefined();
    expect(picked.missions).toEqual([]);
  });

  it("crates exist only for deliver missions and start at their origin", () => {
    const crates = cratesForMissions([
      destroyMission("p2"),
      deliverMission(ALPHA, BETA),
      surveyMission(),
    ]);
    expect(crates).toEqual([
      {
        id: "crate-deliver-planet-alpha-planet-beta",
        missionId: "deliver-planet-alpha-planet-beta",
        kind: "crate",
        pickupPlanetId: ALPHA,
        deliveryPlanetId: BETA,
        isPickedUp: false,
      },
    ]);
  });
});

/** p1 at R3 S0 with a powered railgun; p2 two sectors ahead. */
function gunline(): GameState {
  return withPower(
    makeTwoPlayerGame({ ring: 3, sector: 0 }, { ring: 3, sector: 2 }),
    "p1",
    "forward-0",
    4
  );
}

function docking(
  planet: string,
  missions: Mission[],
  cargoPatch?: (state: GameState) => GameState
): GameState {
  const base = makeGameState([
    makePlayer("p1"),
    makePlayer("p2", { wellId: BH, ring: 5, sector: 12 }),
  ]);
  let state = makeGameState([
    makePlayer("p1", { wellId: planet, ring: STATION_RING, sector: approachSector(base, planet) }),
    base.players[1],
  ]);
  state = withMissions(state, "p1", missions);
  return cargoPatch ? cargoPatch(state) : state;
}

describe("missions: combat", () => {
  it("destroy completes when the target dies by your hand this turn, is worth two points, and is announced publicly", () => {
    const state = withMissions(withShip(gunline(), "p2", { hitPoints: 4 }), "p1", [
      destroyMission("p2"),
    ]);
    const result = executeTurnAs(state, fire(1, "forward-0", "p2"));
    const [completed] = eventsOf(result.events, "mission_completed");
    expect(completed).toMatchObject({
      playerId: "p1",
      completedCount: MISSION_POINTS.destroy_ship,
      mission: { id: "destroy-p2", isCompleted: true },
    });
    expect(completed).not.toHaveProperty("privateTo");
    expect(getPlayer(result.gameState, "p1")).toMatchObject({
      completedMissionCount: MISSION_POINTS.destroy_ship,
    });
    expect(getPlayer(result.gameState, "p1").missions[0].isCompleted).toBe(true);
  });

  it("destroy does not complete on a survivor or a target killed by someone else earlier", () => {
    const survivor = executeTurnAs(
      withMissions(gunline(), "p1", [destroyMission("p2")]),
      fire(1, "forward-0", "p2")
    );
    expect(eventTypes(survivor.events)).not.toContain("mission_completed");

    // p2 dies of heat on its own turn; p1 holds Destroy p2 and gets nothing when play returns.
    let state = withMissions(makeTwoPlayerGame(), "p1", [destroyMission("p2")]);
    state = mustExecute(state, coast(1));
    state = withShip(state, "p2", { hitPoints: 1, heat: { currentHeat: 20 } });
    const p2Turn = executeTurnAs(state, coast(1));
    expect(eventsOf(p2Turn.events, "ship_destroyed")[0]).not.toHaveProperty("killerId");
    const p1Turn = executeTurnAs(p2Turn.gameState, coast(1));
    expect(eventTypes(p1Turn.events)).not.toContain("mission_completed");
    expect(getPlayer(p1Turn.gameState, "p1").completedMissionCount).toBe(0);
  });

  it("a destroy card only counts its own target", () => {
    let state = makeGameState([
      makePlayer("p1", { wellId: BH, ring: 3, sector: 0 }),
      makePlayer("p2", { wellId: BH, ring: 3, sector: 2 }),
      makePlayer("p3", { wellId: BH, ring: 3, sector: 20 }),
    ]);
    state = withPower(state, "p1", "forward-0", 4);
    state = withShip(state, "p2", { hitPoints: 4 });
    state = withMissions(state, "p1", [destroyMission("p3")]);
    const result = executeTurnAs(state, fire(1, "forward-0", "p2"));
    expect(eventsOf(result.events, "ship_destroyed")[0]).toMatchObject({
      victimId: "p2",
      killerId: "p1",
    });
    expect(eventTypes(result.events)).not.toContain("mission_completed");
  });

  it("a missile kill at the end of the turn credits its owner's destroy card", () => {
    let state = makeGameState([
      makePlayer("p1", { wellId: BH, ring: 5, sector: 10 }),
      makePlayer("p2", { wellId: BH, ring: 5, sector: 13 }),
    ]);
    state = withShip(state, "p2", { hitPoints: 2 });
    state = withMissions(state, "p1", [destroyMission("p2")]);
    state = withMissile(state, { ring: 5, sector: 12 });
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "ship_destroyed")[0]).toMatchObject({
      cause: "missile",
      killerId: "p1",
    });
    expect(eventsOf(result.events, "mission_completed")[0].mission.id).toBe("destroy-p2");
  });

  it("two destroy cards on the same victim both complete on one kill", () => {
    const state = withMissions(withShip(gunline(), "p2", { hitPoints: 4 }), "p1", [
      destroyMission("p2", "destroy-a"),
      destroyMission("p2", "destroy-b"),
    ]);
    const result = executeTurnAs(state, fire(1, "forward-0", "p2"));
    expect(eventsOf(result.events, "mission_completed").map((e) => e.mission.id)).toEqual([
      "destroy-a",
      "destroy-b",
    ]);
    expect(getPlayer(result.gameState, "p1").completedMissionCount).toBe(
      2 * MISSION_POINTS.destroy_ship
    );
  });
});

describe("missions: trade", () => {
  it("deliver completes when the picked-up crate reaches its destination", () => {
    const state = docking(BETA, [deliverMission(ALPHA, BETA)], (s) =>
      withPlayer(s, "p1", { cargo: s.players[0].cargo.map((c) => ({ ...c, isPickedUp: true })) })
    );
    const result = executeTurnAs(state, coast(1));
    expect(eventTypes(result.events)).toEqual(
      expect.arrayContaining(["cargo_delivered", "docked", "mission_completed"])
    );
    expect(getPlayer(result.gameState, "p1").cargo).toEqual([]);
    expect(getPlayer(result.gameState, "p1").completedMissionCount).toBe(
      MISSION_POINTS.deliver_cargo
    );
  });

  it("deliver does not complete without the pickup, and picking up completes nothing", () => {
    const atDestination = executeTurnAs(docking(BETA, [deliverMission(ALPHA, BETA)]), coast(1));
    expect(eventTypes(atDestination.events)).not.toContain("mission_completed");
    const atOrigin = executeTurnAs(docking(ALPHA, [deliverMission(ALPHA, BETA)]), coast(1));
    expect(eventTypes(atOrigin.events)).toContain("cargo_picked_up");
    expect(eventTypes(atOrigin.events)).not.toContain("mission_completed");
  });

  /** An Intercept already scanned, its chit aboard, filed at `filedAt`. */
  const carryingTransmission = (filedAt: string) => {
    const card = { ...interceptMission("p2", "intercept-p2", filedAt), scanAcquired: true };
    const withChit = (s: GameState) =>
      withPlayer(s, "p1", {
        cargo: [
          {
            id: card.dataCargoId,
            missionId: card.id,
            kind: "data" as const,
            deliveryPlanetId: card.deliveryPlanetId,
            isPickedUp: true,
          },
        ],
      });
    return { card, withChit };
  };

  it("intercept completes at the station the card names", () => {
    const { card, withChit } = carryingTransmission(GAMMA);
    const result = executeTurnAs(docking(GAMMA, [card], withChit), coast(1));
    expect(eventsOf(result.events, "mission_completed")[0].mission.id).toBe(card.id);
  });

  it("intercept files nothing at any other station", () => {
    const { card, withChit } = carryingTransmission(GAMMA);
    const result = executeTurnAs(docking(BETA, [card], withChit), coast(1));
    expect(eventTypes(result.events)).toContain("docked");
    expect(eventTypes(result.events)).not.toContain("mission_completed");
    // The chit stays aboard for the trip to the right station.
    expect(getPlayer(result.gameState, "p1").cargo).toHaveLength(1);
  });

  it("intercept needs the scan first: docking with nothing completes nothing", () => {
    const result = executeTurnAs(docking(GAMMA, [interceptMission("p2")]), coast(1));
    expect(eventTypes(result.events)).not.toContain("mission_completed");
  });
});

const SENSOR_HULL: ShipLoadout = {
  forwardSlots: ["sensor_array"],
  sideSlots: ["laser", "shields", "radiator", "radiator"],
};

/** p1 on black hole ring 1 with its sensor array powered, holding a Survey. */
function surveying(
  position: { wellId?: string; ring: number; sector: number } = { ring: SURVEY_RING, sector: 0 }
) {
  const state = withMissions(
    makeTwoPlayerGame({ ...position, loadout: SENSOR_HULL }, { wellId: BH, ring: 4, sector: 12 }),
    "p1",
    [surveyMission("survey-1")]
  );
  return withPower(state, "p1", "forward-0", 2);
}

describe("missions: secondary", () => {
  it("survey data is taken on any turn ended on ring 1 (privately)", () => {
    const result = executeTurnAs(surveying(), coast(1));
    expect(eventsOf(result.events, "data_acquired")).toEqual([
      expect.objectContaining({
        playerId: "p1",
        kind: "survey",
        missionId: "survey-1",
        privateTo: ["p1"],
      }),
    ]);
    const player = getPlayer(result.gameState, "p1");
    expect(player.missions[0]).toMatchObject({ acquired: true });
    expect(player.cargo).toEqual([
      expect.objectContaining({ missionId: "survey-1", kind: "data", deliveryPlanetId: "any" }),
    ]);
  });

  it.each([
    ["ring 2 of the black hole", { wellId: BH, ring: 2, sector: 0 }],
    ["the innermost ring of a planet", { wellId: ALPHA, ring: 1, sector: 5 }],
  ])("survey is not held on %s", (_label, position) => {
    const result = executeTurnAs(surveying(position), coast(1));
    expect(eventTypes(result.events)).not.toContain("survey_hold");
    expect(eventTypes(result.events)).not.toContain("data_acquired");
  });

  it("chit cards file at any station; the disposal card files nowhere", () => {
    const deck = buildSecondaryDeck();
    const secondary = deck.filter((m) => MISSION_FAMILY[m.type] === "secondary");
    expect(secondary).toHaveLength(SECONDARY_CARDS_PER_DECK);
    for (const m of secondary) {
      if (m.type === "garbage_disposal") expect("deliveryPlanetId" in m).toBe(false);
      else expect("deliveryPlanetId" in m && m.deliveryPlanetId).toBe("any");
    }
  });

  it("boarding takes the chit when a turn ends in another ship's exact sector", () => {
    const state = withMissions(
      makeTwoPlayerGame({ wellId: BH, ring: 3, sector: 0 }, { wellId: BH, ring: 3, sector: 4 }),
      "p1",
      [secondaryMission("board")]
    );
    // Ring 3 drifts 4: both ships coast and p1 lands where p2 was, together.
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "data_acquired")).toEqual([
      expect.objectContaining({ playerId: "p1", kind: "board", privateTo: ["p1"] }),
    ]);
  });

  it.each([
    ["one sector short", 3],
    ["one ring off", 4],
  ])("boarding takes nothing %s", (_label, offset) => {
    const other = offset === 4 ? { wellId: BH, ring: 4, sector: 0 } : { wellId: BH, ring: 3, sector: offset };
    const state = withMissions(
      makeTwoPlayerGame({ wellId: BH, ring: 3, sector: 0 }, other),
      "p1",
      [secondaryMission("board")]
    );
    expect(eventTypes(executeTurnAs(state, coast(1)).events)).not.toContain("data_acquired");
  });

  it("a load of garbage is collected at any station, and docking never takes it", () => {
    const card = garbageMission();
    // The card names no station: whichever one you dock at loads it.
    const arrival = executeTurnAs(docking(ALPHA, [card]), coast(1));
    expect(eventsOf(arrival.events, "cargo_picked_up").map((e) => e.cargoId)).toEqual([
      card.cargoId,
    ]);
    expect(eventTypes(arrival.events)).not.toContain("cargo_delivered");
    expect(getPlayer(arrival.gameState, "p1").completedMissionCount).toBe(0);
  });

  it("the load is jettisoned on ring 1, and that is the whole card", () => {
    const card = garbageMission();
    let state = withMissions(
      makeTwoPlayerGame({ wellId: BH, ring: SURVEY_RING, sector: 0 }),
      "p1",
      [card]
    );
    state = withPlayer(state, "p1", {
      cargo: getPlayer(state, "p1").cargo.map((c) => ({ ...c, isPickedUp: true })),
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "cargo_dumped")[0].cargoId).toBe(card.cargoId);
    const p1 = getPlayer(result.gameState, "p1");
    expect(p1.cargo).toEqual([]);
    expect(p1.completedMissionCount).toBe(MISSION_POINTS.garbage_disposal);
  });

  it("a load only counts once it is aboard: ring 1 empty-handed drops nothing", () => {
    const state = withMissions(
      makeTwoPlayerGame({ wellId: BH, ring: SURVEY_RING, sector: 0 }),
      "p1",
      [garbageMission()]
    );
    const result = executeTurnAs(state, coast(1));
    expect(eventTypes(result.events)).not.toContain("cargo_dumped");
    expect(getPlayer(result.gameState, "p1").completedMissionCount).toBe(0);
  });

  it("the hold takes the load or a delivery crate, never both", () => {
    const garbage = garbageMission();
    const state = docking(ALPHA, [deliverMission(ALPHA, BETA), garbage]);
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "cargo_picked_up")).toHaveLength(1);
    const aboard = getPlayer(result.gameState, "p1").cargo.filter((c) => c.isPickedUp);
    expect(aboard).toHaveLength(1);
  });

  it("a ship that burns up on ring 1 acquires nothing", () => {
    const state = withMissions(
      withShip(makeTwoPlayerGame({ ring: 1 }), "p1", { hitPoints: 1, heat: { currentHeat: 20 } }),
      "p1",
      [surveyMission()]
    );
    const result = executeTurnAs(state, coast(1));
    expect(eventTypes(result.events)).toContain("ship_destroyed");
    expect(eventTypes(result.events)).not.toContain("data_acquired");
  });

  it("survey completes when the data is delivered", () => {
    const acquired = { ...surveyMission(), acquired: true };
    const state = docking(ALPHA, [acquired], (s) =>
      withPlayer(s, "p1", {
        cargo: [
          {
            id: acquired.dataCargoId,
            missionId: acquired.id,
            kind: "data",
            deliveryPlanetId: "any",
            isPickedUp: true,
          },
        ],
      })
    );
    expect(
      eventsOf(executeTurnAs(state, coast(1)).events, "mission_completed")[0].mission.type
    ).toBe("survey");
  });
});

describe("missions: winning", () => {
  it("a primary on top of one secondary starts the final round; the game ends when the round does", () => {
    // Three points win, and a hand holds five: the primary and either
    // secondary is the win, so a seat with one chit filed wins on the kill.
    const done = [{ ...surveyMission("s"), acquired: true, isCompleted: true }];
    let state = withShip(gunline(), "p2", { hitPoints: 4 });
    state = withPlayer(state, "p1", {
      missions: [...done, destroyMission("p2")],
      completedMissionCount: 1,
    });
    // p1 (first seat) reaches 3: not over yet, p2 still gets this round's turn.
    const result = executeTurnAs(state, fire(1, "forward-0", "p2"));
    expect(result.gameState.phase).toBe("active");
    expect(result.gameState.finalRound).toBe(true);
    expect(eventsOf(result.events, "final_round")).toEqual([
      expect.objectContaining({ playerId: "p1", points: 3, turnsLeft: 1 }),
    ]);
    expect(eventsOf(result.events, "game_ended")).toEqual([]);
    expect(checkForWinner(result.gameState)?.id).toBe("p1");
    expect(completedMissions(getPlayer(result.gameState, "p1")).map((m) => m.id)).toEqual([
      "s",
      "destroy-p2",
    ]);

    // p2's turn (a respawn turn, since it was just destroyed) closes the round.
    const closed = executeTurnAs(result.gameState, coast(1));
    expect(closed.gameState.phase).toBe("ended");
    expect(closed.gameState.winnerId).toBe("p1");
    expect(eventsOf(closed.events, "game_ended")).toEqual([
      expect.objectContaining({ winnerId: "p1", decidedBy: "points" }),
    ]);

    const after = executeTurnAs(closed.gameState, coast(1));
    expect(after.errors?.[0]).toMatch(/phase/i);
    expect(after.gameState).toBe(closed.gameState);
  });

  it("the last seat reaching the points ends the game at once, and a tie on points goes to hull", () => {
    // p2 (last seat) is at 2 points with less hull; p1 is at 3 already, waiting for the round to end.
    let state = withShip(gunline(), "p2", { hitPoints: 4 });
    state = withPlayer(state, "p1", {
      missions: [
        { ...destroyMission("p2", "t"), isCompleted: true },
        { ...surveyMission("s"), isCompleted: true, acquired: true },
      ],
      completedMissionCount: 3,
    });
    state = { ...state, finalRound: true, activePlayerIndex: 1 };
    // p2 coasts: round over, p1 wins on points.
    const closed = executeTurnAs(state, coast(1));
    expect(closed.gameState.phase).toBe("ended");
    expect(closed.gameState.winnerId).toBe("p1");

    // Same board, but both at 3 points: hull decides (p1 has 10, p2 has 4).
    const tied = withPlayer(state, "p2", { completedMissionCount: 3 });
    const decided = executeTurnAs(tied, coast(1));
    expect(decided.gameState.winnerId).toBe("p1");
    expect(eventsOf(decided.events, "game_ended")).toEqual([
      expect.objectContaining({ winnerId: "p1", decidedBy: "hull" }),
    ]);
  });

  // Three points win, so a primary on its own is one point short — and so are
  // the two secondaries a hand keeps.
  it("two points do not end the game: a Destroy alone is not a win", () => {
    let state = withShip(gunline(), "p2", { hitPoints: 4 });
    state = withPlayer(state, "p1", {
      missions: [destroyMission("p2")],
      completedMissionCount: 0,
    });
    const result = executeTurnAs(state, fire(1, "forward-0", "p2"));
    expect(getPlayer(result.gameState, "p1").completedMissionCount).toBe(2);
    expect(result.gameState.phase).toBe("active");
    expect(checkForWinner(result.gameState)).toBeUndefined();
  });
});

describe("missions: the points the table plays to", () => {
  const SPECS = [
    { id: "p1", name: "One" },
    { id: "p2", name: "Two" },
  ];

  it("is three when the table agrees nothing", () => {
    expect(createGame(SPECS, 1).pointsToWin).toBe(DEFAULT_POINTS_TO_WIN);
  });

  it.each([
    ["three", 3],
    ["four", 4],
  ])("is the %s the table agreed on, and the view says so", (_case, pointsToWin) => {
    const state = createGame(SPECS, 1, { pointsToWin });
    expect(state.pointsToWin).toBe(pointsToWin);
    expect(viewFor(state, "p1").pointsToWin).toBe(pointsToWin);
  });

  it.each([
    ["three", 3, 2, false],
    ["three", 3, 3, true],
    ["four", 4, 3, false],
    ["four", 4, 4, true],
  ])(
    "at a table on %s, %i points reached by a seat with %i triggers the final round: %s",
    (_case, pointsToWin, completed, triggers) => {
      const state = withPlayer(makeTwoPlayerGame({}, {}, { pointsToWin }), "p1", {
        completedMissionCount: completed,
      });
      expect(checkForWinner(state)?.id).toBe(triggers ? "p1" : undefined);
    }
  );

  it("plays the fourth point out at a four-point table where three would have ended it", () => {
    // p1 holds a filed chit and a Destroy: the kill takes it to three, which
    // ends a three-point game and is one short of a four-point one.
    const done = [{ ...surveyMission("s"), acquired: true, isCompleted: true }];
    const setUp = (pointsToWin: number) =>
      withPlayer(withShip({ ...gunline(), pointsToWin }, "p2", { hitPoints: 4 }), "p1", {
        missions: [...done, destroyMission("p2")],
        completedMissionCount: 1,
      });

    const atThree = executeTurnAs(setUp(3), fire(1, "forward-0", "p2"));
    expect(getPlayer(atThree.gameState, "p1").completedMissionCount).toBe(3);
    expect(atThree.gameState.finalRound).toBe(true);

    const atFour = executeTurnAs(setUp(4), fire(1, "forward-0", "p2"));
    expect(getPlayer(atFour.gameState, "p1").completedMissionCount).toBe(3);
    expect(atFour.gameState.finalRound).toBeUndefined();
    expect(checkForWinner(atFour.gameState)).toBeUndefined();
  });

  it.each([
    ["one point", 1],
    ["zero", 0],
    ["a fraction", 2.5],
    ["nonsense", Number.NaN],
  ])("refuses %s as the number to play to", (_case, pointsToWin) => {
    expect(() => createGame(SPECS, 1, { pointsToWin })).toThrow();
  });
});
