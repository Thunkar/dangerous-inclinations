/**
 * Full bot-vs-bot games. The engine is the judge: `executeTurn` must never
 * return an error for anything the AI produced, from the loadout phase to
 * the last turn. `runGame` wires the same engine functions the server uses
 * (createGame → botChooseLoadout/submitLoadout → botChooseDeployment/
 * deployShip → executeTurn on `viewFor(state, activeId)`).
 *
 * The default run plays two seeds per seat count; `FULL_BOT_GAMES=1` plays
 * the whole matrix.
 */
import { describe, it, expect } from "vitest";
import { runGame, setupBotGame, formatFailure } from "../../sim/runGame.ts";
import type { ShipLoadout } from "../../models/game.ts";
import {
  MISSIONS_PER_PLAYER,
  PRIMARIES_PER_PLAYER,
  SECONDARIES_PER_PLAYER,
  isPrimaryType,
} from "../../models/missions.ts";
import { missionsMissingRequirements } from "../../game/loadout.ts";
import { LOADOUTS } from "../testUtils.ts";

const FULL = process.env.FULL_BOT_GAMES === "1";
const SEEDS = FULL ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2];
const MAX_TURNS = 120;

/** Hulls forced on seat 1: each can fly some hands and not others. */
const FORCED_HULLS: Array<[string, ShipLoadout]> = [
  ["a hauler with no sensor", LOADOUTS.hauler],
  ["a sensor bow with no gun", LOADOUTS.unarmed],
];

describe("bot-vs-bot games", () => {
  for (const botCount of [2, 3, 4]) {
    for (const seed of SEEDS) {
      it(`${botCount} bots, seed ${seed}: every turn is accepted by the engine`, () => {
        const result = runGame({ seed, botCount, maxTurns: MAX_TURNS, record: false });
        expect(result.failure ? formatFailure(result.failure) : null).toBeNull();
        expect(result.endReason).not.toBe("invalid_turn");
        expect(result.turnsPlayed).toBeGreaterThan(0);
        expect(["victory", "max_turns"]).toContain(result.endReason);
      });
    }
  }

  it.each([
    ...[3, 4, 5, 6].map((n) => [`${n} bots choosing their own hulls`, n, undefined] as const),
    ...FORCED_HULLS.map(([label, hull]) => [`${label} forced on seat 1`, 3, hull] as const),
  ])(
    "%s keep a legal hand: one primary and two secondaries, offered and flyable",
    (_l, n, hull) => {
      for (let seed = 1; seed <= 20; seed++) {
        const state = setupBotGame(seed, n, hull ? { "bot-1": hull } : undefined);
        for (const player of state.players) {
          const offered = new Set(player.missionOffers.map((m) => m.id));
          expect(player.missions.every((m) => offered.has(m.id))).toBe(true);
          expect(new Set(player.missions.map((m) => m.id)).size).toBe(MISSIONS_PER_PLAYER);
          expect(player.missions.filter((m) => isPrimaryType(m.type))).toHaveLength(
            PRIMARIES_PER_PLAYER
          );
          expect(player.missions.filter((m) => !isPrimaryType(m.type))).toHaveLength(
            SECONDARIES_PER_PLAYER
          );
          expect(missionsMissingRequirements(player.missions, player.ship.loadout)).toEqual([]);
        }
      }
    }
  );

  it("is deterministic for a seed", () => {
    // Keep seed 7: it is the game here in which an interceptor scans again for
    // data a pirate took off it (the rescan branch in game/scan.ts).
    const a = runGame({ seed: 7, botCount: 3, maxTurns: MAX_TURNS, record: false });
    const b = runGame({ seed: 7, botCount: 3, maxTurns: MAX_TURNS, record: false });
    expect(b.turnsPlayed).toBe(a.turnsPlayed);
    expect(b.finalState.winnerId).toBe(a.finalState.winnerId);
    expect(JSON.stringify(b.turns)).toBe(JSON.stringify(a.turns));
  });
});
