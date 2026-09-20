/**
 * The bot plays all four mission types. Each test puts a bot in front of one
 * mission's next step and checks it takes it — and that the engine accepts
 * the turn.
 */
import { describe, it, expect } from "vitest";
import type { GameState, PlayerAction, Position, ShipLoadout } from "../../models/game.ts";
import { MAX_REACTION_MASS, STARTING_HIT_POINTS } from "../../models/game.ts";
import type { Mission, SecondaryMission } from "../../models/missions.ts";
import { SURVEY_RING, TANKER_FUEL } from "../../models/missions.ts";
import { BLACK_HOLE_ID, BLACK_HOLE_OUTER_RING, STATION_RING } from "../../models/gravityWells.ts";
import { executeTurn } from "../../game/turns.ts";
import { ringVelocity } from "../../game/geometry.ts";
import { viewFor } from "../../game/view.ts";
import { getStationForPlanet } from "../../game/stations.ts";
import { analyzeSituation, botDecideActions } from "../../ai/index.ts";
import { predictedDeliveryPlanets } from "../../ai/behaviors/danger.ts";
import { DEFAULT_BOT_PARAMETERS } from "../../ai/types.ts";
import {
  ALPHA,
  BETA,
  BH,
  GAMMA,
  approachSector,
  deliverMission,
  getPlayer,
  getShip,
  interceptMission,
  makeGameState,
  makePlayer,
  makeTwoPlayerGame,
  piracyMission,
  surveyMission,
  tankerMission,
  withMissions,
  withPlayer,
  withPower,
  withShip,
} from "../testUtils.ts";

/** Sensor array forward: the hull the bot picks for Intercept work. */
const SCOUT: ShipLoadout = {
  forwardSlots: ["sensor_array"],
  sideSlots: ["shields", "radiator", "radiator", "laser"],
};

const coastAs = (playerId: string): PlayerAction[] => [
  { type: "coast", playerId, sequence: 1, data: { activateScoop: false } },
];

/**
 * Play turns until `done` or the budget runs out. The bot decides from its
 * own view; every other player coasts.
 */
function playUntil(
  start: GameState,
  botId: string,
  done: (state: GameState) => boolean,
  maxTurns = 60
): GameState {
  let state = start;
  for (let i = 0; i < maxTurns && state.phase === "active" && !done(state); i++) {
    const active = state.players[state.activePlayerIndex];
    const actions =
      active.id === botId ? botDecideActions(viewFor(state, botId)).actions : coastAs(active.id);
    const result = executeTurn(state, actions);
    expect(result.errors, `turn ${i} by ${active.id}`).toBeUndefined();
    state = result.gameState;
  }
  return state;
}

const SENSOR_HULL: ShipLoadout = {
  forwardSlots: ["sensor_array"],
  sideSlots: ["laser", "shields", "radiator", "radiator"],
};

