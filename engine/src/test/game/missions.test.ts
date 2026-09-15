import { describe, it, expect } from "vitest";
import { DEFAULT_RULES } from "../../models/rules.ts";
import {
  buildMissionDeck,
  cratesForMissions,
  dealMissionOffers,
  selectMissionsFromOffers,
} from "../../game/missions/missionDeck.ts";
import { checkForWinner, completedMissions } from "../../game/missions/missionChecks.ts";
import { SURVEY_CARDS_PER_DECK } from "../../game/missions/missionDeck.ts";
import { MISSION_OFFERS_PER_PLAYER } from "../../models/missions.ts";
import type { Mission } from "../../models/missions.ts";
import type { GameState } from "../../models/game.ts";
import { PLANETS } from "../../models/gravityWells.ts";
import { Rng } from "../../utils/rng.ts";
import {
  ALPHA,
  BETA,
  BH,
  GAMMA,
  approachSector,
  coast,
  deliverMission,
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
  it.each([
    [2, 10],
    [3, 12],
    [4, 14],
  ])("a %i-player deck has %i cards: 2 per opponent + 6 deliver + 2 survey", (players, size) => {
    const [, ...opponents] = ids(players);
    const deck = buildMissionDeck(opponents, PLANET_IDS);
    expect(deck).toHaveLength(size);
    const count = (type: Mission["type"]) => deck.filter((m) => m.type === type).length;
    expect(count("destroy_ship")).toBe(players - 1);
    expect(count("intercept_transmission")).toBe(players - 1);
    expect(count("deliver_cargo")).toBe(6);
    expect(count("survey")).toBe(SURVEY_CARDS_PER_DECK);
  });

  it("every card starts uncompleted and with empty progress", () => {
    const [, ...opponents] = ids(3);
    const deck = buildMissionDeck(opponents, PLANET_IDS);
    expect(deck.every((m) => !m.isCompleted)).toBe(true);
    expect(
      deck.filter((m) => m.type === "intercept_transmission").every((m) => !m.scanAcquired)
    ).toBe(true);
    expect(deck.filter((m) => m.type === "survey").every((m) => !m.surveyAcquired)).toBe(true);
  });

  it("targets only opponents and covers every ordered planet pair once", () => {
    const [, ...opponents] = ids(3);
    const deck = buildMissionDeck(opponents, PLANET_IDS);
    const targets = deck.flatMap((m) => ("targetPlayerId" in m ? [m.targetPlayerId] : []));
    expect(targets).not.toContain("p1");
    expect(new Set(targets)).toEqual(new Set(["p2", "p3"]));
    const routes = deck.flatMap((m) =>
      m.type === "deliver_cargo" ? [`${m.pickupPlanetId}>${m.deliveryPlanetId}`] : []
    );
    expect(routes).toHaveLength(6);
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

  it("keeps exactly three offered missions and issues their crates", () => {
    const offers = dealMissionOffers(ids(2), new Rng(7)).get("p1")!;
    const picked = selectMissionsFromOffers(
      offers,
      offers.slice(0, 3).map((m) => m.id)
    );
    expect(picked.error).toBeUndefined();
    expect(picked.missions).toEqual(offers.slice(0, 3));
    expect(picked.cargo).toEqual(cratesForMissions(offers.slice(0, 3)));
  });

  it.each([
    ["too few", (o: Mission[]) => [o[0].id, o[1].id]],
    ["too many", (o: Mission[]) => o.slice(0, 4).map((m) => m.id)],
    ["an unknown id", (o: Mission[]) => [o[0].id, o[1].id, "nope"]],
    ["a duplicate", (o: Mission[]) => [o[0].id, o[0].id, o[1].id]],
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
    makePlayer("p1", { wellId: planet, ring: 1, sector: approachSector(base, planet) }),
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
      completedCount: DEFAULT_RULES.destroyPoints,
      mission: { id: "destroy-p2", isCompleted: true },
    });
    expect(completed).not.toHaveProperty("privateTo");
    expect(getPlayer(result.gameState, "p1")).toMatchObject({
      completedMissionCount: DEFAULT_RULES.destroyPoints,
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
      2 * DEFAULT_RULES.destroyPoints
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
    expect(getPlayer(result.gameState, "p1").completedMissionCount).toBe(1);
  });

  it("deliver does not complete without the pickup, and picking up completes nothing", () => {
    const atDestination = executeTurnAs(docking(BETA, [deliverMission(ALPHA, BETA)]), coast(1));
    expect(eventTypes(atDestination.events)).not.toContain("mission_completed");
    const atOrigin = executeTurnAs(docking(ALPHA, [deliverMission(ALPHA, BETA)]), coast(1));
    expect(eventTypes(atOrigin.events)).toContain("cargo_picked_up");
    expect(eventTypes(atOrigin.events)).not.toContain("mission_completed");
  });

  it("intercept completes when the acquired data is delivered at any station", () => {
    const acquired = { ...interceptMission("p2"), scanAcquired: true };
    const state = docking(GAMMA, [acquired], (s) =>
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
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "mission_completed")[0].mission.id).toBe(acquired.id);
  });

  it("intercept needs the scan first: docking with nothing completes nothing", () => {
    const result = executeTurnAs(docking(GAMMA, [interceptMission("p2")]), coast(1));
    expect(eventTypes(result.events)).not.toContain("mission_completed");
  });
});

