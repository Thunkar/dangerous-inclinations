/**
 * Loadout phase. `botChooseLoadout` keeps exactly a hand of the offered cards
 * and returns a hull the engine will accept, deterministically. That every
 * natural deal ends in a legal, flyable hand the engine accepts is the
 * bot-vs-bot games' check (`botGames.test.ts`); these are the choices.
 */
import { describe, it, expect } from "vitest";
import type { ShipLoadout } from "../../models/game.ts";
import type { Mission } from "../../models/missions.ts";
import { missionsMissingRequirements, validateLoadout } from "../../game/loadout.ts";
import { botChooseLoadout } from "../../ai/index.ts";
import type { BotPresetId } from "../../ai/behaviors/loadout.ts";
import {
  BOT_PRESET_LOADOUTS,
  PRESETS_BY_ROLE,
  classifyPreset,
  validHands,
} from "../../ai/behaviors/loadout.ts";
import {
  ALPHA,
  BETA,
  GAMMA,
  LOADOUTS,
  deliverMission,
  destroyMission,
  interceptMission,
  piracyMission,
  tankerMission,
  surveyMission,
  salvageMission,
  escortMission,
} from "../testUtils.ts";

const done = <M extends Mission>(m: M): M => ({ ...m, isCompleted: true });
const DESTROY = destroyMission("p2");
const INTERCEPT = interceptMission("p2");
const DELIVER = deliverMission(ALPHA, GAMMA);

/**
 * A hand of one primary and two secondaries, and the preset it flies. The
 * primary picks the role; a secondary asks for a preset of the role's; between two that ask for
 * different kits, Piracy > Salvage > Escort > Survey > Tanker.
 */
const HANDS: Array<[string, BotPresetId, Mission[]]> = [
  ["Destroy, Survey, Tanker", "gunship", [DESTROY, surveyMission("a"), tankerMission("b")]],
  ["Destroy, Piracy, Survey", "lancer", [DESTROY, piracyMission("a"), surveyMission("b")]],
  ["Destroy, Salvage, Tanker", "corsair", [DESTROY, salvageMission("a"), tankerMission("b")]],
  ["Destroy, Salvage, Salvage", "corsair", [DESTROY, salvageMission("a"), salvageMission("b")]],
  ["Destroy, Escort, Survey", "warden", [DESTROY, escortMission("a"), surveyMission("b")]],
  ["Intercept, Piracy, Tanker", "raider", [INTERCEPT, piracyMission("a"), tankerMission("b")]],
  ["Intercept, Survey, Tanker", "watcher", [INTERCEPT, surveyMission("a"), tankerMission("b")]],
  ["Intercept, Salvage, Tanker", "picket", [INTERCEPT, salvageMission("a"), tankerMission("b")]],
  ["Intercept, Escort, Tanker", "sentry", [INTERCEPT, escortMission("a"), tankerMission("b")]],
  ["Deliver, Survey, Survey", "freighter", [DELIVER, surveyMission("a"), surveyMission("b")]],
  ["Deliver, Piracy, Survey", "convoy", [DELIVER, piracyMission("a"), surveyMission("b")]],
  ["Deliver, Escort, Survey", "convoy", [DELIVER, escortMission("a"), surveyMission("b")]],
  ["Deliver, Salvage, Survey", "smuggler", [DELIVER, salvageMission("a"), surveyMission("b")]],
  ["Deliver, Tanker, Survey", "ghost", [DELIVER, tankerMission("a"), surveyMission("b")]],
  // Two secondaries asking for different kits: the higher card decides.
  ["Destroy, Salvage, Piracy", "lancer", [DESTROY, salvageMission("a"), piracyMission("b")]],
  ["Destroy, Escort, Piracy", "lancer", [DESTROY, escortMission("a"), piracyMission("b")]],
  ["Destroy, Escort, Salvage", "corsair", [DESTROY, escortMission("a"), salvageMission("b")]],
  ["Intercept, Escort, Salvage", "picket", [INTERCEPT, escortMission("a"), salvageMission("b")]],
  ["Intercept, Survey, Salvage", "picket", [INTERCEPT, surveyMission("a"), salvageMission("b")]],
  ["Intercept, Survey, Escort", "sentry", [INTERCEPT, surveyMission("a"), escortMission("b")]],
  ["Deliver, Tanker, Piracy", "convoy", [DELIVER, tankerMission("a"), piracyMission("b")]],
  ["Deliver, Tanker, Escort", "convoy", [DELIVER, tankerMission("a"), escortMission("b")]],
  ["Deliver, Tanker, Salvage", "smuggler", [DELIVER, tankerMission("a"), salvageMission("b")]],
  ["Deliver, Escort, Salvage", "smuggler", [DELIVER, escortMission("a"), salvageMission("b")]],
  // Piracy and Escort ask for the same hull.
  ["Deliver, Piracy, Escort", "convoy", [DELIVER, piracyMission("a"), escortMission("b")]],
  // A card that asks for nothing in the role leaves the choice to the other.
  ["Intercept, Piracy, Survey", "watcher", [INTERCEPT, piracyMission("a"), surveyMission("b")]],
  ["Deliver, Survey, Tanker", "ghost", [DELIVER, surveyMission("a"), tankerMission("b")]],
  // A completed card asks for nothing.
  [
    "Destroy, a done Piracy, Survey",
    "gunship",
    [DESTROY, done(piracyMission("a")), surveyMission("b")],
  ],
  [
    "Intercept, a done Survey, Tanker",
    "raider",
    [INTERCEPT, done(surveyMission("a")), tankerMission("b")],
  ],
  [
    "Deliver, a done Piracy, Tanker",
    "ghost",
    [DELIVER, done(piracyMission("a")), tankerMission("b")],
  ],
];

