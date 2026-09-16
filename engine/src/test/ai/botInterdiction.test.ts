/**
 * Denial: reading who is about to win, and doing something about it.
 *
 * A race for three secret cards has a second source of value besides your
 * own progress. What a rival carries is public (crates and data chits sit on
 * the ship), their score is public (completed cards are face-up), stations
 * are the only place cargo can be handed over and the lanes are the only way
 * between wells — so the whole table can tell who is one dock from winning
 * and roughly where they have to go. These tests pin down that deduction and
 * the behaviour it drives, all from `viewFor` fixtures: the bot never sees
 * anything a player in its seat would not.
 */
import { describe, it, expect } from "vitest";
import type { Cargo } from "../../models/missions.ts";
import type { GameState, ShipLoadout } from "../../models/game.ts";
import { STATION_RING } from "../../models/gravityWells.ts";
import { viewFor } from "../../game/view.ts";
import { executeTurn } from "../../game/turns.ts";
import { getStationForPlanet } from "../../game/stations.ts";
import { analyzeSituation, botDecideActions } from "../../ai/index.ts";
import { DEFAULT_BOT_PARAMETERS, INTERDICT_DANGER } from "../../ai/types.ts";
import type { Opponent } from "../../ai/types.ts";
import { assessDanger, predictedDeliveryPlanets } from "../../ai/behaviors/danger.ts";
import { generateCandidates } from "../../ai/planner.ts";
import {
  ALPHA,
  BETA,
  BH,
  GAMMA,
  approachSector,
  deliverMission,
  getShip,
  makeGameState,
  makePlayer,
  makeTwoPlayerGame,
  withMissions,
  withPlayer,
  withPower,
  withShip,
  withSub,
} from "../testUtils.ts";

/** Railgun plus a turret that bears on the railgun's own ring: 6 damage a turn. */
const RAIDER: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["missiles", "radiator", "shields", "shields"],
};
/** No gun worth the name: one broadside, 2 damage. */
const TRADER: ShipLoadout = {
  forwardSlots: ["sensor_array"],
  sideSlots: ["shields", "radiator", "radiator", "laser"],
};
/** The trader with a rack instead of the laser: shields can stop this one. */
const PLINKER: ShipLoadout = {
  forwardSlots: ["sensor_array"],
  sideSlots: ["shields", "radiator", "radiator", "ballistic_rack"],
};

function crate(pickupPlanetId: string, deliveryPlanetId: string): Cargo {
  return {
    id: `crate-${pickupPlanetId}-${deliveryPlanetId}`,
    kind: "crate",
    missionId: `deliver-${pickupPlanetId}-${deliveryPlanetId}`,
    pickupPlanetId,
    deliveryPlanetId,
    isPickedUp: true,
  };
}

function dataChit(): Cargo {
  return {
    id: "data-1",
    kind: "data",
    missionId: "survey-1",
    deliveryPlanetId: "any",
    isPickedUp: true,
  };
}

/** Two cards face-up and a crate in the hold: one dock from the win. */
function aboutToWin(state: GameState, playerId: string, cargo: Cargo[] = [crate(ALPHA, BETA)]) {
  return withPlayer(state, playerId, { completedMissionCount: 2, cargo });
}

function situationOf(state: GameState, viewerId: string) {
  return analyzeSituation(viewFor(state, viewerId), DEFAULT_BOT_PARAMETERS);
}

function opponent(state: GameState, viewerId: string, id: string): Opponent {
  const found = situationOf(state, viewerId).opponents.find((o) => o.player.id === id);
  if (!found) throw new Error(`no opponent ${id}`);
  return found;
}