describe("missions: daring", () => {
  it("survey data is acquired by ending a turn on black hole ring 1 (privately)", () => {
    const state = withMissions(makeTwoPlayerGame({ ring: 1, sector: 0 }), "p1", [surveyMission()]);
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "data_acquired")).toEqual([
      expect.objectContaining({
        playerId: "p1",
        kind: "survey",
        missionId: "survey-1",
        privateTo: ["p1"],
      }),
    ]);
    const player = getPlayer(result.gameState, "p1");
    expect(player.missions[0]).toMatchObject({ surveyAcquired: true, isCompleted: false });
    expect(player.cargo).toEqual([
      {
        id: "data-survey-1",
        missionId: "survey-1",
        kind: "data",
        deliveryPlanetId: "any",
        isPickedUp: true,
      },
    ]);
  });

  it.each([
    ["ring 2 of the black hole", { wellId: BH, ring: 2, sector: 0 }],
    ["ring 1 of a planet", { wellId: ALPHA, ring: 1, sector: 5 }],
  ])("survey is not acquired on %s", (_label, position) => {
    const state = withMissions(makeTwoPlayerGame(position), "p1", [surveyMission()]);
    const result = executeTurnAs(state, coast(1));
    expect(eventTypes(result.events)).not.toContain("data_acquired");
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
    const acquired = { ...surveyMission(), surveyAcquired: true };
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
  it("the third completed mission ends the game", () => {
    const done = [
      { ...surveyMission("s"), surveyAcquired: true, isCompleted: true },
      { ...destroyMission("p2", "t"), isCompleted: true },
    ];
    let state = withShip(gunline(), "p2", { hitPoints: 4 });
    state = withPlayer(state, "p1", {
      missions: [...done, destroyMission("p2")],
      completedMissionCount: 2,
    });
    const result = executeTurnAs(state, fire(1, "forward-0", "p2"));
    expect(result.gameState.phase).toBe("ended");
    expect(result.gameState.winnerId).toBe("p1");
    expect(eventsOf(result.events, "game_ended")).toEqual([
      expect.objectContaining({ winnerId: "p1" }),
    ]);
    expect(checkForWinner(result.gameState)?.id).toBe("p1");
    expect(completedMissions(getPlayer(result.gameState, "p1")).map((m) => m.id)).toEqual([
      "s",
      "t",
      "destroy-p2",
    ]);

    const after = executeTurnAs(result.gameState, coast(1));
    expect(after.errors?.[0]).toMatch(/phase/i);
    expect(after.gameState).toBe(result.gameState);
  });

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