describe("bot missions", () => {
  it("scans an Intercept target that is on its ring and within range", () => {
    const state = withMissions(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: SCOUT },
        { wellId: BH, ring: 3, sector: 2 }
      ),
      "p1",
      [interceptMission("p2")]
    );

    const decision = botDecideActions(viewFor(state, "p1"));
    const scans = decision.actions.filter((a) => a.type === "scan");
    expect(scans).toHaveLength(1);
    expect(scans[0].data.targetPlayerId).toBe("p2");

    const result = executeTurn(state, decision.actions);
    expect(result.errors).toBeUndefined();
    const mission = getPlayer(result.gameState, "p1").missions[0];
    expect(mission.type === "intercept_transmission" && mission.scanAcquired).toBe(true);
    // The transmission is aboard as data, to be delivered at any station.
    expect(getPlayer(result.gameState, "p1").cargo.some((c) => c.kind === "data")).toBe(true);
  });

  it("moves onto the target's ring first and scans after the move", () => {
    // Two rings out: the scan is only legal once the burn has landed, so it
    // must be sequenced after the movement.
    const state = withMissions(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: SCOUT },
        { wellId: BH, ring: 5, sector: 2 }
      ),
      "p1",
      [interceptMission("p2")]
    );

    const decision = botDecideActions(viewFor(state, "p1"));
    const scan = decision.actions.find((a) => a.type === "scan");
    const move = decision.actions.find(
      (a) => a.type === "burn" || a.type === "coast" || a.type === "well_transfer"
    );
    expect(scan).toBeDefined();
    expect(move).toBeDefined();
    expect(scan!.sequence!).toBeGreaterThan(move!.sequence!);

    const result = executeTurn(state, decision.actions);
    expect(result.errors).toBeUndefined();
    const mission = getPlayer(result.gameState, "p1").missions[0];
    expect(mission.type === "intercept_transmission" && mission.scanAcquired).toBe(true);
  });

  it("does not try to scan across gravity wells", () => {
    const state = withMissions(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: SCOUT },
        { wellId: ALPHA, ring: 3, sector: 0 }
      ),
      "p1",
      [interceptMission("p2")]
    );
    const decision = botDecideActions(viewFor(state, "p1"));
    expect(decision.actions.filter((a) => a.type === "scan")).toHaveLength(0);
    expect(executeTurn(state, decision.actions).errors).toBeUndefined();
  });

  it("dives to black hole ring 1 for a Survey", () => {
    const start = withMissions(
      makeGameState([
        makePlayer("p1", { wellId: BH, ring: 4, sector: 0 }, SENSOR_HULL),
        makePlayer("p2", { wellId: ALPHA, ring: 3, sector: 12 }),
      ]),
      "p1",
      [surveyMission()]
    );

    const acquired = (s: GameState) =>
      (getPlayer(s, "p1").missions[0] as SecondaryMission).acquired;
    const state = playUntil(start, "p1", acquired, 60);

    expect(acquired(state)).toBe(true);
    expect(getPlayer(state, "p1").cargo.some((c) => c.kind === "data")).toBe(true);
  });

  it("docks at the pickup station for a Deliver card", () => {
    const station = getStationForPlanet(makeGameState([]).stations, ALPHA)!;
    const start = withMissions(
      makeGameState([
        makePlayer("p1", {
          wellId: ALPHA,
          ring: STATION_RING,
          sector: approachSector(makeGameState([]), ALPHA),
        }),
        makePlayer("p2", { wellId: BETA, ring: 3, sector: 12 }),
      ]),
      "p1",
      [deliverMission(ALPHA, BETA)]
    );
    expect(station.ring).toBe(STATION_RING);

    const result = executeTurn(start, botDecideActions(viewFor(start, "p1")).actions);
    expect(result.errors).toBeUndefined();
    const crate = getPlayer(result.gameState, "p1").cargo[0];
    expect(crate.isPickedUp).toBe(true);
  });

  it("turns around for the delivery planet once the crate is aboard", () => {
    const start = withMissions(
      makeGameState([
        makePlayer("p1", {
          wellId: ALPHA,
          ring: STATION_RING,
          sector: approachSector(makeGameState([]), ALPHA),
        }),
        makePlayer("p2", { wellId: GAMMA, ring: 3, sector: 12 }),
      ]),
      "p1",
      [deliverMission(ALPHA, BETA)]
    );

    const picked = executeTurn(start, botDecideActions(viewFor(start, "p1")).actions).gameState;
    expect(getPlayer(picked, "p1").cargo[0].isPickedUp).toBe(true);

    // The goal is no longer the pickup station: the crate has to reach BETA.
    const goal = botDecideActions(viewFor(picked, "p1")).log.situation.currentGoal;
    expect(goal).toContain(BETA);
  });

  it("stops surveying once the data is aboard and files it at the station the circuit reaches first", () => {
    // A survey chit is filed anywhere — the deck deals every survey card with
    // "any" for its station — so the bot takes the door it is
    // already standing under. From black hole ring 1 sector 0 that is Beta's
    // outbound lane at ring 5 sectors 0-3, not Alpha's at 16-19.
    const start = withMissions(
      makeGameState([
        makePlayer("p1", { wellId: BLACK_HOLE_ID, ring: SURVEY_RING, sector: 0 }, SENSOR_HULL),
        makePlayer("p2", { wellId: ALPHA, ring: 3, sector: 12 }),
      ]),
      "p1",
      [surveyMission("survey-1")]
    );

    const completed = (s: GameState) => getPlayer(s, "p1").completedMissionCount > 0;
    const state = playUntil(start, "p1", completed, 120);
    expect(completed(state)).toBe(true);
    expect(getShip(state, "p1").wellId).toBe(BETA);
  });
});

