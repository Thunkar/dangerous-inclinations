/**
 * Piracy and the hold (RULES §Missions): the hold has no limit, and a pirate
 * takes one item of its choice per free Piracy card, named with a `seize`
 * action. Nothing is taken unless named.
 */
import { describe, it, expect } from "vitest";
import type { GameState } from "../../models/game.ts";
import type { Mission } from "../../models/missions.ts";
import { dataAboard } from "../../models/missions.ts";
import { STATION_RING } from "../../models/gravityWells.ts";
import { viewFor } from "../../game/view.ts";
import { seizableItems } from "../../game/piracy.ts";
import {
  ALPHA,
  BETA,
  GAMMA,
  at,
  coast,
  deliverMission,
  eventsOf,
  executeTurnAs,
  expectRefusedUnless,
  fire,
  getPlayer,
  interceptMission,
  piracyMission,
  seize,
  surveyMission,
  withMissions,
  withPlayer,
  withShip,
  LANDING,
  alongside,
  cratesAboard,
  lootOf,
  shortOfStation,
} from "../testUtils.ts";

const CRATE = deliverMission(ALPHA, BETA, "deliver-p2");
const SURVEY = surveyMission("survey-p2");
const INTERCEPT = interceptMission("p1", "intercept-p2", BETA);
const PIRACY = piracyMission();

describe("piracy: the hold has no limit", () => {
  it("a pirate with a crate of its own aboard seizes", () => {
    const ours = deliverMission(BETA, GAMMA, "deliver-ours");
    let state = alongside([PIRACY, ours], [CRATE]);
    state = withPlayer(state, "p1", {
      cargo: cratesAboard(getPlayer(state, "p1").cargo),
    });
    const result = executeTurnAs(state, coast(1), seize("p2", CRATE.cargoId));
    expect(eventsOf(result.events, "cargo_seized")).toHaveLength(1);
  });
});