describe("danger: reading the scoreboard and the hold", () => {
  it("scores a player two cards down with a crate aboard as the one to stop", () => {
    const state = aboutToWin(
      makeTwoPlayerGame({ loadout: RAIDER }, { wellId: ALPHA, ring: STATION_RING, sector: 4 }),
      "p2"
    );
    const danger = opponent(state, "p1", "p2").danger;

    expect(danger.completedMissions).toBe(2);
    expect(danger.crates).toBe(1);
    expect(danger.oneDeliveryFromWinning).toBe(true);
    expect(danger.score).toBeGreaterThanOrEqual(INTERDICT_DANGER);
  });

  it("scores an empty-handed player with nothing on the board as no danger at all", () => {
    const state = makeTwoPlayerGame({ loadout: RAIDER }, { wellId: BH, ring: 3, sector: 12 });
    const danger = opponent(state, "p1", "p2").danger;

    expect(danger.completedMissions).toBe(0);
    expect(danger.oneDeliveryFromWinning).toBe(false);
    expect(danger.score).toBeLessThan(0.2);
  });

  it("takes a crate seriously only in proportion to the score behind it", () => {
    // The same crate, the same sector, two very different players.
    const base = makeTwoPlayerGame({ loadout: RAIDER }, { wellId: ALPHA, ring: 2, sector: 4 });
    const leader = aboutToWin(base, "p2");
    const nobody = withPlayer(base, "p2", {
      completedMissionCount: 0,
      cargo: [crate(ALPHA, BETA)],
    });

    expect(opponent(leader, "p1", "p2").danger.score).toBeGreaterThan(
      opponent(nobody, "p1", "p2").danger.score
    );
  });

  it("excludes the planet a crate was loaded at from where it can be delivered", () => {
    // A Deliver route runs between two different planets, so the crate on a
    // ship orbiting Alpha is going to Beta or Gamma — never back to Alpha.
    const stations = makeGameState([]).stations;
    const planets = predictedDeliveryPlanets(
      { wellId: ALPHA, ring: STATION_RING, sector: 4 },
      1,
      0,
      stations
    );

    expect(planets).not.toContain(ALPHA);
    expect(planets.sort()).toEqual([BETA, GAMMA].sort());
  });

  it("keeps every station on the list for a data chit, including the one overhead", () => {
    // Scan and survey data is handed over at any station at all.
    const stations = makeGameState([]).stations;
    const planets = predictedDeliveryPlanets(
      { wellId: ALPHA, ring: STATION_RING, sector: 4 },
      0,
      1,
      stations
    );

    expect(planets).toContain(ALPHA);
    expect(planets).toHaveLength(3);
  });

  it("names a station for a carrier and nothing at all for an empty hold", () => {
    const stations = makeGameState([]).stations;
    const carrying = assessDanger(
      { cargoAboard: { crates: 1, data: 0 }, completedMissionCount: 2 },
      { wellId: ALPHA, ring: STATION_RING, sector: 4 },
      stations
    );
    const empty = assessDanger(
      { cargoAboard: { crates: 0, data: 0 }, completedMissionCount: 2 },
      { wellId: ALPHA, ring: STATION_RING, sector: 4 },
      stations
    );

    expect(carrying.deliveryPosition?.wellId).toBe(carrying.predictedPlanets[0]);
    expect(carrying.deliveryPosition?.ring).toBe(STATION_RING);
    expect(carrying.turnsToDelivery).toBeLessThan(Infinity);
    expect(empty.deliveryPosition).toBeNull();
    expect(empty.predictedPlanets).toEqual([]);
  });
});

