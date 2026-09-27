/**
 * The bots under the unlimited-hold experiment (`HOLD_RULES.unlimited`): a
 * pirate names the item that costs its victim most, and Deliver with Piracy
 * is a hand like any other.
 */
import { describe, it, expect, afterEach } from "vitest";
import type { GameState } from "../../models/game.ts";
import type { Cargo, Mission } from "../../models/missions.ts";
import { HOLD_RULES } from "../../models/missions.ts";
import { ringVelocity, wrapSector } from "../../game/geometry.ts";
import { viewFor } from "../../game/view.ts";
import { executeTurn } from "../../game/turns.ts";
import { botChooseLoadout, botDecideActions } from "../../ai/index.ts";
import { seizeChoices } from "../../ai/behaviors/piracy.ts";
import {
  ALPHA,
  BETA,
  BH,
  deliverMission,
  escortMission,
  eventsOf,
  getPlayer,
  lootCargo,
  makeGameState,
  makePlayer,
  piracyMission,
  surveyMission,
  takenData,
  tankerMission,
  withPlayer,
} from "../testUtils.ts";

const AT = { wellId: BH, ring: 3, sector: 4 };
const PIRACY = piracyMission();
const CRATE = deliverMission(ALPHA, BETA, "deliver-p2");
const CRATE_ABOARD: Cargo = {
  id: CRATE.cargoId,
  missionId: CRATE.id,
  kind: "crate",
  pickupPlanetId: ALPHA,
  deliveryPlanetId: BETA,
  isPickedUp: true,
};
const SURVEY = surveyMission("survey-p3");
const LOOT = lootCargo("loot-p3", "piracy-p3");

/**
 * p1 the pirate one coast short of `AT`; p2 and p3 sitting there with the
 * holds given.
 */
function table(pirate: Mission[], p2: Cargo[], p3: Cargo[]): GameState {
  const drift = ringVelocity(AT.wellId, AT.ring);
  let state = makeGameState([
    makePlayer("p1", { ...AT, sector: wrapSector(AT.sector - drift) }),
    makePlayer("p2", AT),
    makePlayer("p3", AT),
  ]);
  state = withPlayer(state, "p1", { missions: pirate, cargo: [] });
  state = withPlayer(state, "p2", { missions: [CRATE], cargo: p2 });
  return withPlayer(state, "p3", { missions: [SURVEY, piracyMission("piracy-p3")], cargo: p3 });
}

describe("bots and the unlimited-hold experiment", () => {
  afterEach(() => {
    HOLD_RULES.unlimited = false;
  });

  it.each<[string, Mission[], Cargo[], Cargo[], string[]]>([
    [
      "a Deliver crate over loot and data",
      [PIRACY],
      [CRATE_ABOARD],
      [takenData(SURVEY), LOOT],
      [CRATE.cargoId],
    ],
    ["loot over data", [PIRACY], [], [takenData(SURVEY), LOOT], [LOOT.id]],
    ["data when that is all there is", [PIRACY], [], [takenData(SURVEY)], [SURVEY.dataCargoId]],
    [
      "two cards, the two best items",
      [PIRACY, piracyMission("piracy-2")],
      [CRATE_ABOARD],
      [takenData(SURVEY), LOOT],
      [CRATE.cargoId, LOOT.id],
    ],
    [
      "equal kinds in seat order from the pirate's left",
      [PIRACY],
      [lootCargo("loot-p2", "piracy-p2")],
      [LOOT],
      ["loot-p2"],
    ],
  ])("names %s", (_label, pirate, p2, p3, expected) => {
    HOLD_RULES.unlimited = true;
    const state = table(pirate, p2, p3);
    const choices = seizeChoices(viewFor(state, "p1"), getPlayer(state, "p1"), AT);
    expect(choices.map((c) => c.cargoId)).toEqual(expected);
  });

  it("names nothing with the experiment off", () => {
    const state = table([PIRACY], [CRATE_ABOARD], [LOOT]);
    expect(seizeChoices(viewFor(state, "p1"), getPlayer(state, "p1"), AT)).toEqual([]);
  });

  it.each([
    [true, 1],
    [false, 0],
  ])("switch %s: a pirate bot coasting onto a carrier takes %i item", (on, expected) => {
    HOLD_RULES.unlimited = on;
    const state = table([PIRACY], [CRATE_ABOARD], [takenData(SURVEY)]);
    const decision = botDecideActions(viewFor(state, "p1"));
    const seizes = decision.actions.filter((a) => a.type === "seize");
    expect(seizes).toHaveLength(expected);
    const result = executeTurn(state, decision.actions);
    expect(result.errors).toBeUndefined();
    if (on) {
      expect(eventsOf(result.events, "cargo_seized").map((e) => e.cargoId)).toEqual([
        CRATE.cargoId,
      ]);
    }
  });

  it.each([
    [true, true],
    [false, false],
  ])("switch %s: Deliver beside Piracy is kept (%s)", (on, kept) => {
    HOLD_RULES.unlimited = on;
    const offers: Mission[] = [
      deliverMission(ALPHA, BETA),
      piracyMission("clash"),
      escortMission("escort-a"),
      tankerMission("tanker-a"),
    ];
    const hands = [0, 1, 2].map((i) => botChooseLoadout(offers, { pick: (n) => i % n }).missionIds);
    expect(hands.some((ids) => ids.includes("clash"))).toBe(kept);
  });
});
