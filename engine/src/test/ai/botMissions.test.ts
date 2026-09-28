/**
 * The bot plays all four mission types. Each test puts a bot in front of one
 * mission's next step and checks it takes it, and that the engine accepts
 * the turn.
 */
import { describe, it, expect } from "vitest";
import type { GameState, PlayerAction, Position, ShipLoadout, Wreck } from "../../models/game.ts";
import { MAX_REACTION_MASS } from "../../models/game.ts";
import type {
  Cargo,
  InterceptTransmissionMission,
  Mission,
  SurveyMission,
} from "../../models/missions.ts";
import {
  LOAD_CRATES,
  SELL_FUEL,
  SURVEY_RING,
  TANKER_FUEL,
  dataAboard,
} from "../../models/missions.ts";
import {
  BLACK_HOLE_ID,
  BLACK_HOLE_OUTER_RING,
  STATION_RING,
  laneDepartureArc,
} from "../../models/gravityWells.ts";
import { executeTurn } from "../../game/turns.ts";
import { ringVelocity } from "../../game/geometry.ts";
import { viewFor } from "../../game/view.ts";
import { getStationForPlanet, isMooredAt } from "../../game/stations.ts";
import { analyzeSituation, botDecideActions } from "../../ai/index.ts";
import { planetLane, predictedDeliveryPlanets } from "../../ai/behaviors/danger.ts";
import { orbitSectorAt } from "../../ai/movementPlanner/index.ts";
import { PATROL_GOAL_ID, REPAIR_GOAL_ID as REPAIR_GOAL } from "../../ai/behaviors/missions.ts";
import { DEFAULT_BOT_PARAMETERS } from "../../ai/types.ts";
import {
  ALPHA,
  BETA,
  BH,
  GAMMA,
  approachSector,
  dataCargo,
  deliverMission,
  destroyMission,
  escortMission,
  getPlayer,
  getShip,
  interceptMission,
  makeGameState,
  makePlayer,
  makeTwoPlayerGame,
  piracyMission,
  salvageMission,
  surveyMission,
  takenData,
  tankerMission,
  withMissions,
  withPlayer,
  withPower,
  withShip,
  withSub,
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
    const p1 = getPlayer(result.gameState, "p1");
    // The transmission is aboard as data, to be filed at the card's station.
    expect(dataAboard(p1, p1.missions[0] as InterceptTransmissionMission)).toBe(true);
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
    const p1 = getPlayer(result.gameState, "p1");
    expect(dataAboard(p1, p1.missions[0] as InterceptTransmissionMission)).toBe(true);
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
      dataAboard(getPlayer(s, "p1"), getPlayer(s, "p1").missions[0] as SurveyMission);
    const state = playUntil(start, "p1", acquired, 60);

    expect(acquired(state)).toBe(true);
  });

  it("at its pickup with a Tanker's fuel aboard, loads the crate and leaves the fuel", () => {
    // A visit does one thing, and the pickup is the Deliver's: the fuel waits
    // for another station.
    const deliver = deliverMission(ALPHA, BETA);
    const tanker = tankerMission();
    const start = withShip(
      withMissions(
        makeGameState([
          makePlayer("p1", {
            wellId: ALPHA,
            ring: STATION_RING,
            sector: approachSector(makeGameState([]), ALPHA),
          }),
          makePlayer("p2", { wellId: BETA, ring: 3, sector: 12 }),
        ]),
        "p1",
        [deliver, tanker]
      ),
      "p1",
      { reactionMass: MAX_REACTION_MASS }
    );
    expect(MAX_REACTION_MASS).toBeGreaterThanOrEqual(TANKER_FUEL);

    const actions = botDecideActions(viewFor(start, "p1")).actions;
    expect(actions.find((a) => a.type === "dock_sale")?.data).toEqual({ sale: LOAD_CRATES });
    const result = executeTurn(start, actions);
    expect(result.errors).toBeUndefined();
    const p1 = getPlayer(result.gameState, "p1");
    expect(p1.cargo.find((c) => c.missionId === deliver.id)?.isPickedUp).toBe(true);
    expect(p1.missions.find((m) => m.id === tanker.id)?.isCompleted).toBe(false);
    expect(p1.soldAt).toEqual([]);
  });

  it("docks at the pickup for a Deliver card, then turns for the delivery planet", () => {
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

    const docked = executeTurn(start, botDecideActions(viewFor(start, "p1")).actions);
    expect(docked.errors).toBeUndefined();
    const picked = docked.gameState;
    expect(getPlayer(picked, "p1").cargo[0].isPickedUp).toBe(true);

    // The goal is no longer the pickup station: the crate has to reach BETA.
    const goal = botDecideActions(viewFor(picked, "p1")).log.situation.currentGoal;
    expect(goal).toContain(BETA);
  });

  it("stops surveying once the data is aboard and files it at the station the circuit reaches first", () => {
    // Survey data is filed anywhere (the deck deals every survey card with
    // "any" for its station) so the bot takes the door it is
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

    const completed = (s: GameState) => getPlayer(s, "p1").points > 0;
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

  it("counts data as loot: a ship carrying only data is prey", () => {
    const card = piracyMission();
    const state = table([card]);
    const dataOnly = withPlayer(state, "p2", {
      cargo: getPlayer(state, "p2").cargo.map((c) => ({ ...c, kind: "data" as const })),
    });
    expect(goalFor(dataOnly, card.id)).toMatchObject({ type: "pirate", targetPlayerId: "p2" });
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

  // While the two-point card somebody else set the seat is still open the
  // Tanker makes no trip of its own: it is the fuel held back on the trips the
  // seat is already making, and a station in the well the ship is already in.
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

    // ALPHA ring 1 is a berth away from its station: the fastest route burns
    // the tank down to one and pumps nothing, and one turn longer arrives with
    // seven. A station buys one item, so the reserve rides only on a trip whose
    // visit may sell the fuel: a repair stop or a pickup, where loading is no
    // sale.
    const berth = (missions: Mission[], broken: boolean): GameState => {
      const start = makeGameState([
        makePlayer("p1", { wellId: ALPHA, ring: 1, sector: 0 }),
        makePlayer("p2", { wellId: BH, ring: 3, sector: 12 }),
      ]);
      const state = withShip(withMissions(start, "p1", missions), "p1", {
        reactionMass: MAX_REACTION_MASS,
      });
      return broken ? withSub(state, "p1", "side-0", { isBroken: true }) : state;
    };
    const fetch = deliverMission(ALPHA, BETA, "fetch-p1");

    it("pumps in the well it is in, with the primary open, and repairs on the same visit", () => {
      const hunt = destroyMission("p2");
      const card = tankerMission();
      const tanking = currentGoal(berth([hunt, card], true));
      const plain = currentGoal(berth([hunt], true));
      expect(tanking).toMatchObject({ missionId: card.id, dockSale: SELL_FUEL, repairs: true });
      expect(plain?.missionId).toBe(REPAIR_GOAL);
      // The fuel still aboard when it makes port, which is what pumps.
      expect(MAX_REACTION_MASS - tanking!.plan!.totalMassCost).toBeGreaterThanOrEqual(TANKER_FUEL);
      expect(MAX_REACTION_MASS - plain!.plan!.totalMassCost).toBeLessThan(TANKER_FUEL);
      expect(tanking!.plan!.totalTurns).toBeGreaterThan(plain!.plan!.totalTurns);
    });

    it("repairs on the pickup trip when the pickup's station is the nearest", () => {
      expect(currentGoal(berth([fetch], true))).toMatchObject({ missionId: fetch.id, repairs: true });
    });

    it("takes the fast route to a pickup, whose visit loads and pumps nothing", () => {
      const tanking = currentGoal(berth([fetch, tankerMission()], false));
      const plain = currentGoal(berth([fetch], false));
      expect(tanking).toMatchObject({ missionId: fetch.id, dockSale: LOAD_CRATES });
      expect(tanking!.plan!.totalTurns).toBe(plain!.plan!.totalTurns);
      expect(tanking!.plan!.totalMassCost).toBe(plain!.plan!.totalMassCost);
    });

    it("takes the fast route to deliver, whose visit sells the crate", () => {
      const inHand = (missions: Mission[]) => {
        const state = berth(missions, false);
        return withPlayer(state, "p1", {
          cargo: getPlayer(state, "p1").cargo.map((c) => ({ ...c, isPickedUp: true })),
        });
      };
      const bound = deliverMission(BETA, ALPHA, "bound-p1");
      const tanking = currentGoal(inHand([bound, tankerMission()]));
      const plain = currentGoal(inHand([bound]));
      expect(tanking).toMatchObject({ missionId: bound.id, dockSale: bound.cargoId });
      expect(tanking!.plan!.totalTurns).toBe(plain!.plan!.totalTurns);
      expect(tanking!.plan!.totalMassCost).toBe(plain!.plan!.totalMassCost);
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

describe("bot goals: salvage and escort", () => {
  const goalFor = (state: GameState, missionId: string) =>
    analyzeSituation(viewFor(state, "p1"), DEFAULT_BOT_PARAMETERS).goals.find(
      (g) => g.missionId === missionId
    );
  const currentGoal = (state: GameState) =>
    analyzeSituation(viewFor(state, "p1"), DEFAULT_BOT_PARAMETERS).currentGoal;

  const PRIMARY = deliverMission(GAMMA, BETA, "primary-p1");
  const PRIMARY_DONE: Mission = { ...PRIMARY, isCompleted: true };

  /** A ring out and six sectors ahead of p1: a few turns off. */
  const NEAR_WRECK: Wreck = { id: "wreck-1", wellId: BH, ring: 4, sector: 6 };
  /** Across the hole on the fastest ring: more than a turn off, and it drifts eight a round. */
  const FAST_WRECK: Wreck = { id: "wreck-fast", wellId: BH, ring: 1, sector: 12 };

  const salvageTable = (missions: Mission[], wrecks: Wreck[] = [NEAR_WRECK]): GameState => {
    const state = makeGameState(
      [
        makePlayer("p1", { wellId: BH, ring: 3, sector: 0 }),
        makePlayer("p2", { wellId: ALPHA, ring: 3, sector: 12 }),
      ],
      { wrecks }
    );
    return withMissions(state, "p1", missions);
  };

  const crateAboard = (id: string, missionId: string): Cargo => ({
    id,
    missionId,
    kind: "crate",
    deliveryPlanetId: "any",
    isPickedUp: true,
  });
  const blackBoxAboard = (id: string, missionId: string): Cargo => ({
    ...crateAboard(id, missionId),
    kind: "data",
  });

  describe("salvage", () => {
    it("plans for where the wreck will have drifted to, not where it lies", () => {
      const card = salvageMission();
      const goal = currentGoal(salvageTable([card, PRIMARY_DONE], [FAST_WRECK]));
      expect(goal).toMatchObject({ type: "salvage", missionId: card.id, wreckId: FAST_WRECK.id });
      const plan = goal!.plan!;
      // One turn would not tell a moving target from a still one.
      expect(plan.totalTurns).toBeGreaterThanOrEqual(2);
      expect(plan.destination).toMatchObject({
        wellId: FAST_WRECK.wellId,
        ring: FAST_WRECK.ring,
        sector: orbitSectorAt(
          FAST_WRECK,
          ringVelocity(FAST_WRECK.wellId, FAST_WRECK.ring),
          plan.totalTurns
        ),
      });
      expect(plan.destination.sector).not.toBe(FAST_WRECK.sector);
    });

    it("takes the wreck's black box aboard and files it at a station", () => {
      const card = salvageMission();
      const start = withShip(salvageTable([card, PRIMARY_DONE]), "p1", {
        reactionMass: MAX_REACTION_MASS,
      });
      const salvaged = playUntil(start, "p1", (s) =>
        getPlayer(s, "p1").cargo.some((c) => c.id === card.cargoId && c.isPickedUp)
      );
      expect(salvaged.wrecks).toEqual([]);
      expect(getPlayer(salvaged, "p1").cargo.find((c) => c.id === card.cargoId)?.kind).toBe("data");
      const sold = playUntil(salvaged, "p1", (s) =>
        getPlayer(s, "p1").missions.some((m) => m.id === card.id && m.isCompleted)
      );
      expect(getPlayer(sold, "p1").missions.find((m) => m.id === card.id)?.isCompleted).toBe(true);
    });

    it("turns for a station once the black box is aboard", () => {
      const card = salvageMission();
      const state = withPlayer(salvageTable([card, PRIMARY]), "p1", {
        cargo: [blackBoxAboard(card.cargoId, card.id)],
      });
      expect(goalFor(state, card.id)).toMatchObject({ type: "dock" });
    });

    it("files a black box taken at a berth at another station: docking is arrival only", () => {
      const card = salvageMission();
      const base = salvageTable([card, PRIMARY], []);
      const station = getStationForPlanet(base.stations, ALPHA)!;
      const state = withPlayer(
        withShip(base, "p1", { wellId: ALPHA, ring: station.ring, sector: station.sector }),
        "p1",
        { cargo: [blackBoxAboard(card.cargoId, card.id)] }
      );
      const goal = goalFor(state, card.id);
      expect(goal).toMatchObject({ type: "dock" });
      expect(goal?.planetId).not.toBe(ALPHA);
    });

    it.each([
      ["a delivery crate", crateAboard("deliver-crate", "deliver-x")],
      ["another Salvage card's black box", blackBoxAboard("salvage-other", "salvage-other")],
    ])("goes for a wreck while the hold carries %s: the box rides free", (_label, cargo) => {
      const card = salvageMission();
      const state = withPlayer(salvageTable([card, PRIMARY_DONE]), "p1", { cargo: [cargo] });
      expect(goalFor(state, card.id)).toMatchObject({ type: "salvage", wreckId: NEAR_WRECK.id });
    });

    // Before the primary is in, a wreck is worth the pirate's half a well and
    // no more; after it, anywhere on the board.
    it.each([
      { where: "near", wreck: NEAR_WRECK, primary: PRIMARY, goal: true },
      {
        where: "in another well",
        wreck: { id: "wreck-far", wellId: ALPHA, ring: 3, sector: 12 },
        primary: PRIMARY,
        goal: false,
      },
      {
        where: "in another well",
        wreck: { id: "wreck-far", wellId: ALPHA, ring: 3, sector: 12 },
        primary: PRIMARY_DONE,
        goal: true,
      },
    ])(
      "a wreck $where with the primary done: $primary.isCompleted, goal: $goal",
      ({ wreck, primary, goal }) => {
        const card = salvageMission();
        const found = goalFor(salvageTable([card, primary], [wreck]), card.id);
        if (goal) expect(found).toMatchObject({ type: "salvage", wreckId: wreck.id });
        else expect(found).toBeUndefined();
      }
    );

    it("goes for a wreck under a station: a moored ship salvages", () => {
      const card = salvageMission();
      const base = salvageTable([card, PRIMARY_DONE], []);
      const station = getStationForPlanet(base.stations, ALPHA)!;
      const state = {
        ...base,
        wrecks: [{ id: "wreck-berth", wellId: ALPHA, ring: station.ring, sector: station.sector }],
      };
      expect(goalFor(state, card.id)).toMatchObject({ type: "salvage", wreckId: "wreck-berth" });
    });

    it("is no pirate's prey: a wreck is not a carrier", () => {
      const card = piracyMission();
      expect(goalFor(salvageTable([card, PRIMARY_DONE]), card.id)).toBeUndefined();
    });
  });

  describe("escort", () => {
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
      const card = escortMission();
      expect(goalFor(table([card]), card.id)).toMatchObject({
        type: "escort",
        targetPlayerId: "p2",
      });
    });

    it.each([
      { where: "two turns off", carrier: { wellId: BH, ring: 3, sector: 6 }, urgency: 2 },
      { where: "six turns off", carrier: { wellId: BH, ring: 1, sector: 12 }, urgency: 0 },
    ])(
      "chases a carrier $where at urgency $urgency, as the pirate does",
      ({ carrier, urgency }) => {
        const escort = escortMission();
        const pirate = piracyMission();
        const escortGoal = goalFor(table([escort, PRIMARY], carrier as Position), escort.id);
        const pirateGoal = goalFor(table([pirate, PRIMARY], carrier as Position), pirate.id);
        expect(escortGoal).toMatchObject({ type: "escort", targetPlayerId: "p2", urgency });
        expect(escortGoal?.estimatedTurns).toBe(pirateGoal?.estimatedTurns);
      }
    );

    it.each([
      ["its marker is already out", [escortMission("escort-1", "p3")], "escort-1"],
      [
        "its other Escort already marks the only carrier",
        [escortMission("escort-1", "p2"), escortMission("escort-2")],
        "escort-2",
      ],
      [
        "the only carrier is its Destroy target",
        [escortMission(), destroyMission("p2")],
        "escort-1",
      ],
    ])("has nobody to escort when %s", (_label, missions, missionId) => {
      expect(goalFor(table(missions), missionId)).toBeUndefined();
    });

    it("waits where a carrier in another well must arrive, once the primary is in", () => {
      const card = escortMission();
      const carrier: Position = { wellId: ALPHA, ring: 3, sector: 0 };
      const predicted = predictedDeliveryPlanets(carrier, 1, 0, makeGameState([]).stations)[0];
      expect(goalFor(table([card, PRIMARY], carrier), card.id)).toBeUndefined();
      const goal = goalFor(table([card, PRIMARY_DONE], carrier), card.id);
      expect(goal).toMatchObject({ type: "escort", planetId: predicted });
      expect(goal?.targetPlayerId).toBeUndefined();
    });

    it("puts its marker on a carrier drifting in the same well", () => {
      const card = escortMission();
      const start = withShip(table([card]), "p1", { reactionMass: MAX_REACTION_MASS });
      const markedBy = (state: GameState) =>
        viewFor(state, "p3").players.find((p) => p.id === "p2")?.escortedBy ?? [];
      const marked = playUntil(start, "p1", (state) => markedBy(state).length > 0, 30);
      expect(markedBy(marked)).toEqual(["p1"]);
    });

    /**
     * p1 can only coast (engines broken): BH ring 3 drifts it from S0 to S4,
     * where every ship in `carriers` sits with a crate aboard.
     */
    const besideCarriers = (missions: Mission[], carriers: string[]): GameState => {
      let state = makeGameState([
        makePlayer("p1", { wellId: BH, ring: 3, sector: 0 }),
        makePlayer("p2", { wellId: BH, ring: 3, sector: 4 }),
        makePlayer("p3", { wellId: BH, ring: 3, sector: 4 }),
      ]);
      state = withMissions(state, "p1", missions);
      state = withSub(state, "p1", "engines", { isBroken: true });
      for (const id of carriers) {
        state = withMissions(state, id, [deliverMission(ALPHA, BETA, `deliver-${id}`)]);
        state = withPlayer(state, id, {
          cargo: getPlayer(state, id).cargo.map((c) => ({ ...c, isPickedUp: true })),
        });
      }
      return state;
    };

    it.each<[string, Mission[], string[], string[]]>([
      ["a carrier it ends its turn beside", [escortMission()], ["p2"], ["p2"]],
      [
        "nobody when that carrier is its Destroy target",
        [escortMission(), destroyMission("p2")],
        ["p2"],
        [],
      ],
      [
        "the other carrier beside its Destroy target",
        [escortMission(), destroyMission("p2")],
        ["p2", "p3"],
        ["p3"],
      ],
      [
        "one carrier per marker in hand",
        [escortMission("escort-a"), escortMission("escort-b")],
        ["p2", "p3"],
        ["p2", "p3"],
      ],
      ["nobody with its marker already out", [escortMission("escort-1", "p3")], ["p2"], []],
    ])("declares an Escort marker for %s", (_label, missions, carriers, marked) => {
      const state = besideCarriers(missions, carriers);
      const actions = botDecideActions(viewFor(state, "p1")).actions;
      expect(actions.flatMap((a) => (a.type === "escort_mark" ? [a.data.carrierId] : []))).toEqual(
        marked
      );
      const result = executeTurn(state, actions);
      expect(result.errors).toBeUndefined();
    });
  });
});

describe("goal order: the primary before the secondary", () => {
  /**
   * Three points win and the hand is one two-point primary plus two one-point
   * secondaries, so the primary is the only card the bot cannot do without.
   * Its first step (the Intercept's scan, the Deliver's pickup) is what used
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

  it("returns no actions while destroyed, which the engine takes as the respawn", () => {
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
    expect(decision.log.candidates).toEqual([]);

    expect(executeTurn(state, decision.actions).errors).toBeUndefined();
  });
});

describe("bot goals: patrol", () => {
  const situation = (state: GameState) =>
    analyzeSituation(viewFor(state, "p1"), DEFAULT_BOT_PARAMETERS);
  const DONE: Mission = { ...deliverMission(GAMMA, BETA, "primary-p1"), isCompleted: true };

  /** p1 at `from` with nothing to do; the rivals at `rivals`, holds empty. */
  const idle = (from: Position, rivals: Position[]): GameState =>
    makeGameState([
      makePlayer("p1", from),
      ...rivals.map((pos, i) => makePlayer(`p${i + 2}`, pos)),
    ]);
  const bh = (ring: number, sector: number): Position => ({ wellId: BH, ring, sector });

  /** Play `turns` turns: p1 decides, everyone else coasts; `check` runs after each. */
  const play = (
    start: GameState,
    turns: number,
    check: (state: GameState, turn: number) => void,
    before: (state: GameState, actions: PlayerAction[]) => void = () => {}
  ): GameState => {
    let state = start;
    for (let i = 0; i < turns && state.phase === "active"; i++) {
      const active = state.players[state.activePlayerIndex];
      const mine = active.id === "p1";
      const actions = mine ? botDecideActions(viewFor(state, "p1")).actions : coastAs(active.id);
      if (mine) before(state, actions);
      const result = executeTurn(state, actions);
      expect(result.errors, `turn ${i} by ${active.id}`).toBeUndefined();
      state = result.gameState;
      check(state, i);
    }
    return state;
  };

  it.each([
    { label: "two on ring 3, one on 4", rivals: [bh(3, 8), bh(3, 10), bh(4, 16)], ring: 3 },
    { label: "two on ring 4, one on 3", rivals: [bh(4, 8), bh(4, 10), bh(3, 16)], ring: 4 },
    { label: "one on ring 3, one on 4", rivals: [bh(3, 8), bh(4, 16)], ring: 3 },
    { label: "one on ring 2, one on 4", rivals: [bh(2, 8), bh(4, 16)], ring: 2 },
  ])("heads for the ring the rivals are on: $label", ({ rivals, ring }) => {
    const { currentGoal } = situation(idle(bh(5, 0), rivals));
    expect(currentGoal).toMatchObject({ type: "patrol", missionId: PATROL_GOAL_ID });
    expect(currentGoal?.plan?.destination).toMatchObject({ wellId: BH, ring });
  });

  it("heads for black hole ring 3 from a planet well and never docks on the way", () => {
    const end = play(
      idle({ wellId: ALPHA, ring: 3, sector: 0 }, [bh(3, 8), bh(3, 16)]),
      45,
      (s, i) => expect(isMooredAt(s.stations, getShip(s, "p1")), `turn ${i}`).toBe(false)
    );
    expect(getShip(end, "p1")).toMatchObject({ wellId: BH, ring: 3 });
  });

  it.each([9, 12, 18])(
    "coasts on the patrol ring with the rivals %i sectors off, turn after turn",
    (sector) => {
      play(
        idle(bh(3, 0), [bh(3, sector), bh(3, sector + 1)]),
        9,
        (s) => expect(getShip(s, "p1")).toMatchObject({ wellId: BH, ring: 3 }),
        (s, actions) => {
          expect(situation(s).currentGoal?.missionId).toBe(PATROL_GOAL_ID);
          expect(actions.some((a) => a.type === "burn" || a.type === "well_transfer")).toBe(false);
        }
      );
    }
  );

  it.each([
    { label: "from ring 5 with every rival at a planet", from: bh(5, 0), destroyed: false },
    {
      label: "from a planet well with every rival at a planet",
      from: { wellId: BETA, ring: 3, sector: 0 },
      destroyed: false,
    },
    { label: "from ring 5 with every rival destroyed", from: bh(5, 0), destroyed: true },
  ])("heads into the black hole $label", ({ from, destroyed }) => {
    let state = idle(from, [
      { wellId: ALPHA, ring: 3, sector: 0 },
      { wellId: GAMMA, ring: 4, sector: 6 },
    ]);
    if (destroyed) {
      state = withShip(withShip(state, "p2", { hitPoints: 0 }), "p3", { hitPoints: 0 });
    }
    const { currentGoal } = situation(state);
    expect(currentGoal).toMatchObject({ type: "patrol", missionId: PATROL_GOAL_ID });
    expect(currentGoal?.plan?.destination).toMatchObject({ wellId: BH, ring: 3 });
  });

  it.each([
    {
      label: "a broken subsystem",
      broken: (s: GameState) => withSub(s, "p1", "side-0", { isBroken: true }),
    },
    {
      label: "a hull at the repair threshold",
      broken: (s: GameState) =>
        withShip(s, "p1", { hitPoints: DEFAULT_BOT_PARAMETERS.repairHullThreshold }),
    },
  ])("repairs rather than patrol with $label", ({ broken }) => {
    const { currentGoal, goals } = situation(broken(idle(bh(3, 0), [bh(3, 8), bh(3, 16)])));
    expect(currentGoal?.missionId).toBe(REPAIR_GOAL);
    expect(goals.some((g) => g.missionId === PATROL_GOAL_ID)).toBe(false);
  });

  // The primary is in and a secondary chases carriers: a carrier in another
  // well is waited for where it must arrive, and only an empty table leaves
  // the bot nothing to do but patrol.
  it.each([
    { card: piracyMission(), type: "pirate" },
    { card: escortMission(), type: "escort" },
  ])("patrols with a $type card only while nobody carries", ({ card, type }) => {
    const table = (carrying: boolean): GameState => {
      const state = withMissions(idle(bh(3, 0), [{ wellId: ALPHA, ring: 3, sector: 0 }]), "p1", [
        card,
        DONE,
      ]);
      return carrying
        ? withPlayer(state, "p2", { cargo: [dataCargo("data-p2", "survey-p2")] })
        : state;
    };
    expect(situation(table(true)).currentGoal).toMatchObject({ type, missionId: card.id });
    expect(situation(table(false)).currentGoal).toMatchObject({
      type: "patrol",
      missionId: PATROL_GOAL_ID,
    });
  });
});

// With a primary's item aboard a side goal is taken only when it delays the
// delivery by a turn at most: on the way is fine, across the well is not.
describe("bot goals: a primary's item aboard", () => {
  const FILE = interceptMission("p3", "intercept-p1", ALPHA);
  const ESCORT = escortMission();
  // Four turns of drift short of Alpha's door on black hole ring 5.
  const lane = laneDepartureArc(planetLane(ALPHA, "outbound")!);
  const sector = (lane.startSector + 24 - 12) % 24;

  const table = (carrier: Position): GameState => {
    let state = makeGameState([
      makePlayer("p1", { wellId: BH, ring: BLACK_HOLE_OUTER_RING, sector }),
      makePlayer("p2", carrier),
      makePlayer("p3", { wellId: GAMMA, ring: 3, sector: 0 }),
    ]);
    state = withMissions(state, "p1", [FILE, ESCORT]);
    state = withPlayer(state, "p1", { cargo: [takenData(FILE)] });
    state = withMissions(state, "p2", [deliverMission(ALPHA, BETA)]);
    return withPlayer(state, "p2", {
      cargo: getPlayer(state, "p2").cargo.map((c) => ({ ...c, isPickedUp: true })),
    });
  };
  const currentGoal = (state: GameState) =>
    analyzeSituation(viewFor(state, "p1"), DEFAULT_BOT_PARAMETERS).currentGoal;

  it.each([
    ["files first past a carrier across the well", { wellId: BH, ring: 1, sector }, FILE.id],
    ["marks a carrier in its own sector on the way", { wellId: BH, ring: 5, sector }, ESCORT.id],
  ])("%s", (_label, carrier, missionId) => {
    expect(currentGoal(table(carrier as Position))?.missionId).toBe(missionId);
  });
});