describe("botChooseLoadout", () => {
  // The presets are also what a human is offered: each must pass the engine's
  // validation, carry a gun that keeps a Destroy, and an interceptor a sensor.
  it.each(Object.entries(BOT_PRESET_LOADOUTS))(
    "the %s preset is a legal hull that can fly its role's primary",
    (id, loadout) => {
      expect(validateLoadout(loadout).errors).toEqual([]);
      const primaries = PRESETS_BY_ROLE.interceptor.includes(id as BotPresetId)
        ? [DESTROY, INTERCEPT]
        : [DESTROY];
      expect(missionsMissingRequirements(primaries, loadout)).toEqual([]);
    }
  );

  it.each(HANDS)("flies %s on the %s", (_label, preset, missions) => {
    expect(classifyPreset(missions)).toBe(preset);
    expect(botChooseLoadout(missions).loadout).toEqual(BOT_PRESET_LOADOUTS[preset]);
  });

  // The bot does not score the hand: every hand the loadout could fly is
  // valid, and which one it takes is the seeded pick. Measuring which plan
  // wins is the benchmark's job, not the chooser's.
  it.each<[string, Mission[], number]>([
    [
      "three primaries and three secondaries",
      [
        destroyMission("p2"),
        interceptMission("p3"),
        interceptMission("p4", "intercept-p4"),
        surveyMission("survey-a"),
        piracyMission("piracy-a"),
        tankerMission("tanker-a"),
      ],
      9,
    ],
    // Two of a kind are two jobs (RULES §Missions): three of one kind is a hand.
    ["three Surveys", [DESTROY, surveyMission("a"), surveyMission("b"), surveyMission("c")], 3],
    // The hold has no limit, so nothing clashes with a Deliver's crate.
    [
      "a Deliver beside Piracy and Salvage",
      [DELIVER, piracyMission("a"), salvageMission("b"), tankerMission("c")],
      3,
    ],
  ])("reaches every hand of %s with the seeded pick", (_label, offers, count) => {
    const hands = validHands(offers);
    expect(hands).toHaveLength(count);
    const seen = new Set(
      hands.map((_, i) =>
        botChooseLoadout(offers, { pick: (n) => i % n })
          .missionIds.slice()
          .sort()
          .join(",")
      )
    );
    expect(seen.size).toBe(count);
  });

  // The simulator forces a hull on a seat to measure it. The bot then keeps
  // cards that hull can fly; a deal with no flyable hand leaves it its own loadout.
  it.each<[string, Mission[], ShipLoadout, boolean]>([
    // No sensor array: Intercept and Survey are dead weight, and the four
    // left are exactly a hand.
    [
      "keeps a railgun hull and drops the cards it cannot fly",
      [
        interceptMission("p2"),
        deliverMission(ALPHA, BETA),
        destroyMission("p2"),
        surveyMission("survey-a"),
        piracyMission("piracy-a"),
        tankerMission("tanker-a"),
      ],
      LOADOUTS.raider,
      true,
    ],
    // Three Intercepts and no other primary: no full hand flies without a sensor.
    [
      "gives a railgun hull up when no primary on offer suits it",
      [
        interceptMission("p2"),
        interceptMission("p3", "intercept-p3"),
        interceptMission("p4", "intercept-p4"),
        surveyMission("survey-a"),
        piracyMission("piracy-a"),
        tankerMission("tanker-a"),
      ],
      LOADOUTS.raider,
      false,
    ],
    // A disruptor deals no damage, so a Destroy is not a card it can keep.
    [
      "keeps a hull whose only gun is a disruptor, and no Destroy",
      [
        DESTROY,
        INTERCEPT,
        DELIVER,
        surveyMission(),
        piracyMission(),
        tankerMission(),
        escortMission(),
      ],
      LOADOUTS.disruptor,
      true,
    ],
  ])("%s", (_label, offers, hull, keepsHull) => {
    const choice = botChooseLoadout(offers, { hull });
    expect(choice.loadout).toEqual(keepsHull ? hull : expect.not.objectContaining(hull));
    const kept = offers.filter((m) => choice.missionIds.includes(m.id));
    expect(missionsMissingRequirements(kept, choice.loadout)).toEqual([]);
  });
});
