/**
 * Full bot-vs-bot games. The engine is the judge: `executeTurn` must never
 * return an error for anything the AI produced, from the loadout phase to
 * the last turn. `runGame` wires the same engine functions the server uses
 * (createGame → botChooseLoadout/submitLoadout → botChooseDeployment/
 * deployShip → executeTurn on `viewFor(state, activeId)`).
 */
import { describe, it, expect } from "vitest";
import { runGame, setupBotGame, formatFailure } from "../../sim/runGame.ts";
import { HOME_RINGS, HOME_WELL_ID } from "../../models/gravityWells.ts";
import type { MissionType } from "../../models/missions.ts";
import { MISSIONS_PER_PLAYER, MISSION_FAMILY } from "../../models/missions.ts";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const MAX_TURNS = 120;

/** The only cards that exist. A bot must never hold or chase anything else. */
const MISSION_TYPES = Object.keys(MISSION_FAMILY) as MissionType[];

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

  it("deals, keeps and completes only the card types that exist", () => {
    const kept = new Set<MissionType>();
    const completed = new Set<MissionType>();
    for (const seed of SEEDS) {
      const result = runGame({ seed, botCount: 3, maxTurns: MAX_TURNS, record: false });
      expect(result.endReason).not.toBe("invalid_turn");
      for (const player of result.finalState.players) {
        for (const mission of player.missionOffers) expect(MISSION_TYPES).toContain(mission.type);
        for (const mission of player.missions) {
          expect(MISSION_TYPES).toContain(mission.type);
          kept.add(mission.type);
          if (mission.isCompleted) completed.add(mission.type);
        }
      }
    }
    // The bots pick their own hands, so no single type is guaranteed; what
    // must hold is that they finish cards from more than one family.
    expect(completed.size).toBeGreaterThan(1);
    expect(new Set([...completed].map((t) => MISSION_FAMILY[t])).size).toBeGreaterThan(1);
    for (const type of completed) expect(kept).toContain(type);
  }, 30_000);

  it("is deterministic for a seed", () => {
    const a = runGame({ seed: 7, botCount: 3, maxTurns: MAX_TURNS, record: false });
    const b = runGame({ seed: 7, botCount: 3, maxTurns: MAX_TURNS, record: false });
    expect(b.turnsPlayed).toBe(a.turnsPlayed);
    expect(b.finalState.winnerId).toBe(a.finalState.winnerId);
    expect(JSON.stringify(b.turns)).toBe(JSON.stringify(a.turns));
  });

  it("sets every bot up with three missions and a home on a Black Hole deployment ring", () => {
    const state = setupBotGame(11, 4);
    expect(state.phase).toBe("active");
    const homes = new Set<string>();
    for (const player of state.players) {
      expect(player.missions).toHaveLength(MISSIONS_PER_PLAYER);
      expect(player.hasSubmittedLoadout).toBe(true);
      expect(player.hasDeployed).toBe(true);
      expect(player.home).not.toBeNull();
      expect(player.home!.wellId).toBe(HOME_WELL_ID);
      expect(HOME_RINGS as readonly number[]).toContain(player.home!.ring);
      const key = `${player.home!.wellId}:${player.home!.sector}`;
      expect(homes.has(key)).toBe(false);
      homes.add(key);
    }
  });
});
