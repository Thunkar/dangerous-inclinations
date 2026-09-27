import { afterEach, describe, it, expect } from "vitest";
import {
  applySecondaryOverrides,
  describeSecondaryKinds,
  parseSecondaryOverrides,
} from "../../sim/secondaryOverrides.ts";
import { SECONDARY_KINDS_PRINTED, type SecondaryKind } from "../../models/missions.ts";
import { buildSecondaryDeck, dealMissionOffers } from "../../game/missions/missionDeck.ts";
import { isPrimaryType } from "../../models/missions.ts";
import { Rng } from "../../utils/rng.ts";

const PRINTED: SecondaryKind[] = [...SECONDARY_KINDS_PRINTED];

describe("sim: --secondaries", () => {
  // The channel mutates the process's pile: put the printed one back.
  afterEach(() => applySecondaryOverrides(PRINTED));

  it.each<[string, SecondaryKind[]]>([
    ["survey,piracy,tanker", ["survey", "piracy", "tanker"]],
    [" salvage , escort ", ["salvage", "escort"]],
    ["tanker", ["tanker"]],
  ])("parses %s", (text, kinds) => {
    expect(parseSecondaryOverrides(text)).toEqual(kinds);
  });

  it.each(["", "survey,bogus", "survey,survey", "destroy_ship"])("refuses %j", (text) => {
    expect(() => parseSecondaryOverrides(text)).toThrow();
  });

  it("deals only the kinds it names, and leaves the pile alone without a list", () => {
    applySecondaryOverrides(undefined);
    expect(new Set(buildSecondaryDeck().map((c) => c.type))).toEqual(new Set(PRINTED));

    applySecondaryOverrides(["survey", "piracy", "tanker"]);
    expect(describeSecondaryKinds()).toBe("Survey, Piracy, Tanker");
    for (let seed = 1; seed <= 10; seed++) {
      for (const hand of dealMissionOffers(
        Array.from({ length: 6 }, (_, i) => ({ id: `p${i}` })),
        new Rng(seed)
      ).values()) {
        const kinds = hand.filter((m) => !isPrimaryType(m.type)).map((m) => m.type);
        expect(kinds).toHaveLength(3);
        for (const kind of kinds) expect(["survey", "piracy", "tanker"]).toContain(kind);
      }
    }
  });
});
