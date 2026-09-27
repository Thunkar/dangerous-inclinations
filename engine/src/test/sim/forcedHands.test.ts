/**
 * `--hands=`: a forced primary is dealt, not filtered for, so a Destroy row is
 * a Destroy row on every seed, and a seed the deal already served is left as
 * it was.
 */
import { describe, it, expect } from "vitest";
import { setupBotGame } from "../../sim/runGame.ts";
import { isPrimaryType, type MissionType } from "../../models/missions.ts";
import { getPlayer } from "../testUtils.ts";

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);
const PRIMARIES: MissionType[] = ["destroy_ship", "deliver_cargo", "intercept_transmission"];

describe("a forced primary", () => {
  it.each(PRIMARIES)("seat 1 dealt %s keeps it on every one of 50 seeds", (type) => {
    for (const seed of SEEDS) {
      const state = setupBotGame(seed, 3, undefined, { "bot-1": type });
      const kept = getPlayer(state, "bot-1").missions.filter((m) => isPrimaryType(m.type));
      expect(
        kept.map((m) => m.type),
        `seed ${seed}`
      ).toEqual([type]);
    }
  });

  it.each(PRIMARIES)("leaves every deal of %s it did not need to touch as it was", (type) => {
    let served = 0;
    let swapped = 0;
    for (const seed of SEEDS) {
      const plain = setupBotGame(seed, 3);
      const forced = setupBotGame(seed, 3, undefined, { "bot-1": type });
      // The other seats' offers are theirs whatever seat 1 was dealt.
      for (const id of ["bot-2", "bot-3"]) {
        expect(getPlayer(forced, id).missionOffers).toEqual(getPlayer(plain, id).missionOffers);
      }
      const offers = getPlayer(plain, "bot-1").missionOffers;
      if (offers.some((m) => m.type === type)) {
        served++;
        expect(getPlayer(forced, "bot-1").missionOffers, `seed ${seed}`).toEqual(offers);
      } else {
        swapped++;
        expect(getPlayer(forced, "bot-1").missionOffers).not.toEqual(offers);
      }
    }
    // Both branches ran, or the test proves nothing about one of them.
    expect(served).toBeGreaterThan(0);
    expect(swapped).toBeGreaterThan(0);
  });
});