describe("bot goals: piracy and tanker", () => {
  const goalFor = (state: GameState, missionId: string) =>
    analyzeSituation(viewFor(state, "p1"), DEFAULT_BOT_PARAMETERS).goals.find(
      (g) => g.missionId === missionId
    );
  const currentGoal = (state: GameState) =>
    analyzeSituation(viewFor(state, "p1"), DEFAULT_BOT_PARAMETERS).currentGoal;

  /** The two-point card the seat cannot win without, open and done. */
  const PRIMARY = deliverMission(GAMMA, BETA, "primary-p1");
  const PRIMARY_DONE: Mission = { ...PRIMARY, isCompleted: true };

  /** p1 holds `missions`; p3 is nearer than p2, and p2 is the one carrying. */
  const table = (
    missions: Mission[],
    carrier: Position = { wellId: BH, ring: 3, sector: 8 }
  ): GameState => {
    let state = makeGameState([
      makePlayer("p1", { wellId: BH, ring: 3, sector: 0 }),
      makePlayer("p2", carrier),
      makePlayer("p3", { wellId: BH, ring: 3, sector: 1 }),
    ]);
    state = withMissions(state, "p1", missions);
    state = withMissions(state, "p2", [deliverMission(ALPHA, BETA)]);
    return withPlayer(state, "p2", {
      cargo: getPlayer(state, "p2").cargo.map((c) => ({ ...c, isPickedUp: true })),
    });
  };

  it("goes after the ship that is carrying, not the ship that is closest", () => {
    const card = piracyMission();
    expect(goalFor(table([card]), card.id)).toMatchObject({
      type: "pirate",
      targetPlayerId: "p2",
    });
  });

  it("counts a chit as loot: a ship carrying only data is prey", () => {
    const card = piracyMission();
    const state = table([card]);
    const chitOnly = withPlayer(state, "p2", {
      cargo: getPlayer(state, "p2").cargo.map((c) => ({ ...c, kind: "data" as const })),
    });
    expect(goalFor(chitOnly, card.id)).toMatchObject({ type: "pirate", targetPlayerId: "p2" });
  });

  it("has nobody to chase while every hold at the table is empty", () => {
    const card = piracyMission();
    const state = table([card]);
    const empty = withPlayer(state, "p2", {
      cargo: getPlayer(state, "p2").cargo.map((c) => ({ ...c, isPickedUp: false })),
    });
    expect(goalFor(empty, card.id)).toBeUndefined();
  });

  it("turns for a station once the seized crate is aboard", () => {
    const card = piracyMission();
    const state = withPlayer(table([card]), "p1", {
      cargo: [
        {
          id: card.cargoId,
          missionId: card.id,
          kind: "crate",
          deliveryPlanetId: "any",
          isPickedUp: true,
        },
      ],
    });
    expect(goalFor(state, card.id)).toMatchObject({ type: "dock" });
  });

  it.each([
    ["too little to arrive with the fuel", TANKER_FUEL - 1, "tanker"],
    ["enough to arrive with the fuel", MAX_REACTION_MASS, "dock"],
  ])("a tanker with %s heads for the %s", (_label, reactionMass, type) => {
    const card = tankerMission();
    const state = withShip(table([card]), "p1", { reactionMass });
    expect(goalFor(state, card.id)).toMatchObject({ type });
  });

  // The pumping happens on any arrival with the fuel aboard, so while the
  // two-point card somebody else set the seat is still open the Tanker is not a
  // destination at all: it is the fuel held back on the trips the seat is
  // already making.
  describe("the tanker waits for the primary", () => {
    it.each([
      ["a tank that could not pump", 3],
      ["the fuel and the approach aboard", MAX_REACTION_MASS],
    ])("makes no trip of its own with %s while the primary is open", (_label, reactionMass) => {
      const card = tankerMission();
      const state = withShip(table([card, PRIMARY]), "p1", { reactionMass });
      expect(goalFor(state, card.id)).toBeUndefined();
      expect(currentGoal(state)?.missionId).toBe(PRIMARY.id);
    });

    it("holds the fuel back on a dock trip it was making anyway", () => {
      // ALPHA ring 1 is a berth away from its station: the fastest route burns
      // the tank down to one and pumps nothing, and one turn longer arrives
      // with seven. Without the card the seat takes the fast route.
      const card = tankerMission();
      const berth = (missions: Mission[]): GameState => {
        const start = makeGameState([
          makePlayer("p1", { wellId: ALPHA, ring: 1, sector: 0 }),
          makePlayer("p2", { wellId: BH, ring: 3, sector: 12 }),
        ]);
        return withShip(withMissions(start, "p1", missions), "p1", {
          reactionMass: MAX_REACTION_MASS,
        });
      };
      const fetch = deliverMission(ALPHA, BETA, "fetch-p1");

      const tanking = currentGoal(berth([fetch, card]));
      const plain = currentGoal(berth([fetch]));
      expect(tanking?.missionId).toBe(fetch.id);
      expect(plain?.missionId).toBe(fetch.id);
      // The fuel still aboard when it makes port, which is what pumps.
      expect(MAX_REACTION_MASS - tanking!.plan!.totalMassCost).toBeGreaterThanOrEqual(TANKER_FUEL);
      expect(MAX_REACTION_MASS - plain!.plan!.totalMassCost).toBeLessThan(TANKER_FUEL);
      expect(tanking!.plan!.totalTurns).toBeGreaterThan(plain!.plan!.totalTurns);
    });

    it("fills at the nearest fast ring, not the event horizon, once the primary is in", () => {
      const card = tankerMission();
      const start = makeGameState([
        makePlayer("p1", { wellId: BH, ring: BLACK_HOLE_OUTER_RING, sector: 0 }),
        makePlayer("p2", { wellId: ALPHA, ring: 3, sector: 12 }),
      ]);
      const state = withShip(withMissions(start, "p1", [card, PRIMARY_DONE]), "p1", {
        reactionMass: 3,
      });

      const goal = currentGoal(state);
      expect(goal?.missionId).toBe(card.id);
      const destination = goal?.plan?.destination;
      expect(destination?.wellId).toBe(BH);
      expect(destination?.ring).not.toBe(SURVEY_RING);
      expect(ringVelocity(BH, destination!.ring)).toBeGreaterThanOrEqual(4);
    });
  });

  // A chase across the map never closes: the crate is already running for a
  // station and the lanes are one-way.
  describe("piracy hunts what it can catch", () => {
    it.each([
      { where: "two turns off", carrier: { wellId: BH, ring: 3, sector: 6 }, turns: 3, urgency: 2 },
      {
        where: "six turns off",
        carrier: { wellId: BH, ring: 1, sector: 12 },
        turns: 7,
        urgency: 0,
      },
    ])("chases a carrier $where at urgency $urgency", ({ carrier, turns, urgency }) => {
      const card = piracyMission();
      const state = table([card, PRIMARY], carrier as Position);
      expect(goalFor(state, card.id)).toMatchObject({
        type: "pirate",
        targetPlayerId: "p2",
        estimatedTurns: turns,
        urgency,
      });
    });

    it("leaves a carrier in another well alone while the primary is open", () => {
      const card = piracyMission();
      const state = table([card, PRIMARY], { wellId: ALPHA, ring: 3, sector: 0 });
      expect(goalFor(state, card.id)).toBeUndefined();
    });

    it("ambushes at the planet the carriers are running for once the primary is in", () => {
      const card = piracyMission();
      const carrier: Position = { wellId: ALPHA, ring: 3, sector: 0 };
      const state = table([card, PRIMARY_DONE], carrier);
      const predicted = predictedDeliveryPlanets(carrier, 1, 0, state.stations)[0];

      const goal = goalFor(state, card.id);
      expect(goal).toMatchObject({ type: "pirate", planetId: predicted });
      expect(goal?.targetPlayerId).toBeUndefined();
    });
  });
});

