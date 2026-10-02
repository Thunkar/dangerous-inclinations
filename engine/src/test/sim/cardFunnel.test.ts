/**
 * The card funnel on games written by hand: one card, one line of events,
 * one right answer for each column of the benchmark's failure table.
 */
import { describe, it, expect } from "vitest";
import type { GameEvent } from "../../models/events.ts";
import type { Mission } from "../../models/missions.ts";
import type { GameRunResult, TurnStat } from "../../sim/runGame.ts";
import { cardTracksOf, type CardTrack } from "../../sim/cardFunnel.ts";
import {
  ALPHA,
  deliverMission,
  escortMission,
  interceptMission,
  makeGameState,
  makePlayer,
  surveyMission,
  tankerMission,
} from "../testUtils.ts";

const INTERCEPT = interceptMission("p2", "intercept-p1", ALPHA);
const DELIVER = deliverMission(ALPHA, "planet-gamma", "deliver-p1");
const SURVEY = surveyMission("survey-p1");
const TANKER = tankerMission("tanker-p1");
const ESCORT = escortMission("escort-p1");

/** p1's Escort marker goes on p2. */
const escortMarked = (turn: number): GameEvent => ({
  type: "escort_marked",
  turn,
  escortId: "p1",
  carrierId: "p2",
  missionId: ESCORT.id,
});
/** p1's Escort marker comes back, because p1 or p2 died. */
const escortReleased = (
  turn: number,
  cause: "carrier_destroyed" | "escort_destroyed"
): GameEvent => ({
  type: "escort_released",
  turn,
  escortId: "p1",
  carrierId: "p2",
  missionId: ESCORT.id,
  cause,
});
/** p2, the marked ship, sells a crate. */
const carrierSold = (turn: number): GameEvent => ({
  type: "cargo_delivered",
  turn,
  playerId: "p2",
  cargoId: "item-9",
  kind: "crate",
  planetId: ALPHA,
});

const scanned = (turn: number): GameEvent => ({
  type: "data_acquired",
  turn,
  playerId: "p1",
  kind: "scan",
  missionId: INTERCEPT.id,
});
const dived = (turn: number): GameEvent => ({
  type: "data_acquired",
  turn,
  playerId: "p1",
  kind: "survey",
  missionId: SURVEY.id,
});
const killed = (turn: number): GameEvent => ({
  type: "ship_destroyed",
  turn,
  victimId: "p1",
  killerId: "p2",
  cause: "weapon",
});
const loaded = (turn: number): GameEvent => ({
  type: "cargo_picked_up",
  turn,
  playerId: "p1",
  cargoId: DELIVER.cargoId,
  kind: "crate",
  planetId: ALPHA,
});
const seized = (turn: number): GameEvent => ({
  type: "cargo_seized",
  turn,
  pirateId: "p2",
  victimId: "p1",
  kind: "crate",
  cargoId: DELIVER.cargoId,
  at: { wellId: ALPHA, ring: 3, sector: 0 },
});
const scored = (turn: number, mission: Mission): GameEvent => ({
  type: "mission_completed",
  turn,
  playerId: "p1",
  mission,
  points: 2,
});

/** p1's turns, one a round, each with its events and where it ended. */
function run(
  mission: Mission,
  turns: Array<{ events: GameEvent[]; stat?: Partial<TurnStat> }>
): GameRunResult {
  const finalState = makeGameState([
    makePlayer("p1", undefined, undefined, { missions: [mission] }),
    makePlayer("p2"),
  ]);
  return {
    seed: 1,
    finalState,
    turnsPlayed: turns.length,
    endReason: "victory",
    turns: turns.map((t, i) => ({
      turnNumber: i + 1,
      playerId: "p1",
      actions: [],
      events: t.events,
    })),
    turnStats: turns.map(
      (t, i): TurnStat => ({
        turn: i + 1,
        playerId: "p1",
        coasted: true,
        burned: false,
        jumped: false,
        scooped: false,
        shotsFired: 0,
        shieldCubes: 0,
        upEnergy: 0,
        heatAtCheck: 0,
        heatDamage: 0,
        fuel: 0,
        endedAtPlanet: false,
        endedMoored: false,
        lost: false,
        ...t.stat,
      })
    ),
  };
}

