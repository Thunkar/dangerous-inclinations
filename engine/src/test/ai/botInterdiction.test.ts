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
import { MISSIONS_TO_WIN } from "../../models/missions.ts";
import type { GameState, Position, ShipLoadout } from "../../models/game.ts";
import {
  BLACK_HOLE_OUTER_RING,
  PLANET_OUTER_RING,
  STATION_RING,
} from "../../models/gravityWells.ts";
import { viewFor } from "../../game/view.ts";
import { executeTurn } from "../../game/turns.ts";
import { getStationForPlanet } from "../../game/stations.ts";
import { analyzeSituation, botDecideActions } from "../../ai/index.ts";
import { DEFAULT_BOT_PARAMETERS, INTERDICT_DANGER } from "../../ai/types.ts";
import type { Opponent } from "../../ai/types.ts";
import {
  assessDanger,
  cheapTurnEstimate,
  predictedDeliveryPlanets,
} from "../../ai/behaviors/danger.ts";
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
/** Four shield cubes: two points of absorption, enough to eat a rack round whole. */
const WALLED: ShipLoadout = {
  forwardSlots: ["sensor_array"],
  sideSlots: ["radiator", "radiator", "shields", "shields"],
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

/** Every card but one face-up and a crate in the hold: one dock from the win. */
const ONE_FROM_WINNING = MISSIONS_TO_WIN - 1;

function aboutToWin(state: GameState, playerId: string, cargo: Cargo[] = [crate(ALPHA, BETA)]) {
  return withPlayer(state, playerId, { completedMissionCount: ONE_FROM_WINNING, cargo });
}

function situationOf(state: GameState, viewerId: string) {
  return analyzeSituation(viewFor(state, viewerId), DEFAULT_BOT_PARAMETERS);
}

function opponent(state: GameState, viewerId: string, id: string): Opponent {
  const found = situationOf(state, viewerId).opponents.find((o) => o.player.id === id);
  if (!found) throw new Error(`no opponent ${id}`);
  return found;
}

describe("cheap turn estimates: the map has a direction of travel", () => {
  /**
   * The estimate ranks every "which station?" the bots ask, and the lanes are
   * one-way arcs at fixed sectors, so which planet is near depends on where
   * you are standing. An estimate that only counted rings tied all three and
   * the first planet listed won every tie.
   */
  const WELLS = [BH, ALPHA, BETA, GAMMA];
  const station = (planetId: string): Position => ({
    wellId: planetId,
    ring: STATION_RING,
    sector: 0,
  });
  const laneRing = (wellId: string) => (wellId === BH ? BLACK_HOLE_OUTER_RING : PLANET_OUTER_RING);

  it("prices the planets by where their lane door sits on black hole ring 5", () => {
    // Reading ring 5 prograde: out to Beta (0-3), out to Gamma (8-11), out to
    // Alpha (16-19). On sector 0 you are already under Beta's door.
    const from: Position = { wellId: BH, ring: 4, sector: 0 };

    expect(cheapTurnEstimate(from, station(BETA))).toBeLessThan(
      cheapTurnEstimate(from, station(GAMMA))
    );
    expect(cheapTurnEstimate(from, station(GAMMA))).toBeLessThan(
      cheapTurnEstimate(from, station(ALPHA))
    );
  });

  it.each([
    [ALPHA, GAMMA, BETA],
    [GAMMA, BETA, ALPHA],
    [BETA, ALPHA, GAMMA],
  ])("from %s the cheap next stop is %s and not %s", (from, near, far) => {
    // The jump home lands beside the next planet's door: Alpha -> Gamma ->
    // Beta -> Alpha is the circuit, and the estimate has to see it.
    const at: Position = { wellId: from, ring: STATION_RING, sector: 0 };

    expect(cheapTurnEstimate(at, station(near))).toBeLessThan(cheapTurnEstimate(at, station(far)));
  });

  it.each(WELLS.flatMap((a) => WELLS.filter((b) => b !== a).map((b) => [a, b] as const)))(
    "never prices %s -> %s below the ring legs plus the jump",
    (fromWell, toWell) => {
      // Overestimating a trip only nudges a bot toward an easier goal;
      // underestimating the jump itself would make a crossing look free.
      // Sector 17 is inside every planet's inbound arc and inside Alpha's
      // outbound one, so on those rows the jump is all there is above the
      // ring legs.
      const from: Position = { wellId: fromWell, ring: 2, sector: 17 };
      const to: Position = { wellId: toWell, ring: 1, sector: 19 };
      const ringLegs =
        Math.abs(from.ring - laneRing(fromWell)) + Math.abs(to.ring - laneRing(toWell));

      expect(cheapTurnEstimate(from, to)).toBeGreaterThanOrEqual(ringLegs + 1);
    }
  );

  it("leaves a target in the same well as the rings plus the shortest arc", () => {
    // Two rings crossed and six sectors of drift at three sectors a turn.
    expect(
      cheapTurnEstimate({ wellId: BH, ring: 4, sector: 0 }, { wellId: BH, ring: 2, sector: 6 })
    ).toBe(4);
  });
});

describe("danger: reading the scoreboard and the hold", () => {
  it("scores a player one card from the win with a crate aboard as the one to stop", () => {
    const state = aboutToWin(
      makeTwoPlayerGame({ loadout: RAIDER }, { wellId: ALPHA, ring: STATION_RING, sector: 4 }),
      "p2"
    );
    const danger = opponent(state, "p1", "p2").danger;

    expect(danger.completedMissions).toBe(ONE_FROM_WINNING);
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
      { cargoAboard: { crates: 1, data: 0 }, completedMissionCount: ONE_FROM_WINNING },
      { wellId: ALPHA, ring: STATION_RING, sector: 4 },
      stations
    );
    const empty = assessDanger(
      { cargoAboard: { crates: 0, data: 0 }, completedMissionCount: ONE_FROM_WINNING },
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
    // p3 has a chit aboard and a station under it, but nothing face-up: every
    // card is worth two now, so a rival one card short is a rival about to
    // win however close the other one happens to be sitting.
    state = withPlayer(state, "p3", { completedMissionCount: 0, cargo: [dataChit()] });
    state = aboutToWin(state, "p2", [crate(BETA, ALPHA)]);
    const situation = situationOf(state, "p1");

    expect(opponent(state, "p1", "p2").danger.score).toBeGreaterThan(
      opponent(state, "p1", "p3").danger.score
    );
    expect(situation.currentGoal?.type).toBe("interdict");
    expect(situation.currentGoal?.targetPlayerId).toBe("p2");
  });

  it("keeps racing when it is closer to its own third card than they are to theirs", () => {
    // Both are one dock from the win and both are orbiting Alpha, so the
    // public reading of the race is the trip out of this well: a crate cannot
    // be delivered where it was loaded, and the way out is Alpha's inbound
    // lane on ring 4 sectors 16-19. The bot is the one sitting just short of
    // it and p2 is most of a lap behind, so the bot gets home first — turning
    // to fight would hand the game to the third player.
    let state = aboutToWin(threeWay(), "p2", [crate(BETA, ALPHA)]);
    state = withPlayer(state, "p1", {
      completedMissionCount: ONE_FROM_WINNING,
      cargo: [crate(BETA, ALPHA)],
      missions: [deliverMission(BETA, ALPHA)],
    });
    state = withShip(state, "p1", { sector: 13 });
    const situation = situationOf(state, "p1");

    expect(situation.myDanger.turnsToWin).toBeLessThanOrEqual(
      opponent(state, "p1", "p2").danger.turnsToWin
    );
    expect(situation.currentGoal?.type).not.toBe("interdict");
  });

  it("does not divert when its guns cannot beat the shield cubes on the target", () => {
    // A shield tile buys one point of absorption for every two cubes on it, so
    // the wall below — two tiles, four cubes — stops a two-damage rack whole
    // and the bot has no business chasing. A laser skips the shields, so the
    // same trader with a laser does divert. Same board, same rival, same
    // score: only the bot's hull differs.
    const board = (loadout: ShipLoadout) => {
      let state = aboutToWin(
        makeGameState([
          makePlayer("p1", { wellId: ALPHA, ring: STATION_RING, sector: 6 }, loadout),
          makePlayer("p2", { wellId: ALPHA, ring: STATION_RING, sector: 8 }, WALLED),
        ]),
        "p2",
        [crate(BETA, ALPHA)]
      );
      for (const id of ["side-2", "side-3"] as const) {
        state = withPower(withSub(state, "p2", id, { isRevealed: true }), "p2", id, 2);
      }
      return state;
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
      completedMissionCount: ONE_FROM_WINNING,
      cargo: [],
    });

    const withCargo = planAgainst(loaded, "p2");
    const without = planAgainst(empty, "p2");

    expect(withCargo.killsTarget).toBe(true);
    expect(withCargo.denialValue).toBeGreaterThan(without.denialValue);
  });

  it("counts a hit on anyone, and counts it far higher on the player about to win", () => {
    // What a shot takes off a ship does not depend on the scoreboard — their
    // hull, and on a kill their hold and their next two turns. The scoreboard
    // decides how urgent that is, not whether it is worth anything.
    const nobody = planAgainst(duel(), "p2");
    const leader = planAgainst(aboutToWin(duel(), "p2"), "p2");
    expect(nobody.expectedHullDamage).toBeGreaterThan(0);
    expect(nobody.denialValue).toBeGreaterThan(0);
    expect(leader.denialValue).toBeGreaterThan(nobody.denialValue * 1.5);
  });
});
