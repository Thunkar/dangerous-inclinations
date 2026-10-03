/**
 * The simulator's tile and hull channels: what `--tiles=`, `--loadouts=`,
 * `--seats=` and `--hands=` parse to, and what they refuse.
 */
import { describe, it, expect } from "vitest";
import { SUBSYSTEM_CONFIGS } from "../../models/subsystems.ts";
import {
  applyTileOverrides,
  describeTileOverrides,
  parseTileOverrides,
  type TileOverrides,
} from "../../sim/tileOverrides.ts";
import {
  describeLoadoutOverrides,
  describeSeatHands,
  describeSeatLoadouts,
  parseLoadoutOverrides,
  parseSeatHands,
  parseSeatLoadouts,
} from "../../sim/loadoutOverrides.ts";

describe("parseTileOverrides", () => {
  it.each<[string, string, TileOverrides]>([
    ["a weapon's damage", "laser.damage=3", { laser: { damage: 3 } }],
    ["a weapon flag", "laser.ignoresShields=false", { laser: { ignoresShields: false } }],
    ["a slot group", "fuel_compressor.slotType=side", { fuel_compressor: { slotType: "side" } }],
    ["a passive effect", "radiator.dissipationBonus=3", { radiator: { dissipationBonus: 3 } }],
    ["a tile's cubes", "shields.energyStep=1", { shields: { energyStep: 1 } }],
    [
      "two tiles at once",
      "ballistic_rack.damage=3,shields.maxEnergy=6",
      { ballistic_rack: { damage: 3 }, shields: { maxEnergy: 6 } },
    ],
  ])("parses %s", (_label, text, expected) => {
    expect(parseTileOverrides(text)).toEqual(expected);
    // What the pages stamp reads back as the same overrides.
    expect(parseTileOverrides(describeTileOverrides(expected))).toEqual(expected);
  });

  it.each([
    ["an unknown tile", "phaser.damage=3"],
    ["an unknown field", "laser.colour=3"],
    ["no field", "laser=3"],
    ["no value", "laser.damage"],
  ])("refuses %s", (_label, text) => {
    expect(() => parseTileOverrides(text)).toThrow();
  });

  it("reaches every firing stat any weapon carries, so no second channel is needed", () => {
    const fields = new Set(
      Object.values(SUBSYSTEM_CONFIGS).flatMap((c) => Object.keys(c.weaponStats ?? {}))
    );
    expect(fields.size).toBeGreaterThan(0);
    for (const field of fields) {
      expect(() => parseTileOverrides(`laser.${field}=1`), field).not.toThrow();
    }
  });

  it("applies a firing stat to the configuration the games read", () => {
    const before = SUBSYSTEM_CONFIGS.laser.weaponStats!.damage;
    try {
      applyTileOverrides(parseTileOverrides(`laser.damage=${before + 1}`));
      expect(SUBSYSTEM_CONFIGS.laser.weaponStats!.damage).toBe(before + 1);
    } finally {
      SUBSYSTEM_CONFIGS.laser.weaponStats!.damage = before;
    }
  });
});

const HUNTER = "railgun/laser,ballistic_rack,shields,radiator";
const HUNTER_LOADOUT = {
  forwardSlots: ["railgun"],
  sideSlots: ["laser", "ballistic_rack", "shields", "radiator"],
};
const HAULER = "fuel_compressor/shields,shields,radiator,laser";
const HAULER_LOADOUT = {
  forwardSlots: ["fuel_compressor"],
  sideSlots: ["shields", "shields", "radiator", "laser"],
};

describe("parseLoadoutOverrides", () => {
  it.each([
    ["one preset", `gunship=${HUNTER}`, { gunship: HUNTER_LOADOUT }],
    [
      "two presets, ; between",
      `gunship=${HUNTER};freighter=${HAULER}`,
      { gunship: HUNTER_LOADOUT, freighter: HAULER_LOADOUT },
    ],
  ])("parses %s", (_label, text, expected) => {
    expect(parseLoadoutOverrides(text)).toEqual(expected);
    expect(parseLoadoutOverrides(describeLoadoutOverrides(parseLoadoutOverrides(text)))).toEqual(
      expected
    );
  });

  it.each([
    ["an unknown preset", `gunboat=${HUNTER}`],
    ["a role for a preset", `hunter=${HUNTER}`],
    ["the hauler role for a preset", `hauler=${HAULER}`],
    ["no preset", HUNTER],
    ["three side tiles", "gunship=railgun/laser,shields,radiator"],
    ["no forward tile", "gunship=/laser,ballistic_rack,shields,radiator"],
  ])("refuses %s", (_label, text) => {
    expect(() => parseLoadoutOverrides(text)).toThrow();
  });
});

describe("parseSeatLoadouts", () => {
  it.each([
    ["one seat", `bot-1=${HUNTER}`, { "bot-1": HUNTER_LOADOUT }],
    [
      "two seats",
      `bot-1=${HUNTER};bot-3=${HAULER}`,
      { "bot-1": HUNTER_LOADOUT, "bot-3": HAULER_LOADOUT },
    ],
  ])("parses %s", (_label, text, expected) => {
    expect(parseSeatLoadouts(text)).toEqual(expected);
    expect(parseSeatLoadouts(describeSeatLoadouts(parseSeatLoadouts(text)))).toEqual(expected);
  });

  it.each([
    ["no seat", HUNTER],
    ["five side tiles", "bot-1=railgun/laser,laser,laser,laser,laser"],
  ])("refuses %s", (_label, text) => {
    expect(() => parseSeatLoadouts(text)).toThrow();
  });
});

describe("parseSeatHands", () => {
  it.each([
    ["a short name", "bot-1=destroy", { "bot-1": "destroy_ship" }],
    ["a card's own type", "bot-2=intercept_transmission", { "bot-2": "intercept_transmission" }],
    [
      "two seats",
      "bot-1=deliver,bot-3=intercept",
      { "bot-1": "deliver_cargo", "bot-3": "intercept_transmission" },
    ],
  ])("parses %s", (_label, text, expected) => {
    expect(parseSeatHands(text)).toEqual(expected);
    expect(parseSeatHands(describeSeatHands(parseSeatHands(text)))).toEqual(expected);
  });

  it.each([
    ["a secondary", "bot-1=survey"],
    ["no card", "bot-1"],
    ["no seat", "=destroy"],
  ])("refuses %s: only a primary is dealt", (_label, text) => {
    expect(() => parseSeatHands(text)).toThrow();
  });
});
