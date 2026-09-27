/**
 * The simulator's stats on a game written by hand, so every number has one
 * right answer. Cards and points are different things: a primary is one card
 * and two points.
 */
import { describe, it, expect } from "vitest";
import type { GameEvent } from "../../models/events.ts";
import type { Mission } from "../../models/missions.ts";
import type { PlayerAction } from "../../models/game.ts";
import type { GameRunResult } from "../../sim/runGame.ts";
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
      turn(5, "p1", [
        { type: "ship_destroyed", turn: 5, victimId: "p2", killerId: "p1", cause: "weapon" },
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
      turn(8, "p2", [
        { type: "escort_marked", turn: 8, escortId: "p2", carrierId: "p1", missionId: "escort-1" },
      ]),
      turn(
        9,
        "p1",
        [docked(9, "p1", "crates")],
        [{ type: "dock_job", playerId: "p1", data: { job: "crates" } }]
      ),
      turn(10, "p2", [docked(10, "p2", "data"), docked(10, "p2", null)]),
      turn(11, "p1", [completed(11, "p2", escort, 2)]),
    ],
    turnStats: [],
  };
}

function docked(turn: number, playerId: string, job: "crates" | "data" | null): GameEvent {
  return {
    type: "docked",
    turn,
    playerId,
    planetId: "planet-alpha",
    hullRestored: 0,
    repaired: [],
    missilesReloaded: false,
    job,
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
      escortMarks: 1,
      markToCompletionRounds: [3],
      wrecksLeft: 1,
      wrecksSalvaged: 0,
      seizuresByKind: { crate: 0, data: 1 },
      // Two visits did a job (a null job is no job), and one had it named.
      dockVisitsWithJob: 2,
      dockJobsNamed: 1,
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
      dockJobsNamedShare: 0.5,
    });
  });
});