describe("goal order: the primary before the secondary", () => {
  /**
   * Three points win and the hand is one two-point primary plus two one-point
   * secondaries, so the primary is the only card the bot cannot do without.
   * Its first step — the Intercept's scan, the Deliver's pickup — is what used
   * to rank last: it finishes nothing by itself, while a survey dive is short
   * and a whole point. Ranking is cheapest-first after urgency, so at equal
   * distance the primary's opening step now goes first, and only a genuinely
   * longer trip (more than the urgency's three turns) sends the bot to the
   * secondary.
   *
   * Every fixture lists the survey card first, so a sort that ignored urgency
   * would leave the survey at the head of the list.
   */
  const goalsFor = (state: GameState) =>
    analyzeSituation(viewFor(state, "p1"), DEFAULT_BOT_PARAMETERS).goals;

  const goalOf = (state: GameState, missionId: string) => {
    const goal = goalsFor(state).find((g) => g.missionId === missionId);
    if (!goal) throw new Error(`no goal for ${missionId}`);
    return goal;
  };

  describe("Intercept's scan against a survey dive", () => {
    const SURVEY = surveyMission();
    const INTERCEPT = interceptMission("p2");

    /** p1 three rings above the survey ring, with the scan target where the row says. */
    const shadowing = (target: Position): GameState =>
      withMissions(
        makeGameState([
          makePlayer("p1", { wellId: BH, ring: 4, sector: 0 }, SENSOR_HULL),
          makePlayer("p2", target),
        ]),
        "p1",
        [SURVEY, INTERCEPT]
      );

    it.each([
      {
        where: "as near as the dive",
        target: { wellId: BH, ring: 2, sector: 0 } as Position,
        gap: 0,
        first: "the scan",
        firstId: INTERCEPT.id,
      },
      {
        where: "five turns past it",
        target: { wellId: BH, ring: 1, sector: 12 } as Position,
        gap: 5,
        first: "the dive",
        firstId: SURVEY.id,
      },
    ])("with the target $where, pursues $first first", ({ target, gap, firstId }) => {
      const state = shadowing(target);
      const shadow = goalOf(state, INTERCEPT.id);
      const dive = goalOf(state, SURVEY.id);
      expect(shadow.type).toBe("shadow");
      expect(shadow.estimatedTurns - dive.estimatedTurns).toBe(gap);
      expect(goalsFor(state)[0].missionId).toBe(firstId);
    });
  });

  describe("Deliver's pickup against a survey dive", () => {
    const SURVEY = surveyMission();

    /** p1 on black hole ring 5, four turns from the dive and from Alpha's berth. */
    const fetching = (pickupPlanetId: string, deliveryPlanetId: string): GameState =>
      withMissions(
        makeGameState([
          makePlayer("p1", { wellId: BH, ring: 5, sector: 13 }, SENSOR_HULL),
          makePlayer("p2", { wellId: ALPHA, ring: 3, sector: 12 }),
        ]),
        "p1",
        [SURVEY, deliverMission(pickupPlanetId, deliveryPlanetId)]
      );

    it.each([
      {
        where: "as near as the dive",
        pickup: ALPHA,
        delivery: BETA,
        gap: 0,
        first: "the pickup",
        pickupFirst: true,
      },
      {
        where: "six turns past it",
        pickup: GAMMA,
        delivery: ALPHA,
        gap: 6,
        first: "the dive",
        pickupFirst: false,
      },
    ])("with the pickup $where, pursues $first first", ({ pickup, delivery, gap, pickupFirst }) => {
      const state = fetching(pickup, delivery);
      const deliver = deliverMission(pickup, delivery);
      const fetch = goalOf(state, deliver.id);
      const dive = goalOf(state, SURVEY.id);
      expect(fetch.type).toBe("dock");
      expect(fetch.estimatedTurns - dive.estimatedTurns).toBe(gap);
      expect(goalsFor(state)[0].missionId).toBe(pickupFirst ? deliver.id : SURVEY.id);
    });
  });
});