describe("interdiction goals", () => {
  /** Bot on Alpha ring 1 with a gun; two rivals, one of them about to win. */
  function threeWay(): GameState {
    const station = getStationForPlanet(makeGameState([]).stations, ALPHA)!;
    return makeGameState([
      makePlayer("p1", { wellId: ALPHA, ring: STATION_RING, sector: station.sector + 6 }, RAIDER),
      makePlayer("p2", { wellId: ALPHA, ring: STATION_RING, sector: station.sector + 2 }),
      makePlayer("p3", { wellId: GAMMA, ring: 3, sector: 12 }),
    ]);
  }

  it("diverts to the player about to win even with no Destroy card in hand", () => {
    const state = aboutToWin(threeWay(), "p2", [crate(BETA, ALPHA)]);
    const situation = situationOf(state, "p1");

    expect(situation.me.missions).toHaveLength(0);
    expect(situation.currentGoal?.type).toBe("interdict");
    expect(situation.currentGoal?.targetPlayerId).toBe("p2");
    expect(situation.currentGoal?.plan).toBeDefined();
  });

  it("picks the more dangerous of two rivals", () => {
    let state = threeWay();
    // p3 is moved next door so distance cannot be what decides it.
    state = withShip(state, "p3", {
      wellId: ALPHA,
      ring: STATION_RING,
      sector: getShip(state, "p1").sector + 1,
    });
    state = withPlayer(state, "p3", { completedMissionCount: 1, cargo: [dataChit()] });
    state = aboutToWin(state, "p2", [crate(BETA, ALPHA)]);
    const situation = situationOf(state, "p1");

    expect(opponent(state, "p1", "p2").danger.score).toBeGreaterThan(
      opponent(state, "p1", "p3").danger.score
    );
    expect(situation.currentGoal?.type).toBe("interdict");
    expect(situation.currentGoal?.targetPlayerId).toBe("p2");
  });

  it("keeps racing when it is closer to its own third card than they are to theirs", () => {
    // Both are one dock from the win; the bot is nearer the station. Turning
    // to fight would hand the game to the third player.
    let state = aboutToWin(threeWay(), "p2", [crate(BETA, ALPHA)]);
    state = withPlayer(state, "p1", {
      completedMissionCount: 2,
      cargo: [crate(BETA, ALPHA)],
      missions: [deliverMission(BETA, ALPHA)],
    });
    state = withShip(state, "p1", {
      sector: approachSector(state, ALPHA),
    });
    const situation = situationOf(state, "p1");

    expect(situation.myDanger.turnsToWin).toBeLessThanOrEqual(
      opponent(state, "p1", "p2").danger.turnsToWin
    );
    expect(situation.currentGoal?.type).not.toBe("interdict");
  });

  it("does not divert when its guns cannot beat the shield cubes on the target", () => {
    // A shield tile absorbs damage up to its cubes and is refilled for free
    // next turn, so a lone one-damage rack can never reach that hull. A laser
    // skips the shields, so the same trader with a laser does divert.
    // Same board, same rival, same score: only the bot's hull differs.
    const board = (loadout: ShipLoadout) => {
      let state = aboutToWin(
        makeGameState([
          makePlayer("p1", { wellId: ALPHA, ring: STATION_RING, sector: 6 }, loadout),
          makePlayer("p2", { wellId: ALPHA, ring: STATION_RING, sector: 8 }),
        ]),
        "p2",
        [crate(BETA, ALPHA)]
      );
      state = withSub(state, "p2", "side-2", { isRevealed: true });
      return withPower(state, "p2", "side-2", 2);
    };

    const disarmed = board(PLINKER);
    expect(opponent(disarmed, "p1", "p2").danger.score).toBeGreaterThanOrEqual(INTERDICT_DANGER);
    expect(opponent(disarmed, "p1", "p2").shieldAbsorption).toBe(2);
    expect(situationOf(disarmed, "p1").currentGoal?.type).not.toBe("interdict");

    expect(situationOf(board(RAIDER), "p1").currentGoal?.type).toBe("interdict");
    expect(situationOf(board(TRADER), "p1").currentGoal?.type).toBe("interdict");
  });

  it("aims the interception at where the cargo has to go, not at the pickup", () => {
    // The crate on p2 was loaded at Alpha, so Alpha is the one station it
    // cannot be delivered at; the ambush is set at one of the other two.
    const state = aboutToWin(threeWay(), "p2", [crate(ALPHA, BETA)]);
    const danger = opponent(state, "p1", "p2").danger;

    expect(danger.predictedPlanets).not.toContain(ALPHA);
    expect(danger.deliveryPosition?.wellId).not.toBe(ALPHA);
    expect(situationOf(state, "p1").currentGoal?.type).toBe("interdict");
  });
});

