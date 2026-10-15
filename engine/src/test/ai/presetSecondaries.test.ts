/**
 * The printed loadout cards say which secondaries each preset is kept with:
 * the kit table read backwards, so a card always matches the hull the bots
 * would fly for that hand.
 */
import { describe, it, expect } from "vitest";
import type { SecondaryKind } from "../../models/missions.ts";
import type { BotPresetId } from "../../ai/index.ts";
import { PRESETS_BY_ROLE, presetSecondaries } from "../../ai/index.ts";

describe("presetSecondaries", () => {
  it.each<[BotPresetId, SecondaryKind[]]>([
    ["gunship", []],
    ["lancer", ["piracy"]],
    ["corsair", ["salvage"]],
    ["warden", ["escort"]],
    ["raider", []],
    ["watcher", ["survey"]],
    ["picket", ["salvage"]],
    ["sentry", ["escort"]],
    ["freighter", []],
    ["convoy", ["piracy", "escort"]],
    ["smuggler", ["salvage"]],
    ["ghost", ["tanker"]],
  ])("%s is kept with %j", (id, kinds) => {
    expect(presetSecondaries(id)).toEqual(kinds);
  });

  it.each(Object.entries(PRESETS_BY_ROLE))("the %s default is kept with any secondary", (_, ids) => {
    expect(presetSecondaries(ids[0])).toEqual([]);
  });
});