describe("piracy: the pirate names the item", () => {
  it.each([
    ["named", true],
    ["nothing named", false],
  ])("%s: a seizure happens only when named", (_label, named) => {
    const state = alongside([PIRACY], [CRATE]);
    const actions = named ? [coast(1), seize("p2", CRATE.cargoId)] : [coast(1)];
    const result = executeTurnAs(state, ...actions);
    expect(eventsOf(result.events, "cargo_seized")).toHaveLength(named ? 1 : 0);
    expect(
      getPlayer(result.gameState, "p2").cargo.some((c) => c.id === CRATE.cargoId && c.isPickedUp)
    ).toBe(!named);
  });

  it("takes the item named: the data over the crate", () => {
    const result = executeTurnAs(
      alongside([PIRACY], [CRATE, SURVEY]),
      coast(1),
      seize("p2", SURVEY.dataCargoId)
    );
    expect(eventsOf(result.events, "cargo_seized")).toEqual([
      expect.objectContaining({
        pirateId: "p1",
        victimId: "p2",
        kind: "data",
        cargoId: SURVEY.dataCargoId,
        at: LANDING,
      }),
    ]);
    const victim = getPlayer(result.gameState, "p2");
    expect(victim.cargo.find((c) => c.id === CRATE.cargoId)?.isPickedUp).toBe(true);
    expect(dataAboard(victim, SURVEY)).toBe(false);
    expect(getPlayer(result.gameState, "p1").cargo).toEqual([
      expect.objectContaining({
        id: PIRACY.cargoId,
        kind: "crate",
        deliveryPlanetId: "any",
        isPickedUp: true,
      }),
    ]);
    // Nothing is scored by the seizure itself: the loot has to be sold.
    expect(getPlayer(result.gameState, "p1").points).toBe(0);
  });

  it("takes from a fellow pirate too, who has to go and seize another", () => {
    const theirs = piracyMission("piracy-theirs");
    let state = alongside([PIRACY], []);
    state = withPlayer(state, "p2", {
      missions: [theirs],
      cargo: [lootOf(theirs)],
    });
    const result = executeTurnAs(state, coast(1), seize("p2", theirs.cargoId));
    expect(eventsOf(result.events, "cargo_seized")[0]).toMatchObject({ cargoId: theirs.cargoId });
    expect(getPlayer(result.gameState, "p1").cargo).toEqual([
      expect.objectContaining({ id: PIRACY.cargoId, isPickedUp: true }),
    ]);
    expect(getPlayer(result.gameState, "p2").cargo).toEqual([
      expect.objectContaining({ id: theirs.cargoId, isPickedUp: false }),
    ]);
  });

  it("puts loot seized, lost and seized again back aboard rather than twice", () => {
    // The loot from a previous seizure, dropped when the pirate was destroyed.
    const state = withPlayer(alongside([PIRACY], [CRATE]), "p1", {
      cargo: [{ ...lootOf(PIRACY), isPickedUp: false }],
    });
    const result = executeTurnAs(state, coast(1), seize("p2", CRATE.cargoId));
    expect(getPlayer(result.gameState, "p1").cargo).toEqual([
      expect.objectContaining({ id: PIRACY.cargoId, isPickedUp: true }),
    ]);
  });

  it.each([
    ["a berth is no place to change hands", 0, false],
    ["a sector along from it, it is", 1, true],
  ])("%s", (_label, sector, seized) => {
    // Both ships end the turn in the same sector; Alpha's station starts on
    // sector 0, and a moored ship neither loses an item nor takes one.
    const state = alongside([PIRACY], [CRATE], at(STATION_RING, sector, ALPHA));
    const result = executeTurnAs(state, coast(1), seize("p2", CRATE.cargoId));
    expect(eventsOf(result.events, "cargo_seized")).toHaveLength(seized ? 1 : 0);
  });

  it("sells the loot at any station, which is the whole card", () => {
    let state = withPlayer(alongside([PIRACY], []), "p1", {
      cargo: [lootOf(PIRACY)],
    });
    state = shortOfStation(state, "p1", ALPHA);
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "cargo_delivered")[0]).toMatchObject({
      cargoId: PIRACY.cargoId,
      kind: "crate",
      planetId: ALPHA,
    });
    expect(eventsOf(result.events, "mission_completed")[0].mission.type).toBe("piracy");
    expect(getPlayer(result.gameState, "p1").points).toBe(1);
  });

  it.each<[string, Mission, (s: GameState) => boolean]>([
    [
      "an Intercept's transmission, scanned for again",
      INTERCEPT,
      (s) => !dataAboard(getPlayer(s, "p2"), INTERCEPT),
    ],
    [
      "a Deliver crate, back on its dock",
      CRATE,
      (s) =>
        getPlayer(s, "p2").cargo.some(
          (c) => c.id === CRATE.cargoId && !c.isPickedUp && c.pickupPlanetId === ALPHA
        ),
    ],
  ])("the victim's card goes back to undone: %s", (_label, card, undone) => {
    const cargoId = card.type === "deliver_cargo" ? card.cargoId : INTERCEPT.dataCargoId;
    const before = alongside([PIRACY], [card]);
    expect(undone(before)).toBe(false);
    const result = executeTurnAs(before, coast(1), seize("p2", cargoId));
    expect(undone(result.gameState)).toBe(true);
    expect(getPlayer(result.gameState, "p2").missions.every((m) => !m.isCompleted)).toBe(true);
  });

  it.each([
    ["the victim moved on", (s: GameState) => withShip(s, "p2", { sector: 9 })],
    ["the victim is a ring away", (s: GameState) => withShip(s, "p2", { ring: 4 })],
    [
      "the item is not aboard",
      (s: GameState) =>
        withPlayer(s, "p2", {
          cargo: getPlayer(s, "p2").cargo.map((c) => ({ ...c, isPickedUp: false })),
        }),
    ],
  ])("an item not there at the end of the turn is passed over: %s", (_label, patch) => {
    const result = executeTurnAs(
      patch(alongside([PIRACY], [CRATE])),
      coast(1),
      seize("p2", CRATE.cargoId)
    );
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "cargo_seized")).toHaveLength(0);
  });

  it("a victim shot down this turn drops the item, and the seizure is passed over", () => {
    const state = withShip(alongside([PIRACY], [CRATE]), "p2", { hitPoints: 1 });
    const result = executeTurnAs(
      state,
      coast(1),
      fire(2, "side-0", "p2"),
      seize("p2", CRATE.cargoId)
    );
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "ship_destroyed")).toHaveLength(1);
    expect(eventsOf(result.events, "cargo_seized")).toHaveLength(0);
  });

  it("a name passed over leaves the card for the next name", () => {
    const state = alongside([PIRACY, piracyMission("piracy-2")], [CRATE, SURVEY]);
    const result = executeTurnAs(
      state,
      coast(1),
      seize("p2", "no-such-item"),
      seize("p2", SURVEY.dataCargoId)
    );
    expect(eventsOf(result.events, "cargo_seized").map((e) => e.cargoId)).toEqual([
      SURVEY.dataCargoId,
    ]);
    // The first card in hand took it.
    expect(
      getPlayer(result.gameState, "p1")
        .cargo.filter((c) => c.isPickedUp)
        .map((c) => c.id)
    ).toEqual([PIRACY.cargoId]);
  });

  it("two Piracy cards take two items off one ship", () => {
    const state = alongside([PIRACY, piracyMission("piracy-2")], [CRATE, SURVEY]);
    const result = executeTurnAs(
      state,
      coast(1),
      seize("p2", CRATE.cargoId),
      seize("p2", SURVEY.dataCargoId)
    );
    expect(eventsOf(result.events, "cargo_seized").map((e) => e.cargoId)).toEqual([
      CRATE.cargoId,
      SURVEY.dataCargoId,
    ]);
    expect(getPlayer(result.gameState, "p2").cargo.every((c) => !c.isPickedUp)).toBe(true);
  });

  it.each([
    ["no loot aboard", false, 1],
    ["its loot aboard and unsold", true, 0],
  ])("a Piracy card with %s takes %i", (_label, looted, expected) => {
    let state = alongside([PIRACY], [CRATE]);
    if (looted) state = withPlayer(state, "p1", { cargo: [lootOf(PIRACY)] });
    const result = executeTurnAs(state, coast(1), seize("p2", CRATE.cargoId));
    expect(eventsOf(result.events, "cargo_seized")).toHaveLength(expected);
  });

  it.each<[string, (s: GameState) => ReturnType<typeof executeTurnAs>]>([
    ["an unknown victim", (s) => executeTurnAs(s, coast(1), seize("p9", CRATE.cargoId))],
    ["your own ship", (s) => executeTurnAs(s, coast(1), seize("p1", CRATE.cargoId))],
    [
      "more seizures than Piracy cards",
      (s) =>
        executeTurnAs(s, coast(1), seize("p2", CRATE.cargoId), seize("p2", SURVEY.dataCargoId)),
    ],
    [
      "the same item twice",
      (s) =>
        executeTurnAs(
          withMissions(s, "p1", [PIRACY, piracyMission("piracy-2")]),
          coast(1),
          seize("p2", CRATE.cargoId),
          seize("p2", CRATE.cargoId)
        ),
    ],
  ])("refuses a seizure naming %s", (_label, run) => {
    const state = alongside([PIRACY], [CRATE, SURVEY]);
    expectRefusedUnless(run(state), executeTurnAs(state, coast(1), seize("p2", CRATE.cargoId)));
  });

  it.each<[string, Mission[], number]>([
    ["a free Piracy card", [PIRACY], 2],
    ["no Piracy card", [], 0],
  ])("seizableItems with %s lists %i items where the turn ends", (_label, hand, expected) => {
    const state = alongside(hand, [CRATE, SURVEY]);
    const items = seizableItems(viewFor(state, "p1"), "p1", LANDING);
    expect(items).toHaveLength(expected);
    expect(seizableItems(viewFor(state, "p1"), "p1", { ...LANDING, sector: 9 })).toEqual([]);
  });
});