describe("opportunistic fire", () => {
  it("shoots the player about to win while still flying a cargo run", () => {
    // The bot's own goal is a dock at Alpha: it takes the shot on the way
    // past, because the turn is spent either way.
    const station = getStationForPlanet(makeGameState([]).stations, ALPHA)!;
    let state = withMissions(
      makeGameState([
        makePlayer(
          "p1",
          { wellId: ALPHA, ring: STATION_RING, sector: approachSector(makeGameState([]), ALPHA) },
          RAIDER
        ),
        makePlayer("p2", { wellId: ALPHA, ring: STATION_RING, sector: station.sector + 2 }),
      ]),
      "p1",
      [deliverMission(ALPHA, BETA)]
    );
    state = aboutToWin(state, "p2", [crate(BETA, GAMMA)]);

    const decision = botDecideActions(viewFor(state, "p1"));
    const goal = decision.log.situation.currentGoal ?? "";
    const shots = decision.actions.filter((a) => a.type === "fire_weapon");

    expect(goal).toContain(ALPHA);
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) expect(shot.data.targetPlayerId).toBe("p2");
    expect(executeTurn(state, decision.actions).errors).toBeUndefined();
  });

  it("prefers the leader to a closer bystander when both are in the arc", () => {
    let state = makeGameState([
      makePlayer("p1", { wellId: BH, ring: 3, sector: 0 }, RAIDER),
      makePlayer("p2", { wellId: BH, ring: 3, sector: 3 }),
      makePlayer("p3", { wellId: BH, ring: 3, sector: 2 }),
    ]);
    state = withSub(state, "p1", "engines", { isBroken: true });
    state = aboutToWin(state, "p2", [crate(BETA, GAMMA)]);

    const shots = botDecideActions(viewFor(state, "p1")).actions.filter(
      (a) => a.type === "fire_weapon"
    );
    expect(shots.length).toBeGreaterThan(0);
    expect(shots[0].data.targetPlayerId).toBe("p2");
  });
});

describe("denial valuation", () => {
  /** The bot's own plan against `targetId`, as its planner builds it. */
  function planAgainst(state: GameState, targetId: string) {
    const situation = situationOf(state, "p1");
    const plan = generateCandidates(situation, DEFAULT_BOT_PARAMETERS).find(
      (c) => c.targetId === targetId
    );
    if (!plan) throw new Error(`no candidate shooting at ${targetId}`);
    return plan;
  }

  function duel(): GameState {
    const state = makeGameState([
      makePlayer("p1", { wellId: BH, ring: 3, sector: 0 }, RAIDER),
      makePlayer("p2", { wellId: BH, ring: 3, sector: 3 }),
    ]);
    return withSub(state, "p1", "engines", { isBroken: true });
  }

  it("prices the same volley higher against the player about to win", () => {
    const bystander = planAgainst(duel(), "p2");
    const leader = planAgainst(aboutToWin(duel(), "p2", [crate(BETA, GAMMA)]), "p2");

    expect(bystander.expectedHullDamage).toBe(leader.expectedHullDamage);
    expect(bystander.denialValue).toBeLessThan(leader.denialValue);
  });

  it("prices a kill on a loaded leader above a kill on an empty one", () => {
    // A destroyed ship drops everything it carries and loses its next turn.
    const loaded = aboutToWin(withShip(duel(), "p2", { hitPoints: 2 }), "p2", [
      crate(BETA, GAMMA),
      dataChit(),
    ]);
    const empty = withPlayer(withShip(duel(), "p2", { hitPoints: 2 }), "p2", {
      completedMissionCount: 2,
      cargo: [],
    });

    const withCargo = planAgainst(loaded, "p2");
    const without = planAgainst(empty, "p2");

    expect(withCargo.killsTarget).toBe(true);
    expect(withCargo.denialValue).toBeGreaterThan(without.denialValue);
  });

  it("scores nothing for denial when there is nobody worth denying", () => {
    const plan = planAgainst(duel(), "p2");
    expect(plan.expectedHullDamage).toBeGreaterThan(0);
    expect(plan.denialValue).toBeLessThan(1);
  });
});