describe("where cards fail", () => {
  it.each<[string, GameRunResult, Partial<CardTrack>]>([
    [
      "an Intercept scanned, lost to a kill, scanned again and filed",
      run(INTERCEPT, [
        { events: [] },
        { events: [scanned(2)] },
        { events: [] },
        { events: [killed(4)] },
        { events: [scanned(5)] },
        { events: [] },
        { events: [scored(7, { ...INTERCEPT, isCompleted: true })] },
      ]),
      { stepRound: 2, lostToKill: 1, lostToPiracy: 0, completedRound: 7, stepToDone: 2, openWithStep: false },
    ],
    [
      "a crate loaded and taken by a pirate",
      run(DELIVER, [{ events: [] }, { events: [loaded(2)] }, { events: [seized(3)] }]),
      { stepRound: 2, lostToKill: 0, lostToPiracy: 1, completedRound: null, openWithStep: false },
    ],
    [
      "Survey data still aboard when the game ends",
      run(SURVEY, [{ events: [dived(1)] }, { events: [] }]),
      { stepRound: 1, completedRound: null, openWithStep: true },
    ],
    [
      "a Tanker that reached a planet with the fuel and left without pumping",
      run(TANKER, [
        { events: [], stat: { fuel: 10 } },
        { events: [], stat: { fuel: 8, endedAtPlanet: true } },
        { events: [], stat: { fuel: 8 } },
      ]),
      { stepRound: 2, lostToBurn: 1, completedRound: null, openWithStep: false },
    ],
    [
      "an Escort released when the escort died, marked again and paid",
      run(ESCORT, [
        { events: [escortMarked(1)] },
        { events: [escortReleased(2, "escort_destroyed")] },
        { events: [escortMarked(3)] },
        { events: [carrierSold(4), scored(4, { ...ESCORT, isCompleted: true })] },
      ]),
      { stepRound: 1, lostToKill: 1, lostToCarrier: 0, missedSales: 0, completedRound: 4, stepToDone: 1 },
    ],
    [
      "an Escort whose carrier sold out of its reach and then died: released, and the track ends open",
      run(ESCORT, [
        { events: [escortMarked(1)] },
        { events: [carrierSold(2)] },
        { events: [escortReleased(3, "carrier_destroyed")] },
        { events: [] },
      ]),
      { stepRound: 1, lostToKill: 0, lostToCarrier: 1, missedSales: 1, completedRound: null, openWithStep: false },
    ],
    [
      "an Escort released when the carrier died, marked again and paid",
      run(ESCORT, [
        { events: [escortMarked(1)] },
        { events: [escortReleased(2, "carrier_destroyed")] },
        { events: [escortMarked(4)] },
        { events: [carrierSold(5), scored(5, { ...ESCORT, isCompleted: true })] },
      ]),
      { stepRound: 1, lostToKill: 0, lostToCarrier: 1, missedSales: 0, completedRound: 5, stepToDone: 1 },
    ],
    [
      "an Escort still out when the game ends",
      run(ESCORT, [{ events: [escortMarked(1)] }, { events: [] }]),
      { stepRound: 1, lostToCarrier: 0, completedRound: null, openWithStep: true },
    ],
    [
      "a card never started",
      run(INTERCEPT, [{ events: [] }, { events: [killed(2)] }]),
      { stepRound: null, lostToKill: 0, completedRound: null, openWithStep: false },
    ],
  ])("%s", (_label, game, expected) => {
    const [track] = cardTracksOf(game);
    expect(track).toMatchObject(expected);
  });
});
