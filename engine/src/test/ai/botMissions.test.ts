/**
 * The bot plays all four mission types. Each test puts a bot in front of one
 * mission's next step and checks it takes it — and that the engine accepts
 * the turn.
 */
import { describe, it, expect } from "vitest";
import type { GameState, PlayerAction, Position, ShipLoadout } from "../../models/game.ts";
import { STARTING_HIT_POINTS } from "../../models/game.ts";
import type { SecondaryMission } from "../../models/missions.ts";
import { SURVEY_RING } from "../../models/missions.ts";
import { BLACK_HOLE_ID, STATION_RING } from "../../models/gravityWells.ts";
import { executeTurn } from "../../game/turns.ts";
import { viewFor } from "../../game/view.ts";
import { getStationForPlanet } from "../../game/stations.ts";
import { analyzeSituation, botDecideActions } from "../../ai/index.ts";
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
  surveyMission,
  withMissions,
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
    // A survey chit is filed anywhere — the deck deals every survey and board
    // card with "any" for its station — so the bot takes the door it is
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
