/**
 * The simulator's stats on a game written by hand, so every number has one
 * right answer. Cards and points are different things: a primary is one card
 * and two points.
 */
import { describe, it, expect } from "vitest";
import type { GameEvent } from "../../models/events.ts";
import type { Mission } from "../../models/missions.ts";
import type { PlayerAction } from "../../models/game.ts";
import type { GameRunResult, TurnStat } from "../../sim/runGame.ts";
import { aggregateStats, computePerGameStats } from "../../sim/stats.ts";
import {
  BH,
  destroyMission,
  escortMission,
  makeGameState,
  makePlayer,
  surveyMission,
} from "../testUtils.ts";

const at = { wellId: BH, ring: 3, sector: 4 };
const done = <M extends Mission>(m: M): M => ({ ...m, isCompleted: true });
const destroy = done(destroyMission("p2"));
const survey = done(surveyMission());
const escort = done(escortMission("escort-1", "p1"));

const completed = (turn: number, playerId: string, mission: Mission, count: number): GameEvent => ({
  type: "mission_completed",
  turn,
  playerId,
  mission,
  points: count,
});

/**
 * Twelve rounds of two seats. p2 scores first (Survey, round 3), p1 takes the
 * lead with a Destroy (round 5) and holds it at round 10, and p2 draws level
 * with an Escort marked in round 8 and paid in round 11, then wins.
 */
function cannedRun(): GameRunResult {
  const p1 = makePlayer("p1", undefined, undefined, {
    missions: [destroy],
    points: 2,
  });
  const p2 = makePlayer("p2", undefined, undefined, {
    missions: [survey, escort],
    points: 2,
  });
  const finalState = makeGameState([p1, p2], { phase: "ended", winnerId: "p2" });
  const turn = (
    turnNumber: number,
    playerId: string,
    events: GameEvent[],
    actions: PlayerAction[] = []
  ) => ({ turnNumber, playerId, actions, events });
  return {
    seed: 1,
    finalState,
    turnsPlayed: 24,
    endReason: "victory",
    turns: [
      turn(3, "p2", [completed(3, "p2", survey, 1)]),
      // p1 tries Escorts of its own that never score: one back in hand when p2
      // dies, one when the escort is destroyed.
      turn(4, "p1", [
        { type: "escort_marked", turn: 4, escortId: "p1", carrierId: "p2", missionId: "escort-2" },
      ]),
      turn(5, "p1", [
        { type: "ship_destroyed", turn: 5, victimId: "p2", killerId: "p1", cause: "weapon" },
        {
          type: "escort_released",
          turn: 5,
          escortId: "p1",
          carrierId: "p2",
          missionId: "escort-2",
          cause: "carrier_destroyed",
        },
        { type: "wreck_left", turn: 5, wreckId: "w1", victimId: "p2", at },
        completed(5, "p1", destroy, 2),
      ]),
      turn(7, "p1", [
        {
          type: "cargo_seized",
          turn: 7,
          pirateId: "p1",
          victimId: "p2",
          kind: "data",
          cargoId: "d",
          at,
        },
      ]),
      turn(6, "p1", [
        { type: "escort_marked", turn: 6, escortId: "p1", carrierId: "p2", missionId: "escort-3" },
        {
          type: "escort_released",
          turn: 6,
          escortId: "p1",
          carrierId: "p2",
          missionId: "escort-3",
          cause: "escort_destroyed",
        },
      ]),
      turn(8, "p2", [
        { type: "escort_marked", turn: 8, escortId: "p2", carrierId: "p1", missionId: "escort-1" },
      ]),
      turn(
        9,
        "p1",
        // p1 sells with p2's marker on it and p2 out of the well: a missed sale.
        [delivered(9, "p1"), docked(9, "p1", "crate")],
        [{ type: "dock_sale", playerId: "p1", data: { sale: "item-1" } }]
      ),
      turn(10, "p2", [docked(10, "p2", "data"), docked(10, "p2", null)]),
      // This sale pays p2's Escort: not a missed one.
      turn(11, "p1", [delivered(11, "p1"), completed(11, "p2", escort, 2)]),
      turn(12, "p2", [
        { type: "fuel_pumped", turn: 12, playerId: "p2", amount: 7, planetId: "planet-alpha" },
      ]),
    ],
    turnStats: [
      // Where turns end: two in a planet's well (one of them moored), one in
      // the black hole's, and a respawn turn, which is not an acting turn.
      turnStat({ endedAtPlanet: true, endedMoored: true }),
      turnStat({ endedAtPlanet: true }),
      turnStat({}),
      turnStat({ endedAtPlanet: true, endedMoored: true, lost: true }),
    ],
  };
}

function turnStat(over: Partial<TurnStat>): TurnStat {
  return {
    turn: 1,
    playerId: "p1",
    coasted: true,
    burned: false,
    jumped: false,
    scooped: false,
    fuel: 0,
    shotsFired: 0,
    shieldCubes: 0,
    upEnergy: 0,
    heatAtCheck: 0,
    heatDamage: 0,
    endedAtPlanet: false,
    endedMoored: false,
    lost: false,
    ...over,
  };
}

function delivered(turn: number, playerId: string): GameEvent {
  return {
    type: "cargo_delivered",
    turn,
    playerId,
    cargoId: `item-${turn}`,
    kind: "crate",
    planetId: "planet-alpha",
  };
}

function docked(turn: number, playerId: string, sold: "crate" | "data" | null): GameEvent {
  return {
    type: "docked",
    turn,
    playerId,
    planetId: "planet-alpha",
    hullRestored: 0,
    repaired: [],
    missilesReloaded: false,
    sold,
  };
}

describe("stats from a game written by hand", () => {
  const game = computePerGameStats(cannedRun());

  it("counts cards and points apart: three cards, four points", () => {
    expect(game.cards).toBe(3);
    expect(game.points).toBe(4);
    expect(game.completionsByType).toEqual({ survey: 1, destroy_ship: 1, escort: 1 });
    expect(game.perPlayer.p1.points).toBe(2);
  });

  it("reads how the game unfolded off its events", () => {
    expect(game.unfolding).toEqual({
      // p2 led, then p1: one change. The draw in round 11 leaves nobody leading.
      leadChanges: 1,
      leaderAtRound10: "p1",
      firstScoreRound: 3,
      escortMarks: 3,
      escortsPaid: 1,
      escortsCarrierDied: 1,
      escortsEscortDied: 1,
      escortMissedSales: 1,
      markToCompletionRounds: [3],
      wrecksLeft: 1,
      wrecksSalvaged: 0,
      seizuresByKind: { crate: 0, data: 1 },
      // Two visits made a sale (null is none), and one had it named.
      dockSales: 2,
      dockSalesNamed: 1,
      fuelPumps: 1,
    });
  });

  it("reads where the acting turns ended", () => {
    expect(game.behaviour).toMatchObject({
      planetWellShare: 2 / 3,
      blackHoleShare: 1 / 3,
      mooredShare: 1 / 3,
    });
  });

  it("aggregates a game won from behind at round 10", () => {
    const a = aggregateStats([game]);
    expect(a.cards.mean).toBe(3);
    expect(a.points.mean).toBe(4);
    expect(a.unfolding).toMatchObject({
      gamesPastRound10: 1,
      wonFromBehindShare: 1,
      salvagedShare: 0,
      dockSalesNamedShare: 0.5,
      fuelPumpsPerGame: 1,
    });
  });
});