describe("bot fuel in port", () => {
  /** p1 moored at ALPHA's station with `fuel` aboard, a delivery due at BETA. */
  const inPort = (fuel: number): GameState => {
    const station = getStationForPlanet(makeTwoPlayerGame().stations, ALPHA)!;
    const state = makeGameState([
      makePlayer("p1", { wellId: ALPHA, ring: STATION_RING, sector: station.sector }),
      makePlayer("p2", { wellId: BH, ring: 5, sector: 12 }),
    ]);
    return withShip(withMissions(state, "p1", [deliverMission(GAMMA, BETA)]), "p1", {
      reactionMass: fuel,
    });
  };

  it("fills the tank in port rather than leave on an empty one", () => {
    // A berth is as good a place to skim from as any, and a dry ship that cast
    // off would only have to come back (RULES §Stations).
    const state = withPower(inPort(0), "p1", "scoop", 3);
    const decision = botDecideActions(viewFor(state, "p1"));
    expect(decision.actions.some((a) => a.type === "coast" && a.data.activateScoop)).toBe(true);
    const result = executeTurn(state, decision.actions);
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1").reactionMass).toBeGreaterThan(0);
  });

  it("does not hold a berth it has already docked at once the tank is full", () => {
    // Docking resolved on arrival, so the berth has nothing left to give: with
    // fuel aboard and a mission elsewhere, the bot leaves.
    const state = inPort(10);
    const result = executeTurn(state, botDecideActions(viewFor(state, "p1")).actions);
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1").ring).not.toBe(STATION_RING);
  });
});

describe("bot turn handling", () => {
  it("returns no actions for a spectator view", () => {
    const state = makeTwoPlayerGame();
    expect(botDecideActions(viewFor(state, null)).actions).toEqual([]);
  });

  it("returns no actions while destroyed, and the engine spends the turn respawning", () => {
    const state = withShip(
      makeGameState([
        makePlayer("p1", { wellId: BH, ring: 3, sector: 0 }),
        makePlayer("p2", { wellId: BH, ring: 3, sector: 12 }),
      ]),
      "p1",
      { hitPoints: 0 }
    );

    const decision = botDecideActions(viewFor(state, "p1"));
    expect(decision.actions).toEqual([]);
    expect(decision.log.reasoning[0]).toMatch(/respawn/i);

    const result = executeTurn(state, decision.actions);
    expect(result.errors).toBeUndefined();
    const ship = getShip(result.gameState, "p1");
    expect(ship.hitPoints).toBe(STARTING_HIT_POINTS);
    expect(ship.wellId).toBe(getPlayer(state, "p1").home!.wellId);
  });
});
