/**
 * Who an Escort marker may go on is asked from two sides: a seat's own view
 * (the bots, the seat CLI and the table's plan) and the referee's state at the
 * end of the turn. The two must give the same answer, or a seat is offered a
 * marker the referee refuses.
 */
import { describe, it, expect } from "vitest";
import type { Mission } from "../../models/missions.ts";
import type { Player, Position } from "../../models/game.ts";
import { escortCandidates, escortCandidatesAtEndOfTurn } from "../../game/escort.ts";
import { positionOf } from "../../game/geometry.ts";
import { viewFor } from "../../game/view.ts";
import {
  ALPHA,
  BH,
  crateCargo,
  dataCargo,
  escortMission,
  makeGameState,
  makePlayer,
} from "../testUtils.ts";

/** A few squares, one of them Alpha's berth at the start, so ships share them often. */
const SQUARES: Position[] = [
  { wellId: BH, ring: 3, sector: 4 },
  { wellId: BH, ring: 3, sector: 5 },
  { wellId: ALPHA, ring: 2, sector: 0 },
  { wellId: ALPHA, ring: 1, sector: 0 },
];
const IDS = ["p1", "p2", "p3", "p4"];

/** A small seeded generator: the same tables every run. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return (n: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s >>> 16) % n;
  };
}

function randomTable(seed: number) {
  const pick = lcg(seed);
  const players: Player[] = IDS.map((id) => {
    const cargo = [
      [],
      [crateCargo(ALPHA, BH)],
      [dataCargo(`data-${id}`, `survey-${id}`)],
      [crateCargo(ALPHA, BH, false)],
    ][pick(4)];
    const rivals = IDS.filter((other) => other !== id);
    const missions: Mission[] = [
      [],
      [escortMission(`escort-${id}`)],
      [escortMission(`escort-${id}-a`), escortMission(`escort-${id}-b`)],
      [escortMission(`escort-${id}-a`, rivals[pick(3)]), escortMission(`escort-${id}-b`)],
      [{ ...escortMission(`escort-${id}`), isCompleted: true }],
      [escortMission(`escort-${id}`, null, true)],
    ][pick(6)];
    return makePlayer(id, SQUARES[pick(SQUARES.length)], undefined, {
      cargo,
      missions,
      ...(pick(6) === 0 ? { ship: { hitPoints: 0 } } : {}),
    } as Partial<Player>);
  });
  return makeGameState(players);
}

describe("escort candidates: the seat's view and the referee agree", () => {
  it("on 300 random tables, for every live seat", () => {
    let offered = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const state = randomTable(seed);
      for (const player of state.players) {
        if (player.ship.hitPoints <= 0) continue;
        const fromView = escortCandidates(
          viewFor(state, player.id),
          player.id,
          positionOf(player.ship)
        );
        const fromState = escortCandidatesAtEndOfTurn(state.players, state.stations, player.id);
        expect(fromView, `seed ${seed}, ${player.id}`).toEqual(fromState);
        offered += fromState.length;
      }
    }
    // Enough tables offer a marker for the agreement to mean something.
    expect(offered).toBeGreaterThan(20);
  });
});
