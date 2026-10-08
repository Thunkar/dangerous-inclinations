/**
 * Piracy and the hold (RULES §Missions): the hold has no limit, and a pirate
 * takes one item of its choice per free Piracy card with a `seize` action, at
 * its place in the sequence, while it shares a sector with an undocked ship
 * carrying cargo and is not moored. Nothing is taken unless named.
 */
import { describe, it, expect } from "vitest";
import type { GameState } from "../../models/game.ts";
import { FIRST_TURN } from "../../models/game.ts";
import type { Mission } from "../../models/missions.ts";
import { dataAboard } from "../../models/missions.ts";
import { STATION_RING } from "../../models/gravityWells.ts";
import { viewFor } from "../../game/view.ts";
import { positionOf } from "../../game/geometry.ts";
import { seizableItems, seizableItemsNow } from "../../game/piracy.ts";
import {
  ALPHA,
  BETA,
  GAMMA,
  at,
  burn,
  coast,
  deliverMission,
  eventsOf,
  executeTurnAs,
  expectRefused,
  expectRefusedUnless,
  fire,
  getPlayer,
  getShip,
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
const PIRACY_2 = piracyMission("piracy-2");

/** p1 and p2 in the same sector (LANDING) when p1's turn begins. */
const together = (pirate: Mission[], victim: Mission[]): GameState =>
  withShip(alongside(pirate, victim), "p1", LANDING);

/** Whether `playerId` has the item aboard. */
const holds = (state: GameState, playerId: string, cargoId: string): boolean =>
  getPlayer(state, playerId).cargo.some((c) => c.id === cargoId && c.isPickedUp);

describe("piracy: the hold has no limit", () => {
  it("a pirate with a crate of its own aboard seizes", () => {
    const ours = deliverMission(BETA, GAMMA, "deliver-ours");
    let state = alongside([PIRACY, ours], [CRATE]);
    state = withPlayer(state, "p1", {
      cargo: cratesAboard(getPlayer(state, "p1").cargo),
    });
    const result = executeTurnAs(state, coast(1), seize(2, "p2", CRATE.cargoId));
    expect(eventsOf(result.events, "cargo_seized")).toHaveLength(1);
  });
});

describe("piracy: the pirate names the item", () => {
  it.each([
    ["named", true],
    ["nothing named", false],
  ])("%s: a seizure happens only when named", (_label, named) => {
    const state = alongside([PIRACY], [CRATE]);
    const actions = named ? [coast(1), seize(2, "p2", CRATE.cargoId)] : [coast(1)];
    const result = executeTurnAs(state, ...actions);
    expect(eventsOf(result.events, "cargo_seized")).toHaveLength(named ? 1 : 0);
    expect(holds(result.gameState, "p2", CRATE.cargoId)).toBe(!named);
  });

  it("takes the item named: the data over the crate", () => {
    const result = executeTurnAs(
      alongside([PIRACY], [CRATE, SURVEY]),
      coast(1),
      seize(2, "p2", SURVEY.dataCargoId)
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
    const result = executeTurnAs(state, coast(1), seize(2, "p2", theirs.cargoId));
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
    const result = executeTurnAs(state, coast(1), seize(2, "p2", CRATE.cargoId));
    expect(getPlayer(result.gameState, "p1").cargo).toEqual([
      expect.objectContaining({ id: PIRACY.cargoId, isPickedUp: true }),
    ]);
  });

  it.each([
    ["a berth is no place to change hands", 0, false],
    ["a sector along from it, it is", 1, true],
  ])("%s", (_label, sector, seized) => {
    // The pirate coasts into the victim's sector; Alpha's station starts on
    // sector 0, and a moored ship neither loses an item nor takes one.
    const state = alongside([PIRACY], [CRATE], at(STATION_RING, sector, ALPHA));
    const accepted = executeTurnAs(state, coast(1));
    const result = executeTurnAs(state, coast(1), seize(2, "p2", CRATE.cargoId));
    if (seized) expect(eventsOf(result.events, "cargo_seized")).toHaveLength(1);
    else expectRefusedUnless(result, accepted);
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
    const result = executeTurnAs(before, coast(1), seize(2, "p2", cargoId));
    expect(undone(result.gameState)).toBe(true);
    expect(getPlayer(result.gameState, "p2").missions.every((m) => !m.isCompleted)).toBe(true);
  });

  it("two Piracy cards take two different items off one ship, a card each", () => {
    const state = alongside([PIRACY, PIRACY_2], [CRATE, SURVEY]);
    const result = executeTurnAs(
      state,
      coast(1),
      seize(2, "p2", CRATE.cargoId),
      seize(3, "p2", SURVEY.dataCargoId)
    );
    expect(eventsOf(result.events, "cargo_seized").map((e) => e.cargoId)).toEqual([
      CRATE.cargoId,
      SURVEY.dataCargoId,
    ]);
    expect(getPlayer(result.gameState, "p2").cargo.every((c) => !c.isPickedUp)).toBe(true);
    expect(
      getPlayer(result.gameState, "p1")
        .cargo.filter((c) => c.isPickedUp)
        .map((c) => c.id)
    ).toEqual([PIRACY.cargoId, PIRACY_2.cargoId]);
  });

  it.each([
    ["no loot aboard takes an item", false],
    ["its loot aboard and unsold takes nothing: the seizure is refused", true],
  ])("a Piracy card with %s", (_label, looted) => {
    let state = alongside([PIRACY], [CRATE]);
    if (looted) state = withPlayer(state, "p1", { cargo: [lootOf(PIRACY)] });
    const result = executeTurnAs(state, coast(1), seize(2, "p2", CRATE.cargoId));
    if (looted) expectRefusedUnless(result, executeTurnAs(state, coast(1)));
    else expect(eventsOf(result.events, "cargo_seized")).toHaveLength(1);
  });

  it.each<[string, (s: GameState) => GameState, number]>([
    ["an unknown victim", (s) => s, 0],
    ["the victim moved on", (s) => withShip(s, "p2", { sector: 9 }), 1],
    ["the victim is a ring away", (s) => withShip(s, "p2", { ring: 4 }), 1],
    [
      "an item not aboard",
      (s) =>
        withPlayer(s, "p2", {
          cargo: getPlayer(s, "p2").cargo.map((c) => ({ ...c, isPickedUp: false })),
        }),
      1,
    ],
    [
      "a ship just back from Home, which nobody can touch",
      (s) => withPlayer(s, "p2", { recovering: true }),
      1,
    ],
  ])("refuses a seizure from %s", (_label, patch, named) => {
    const state = patch(alongside([PIRACY], [CRATE]));
    const victim = named ? "p2" : "p9";
    expectRefusedUnless(
      executeTurnAs(state, coast(1), seize(2, victim, CRATE.cargoId)),
      executeTurnAs(state, coast(1))
    );
  });

  it.each<[string, (s: GameState) => ReturnType<typeof executeTurnAs>]>([
    ["your own ship", (s) => executeTurnAs(s, coast(1), seize(2, "p1", CRATE.cargoId))],
    [
      "more seizures than Piracy cards",
      (s) =>
        executeTurnAs(
          s,
          coast(1),
          seize(2, "p2", CRATE.cargoId),
          seize(3, "p2", SURVEY.dataCargoId)
        ),
    ],
    [
      "the same item twice",
      (s) =>
        executeTurnAs(
          withMissions(s, "p1", [PIRACY, PIRACY_2]),
          coast(1),
          seize(2, "p2", CRATE.cargoId),
          seize(3, "p2", CRATE.cargoId)
        ),
    ],
    [
      "no sequence",
      (s) => executeTurnAs(s, coast(1), { ...seize(2, "p2", CRATE.cargoId), sequence: undefined }),
    ],
  ])("refuses a turn naming %s", (_label, run) => {
    const state = alongside([PIRACY], [CRATE, SURVEY]);
    expectRefusedUnless(run(state), executeTurnAs(state, coast(1), seize(2, "p2", CRATE.cargoId)));
  });

  it.each<[string, Mission[], number]>([
    ["a free Piracy card", [PIRACY], 2],
    ["no Piracy card", [], 0],
  ])("seizableItems with %s lists %i items in the victim's sector", (_label, hand, expected) => {
    const state = alongside(hand, [CRATE, SURVEY]);
    const items = seizableItems(viewFor(state, "p1"), "p1", LANDING);
    expect(items).toHaveLength(expected);
    expect(seizableItems(viewFor(state, "p1"), "p1", { ...LANDING, sector: 9 })).toEqual([]);
  });
});

describe("piracy: a seizure happens where it comes in the sequence", () => {
  type Order = "seize, fire" | "fire, seize";
  // The pirate starts in the victim's sector; the default side-0 laser hits
  // for 2 at point blank on the table's pinned roll.
  it.each<[string, number, Order, { seized: boolean; destroyed: boolean; skipped: boolean }]>([
    [
      "seize then a killing shot: the item is kept",
      1,
      "seize, fire",
      { seized: true, destroyed: true, skipped: false },
    ],
    [
      "a killing shot then seize: the cargo went down with the ship",
      1,
      "fire, seize",
      { seized: false, destroyed: true, skipped: true },
    ],
    [
      "a shot that does not kill, then seize: the item is still there",
      10,
      "fire, seize",
      { seized: true, destroyed: false, skipped: false },
    ],
    [
      "seize then a shot that does not kill",
      10,
      "seize, fire",
      { seized: true, destroyed: false, skipped: false },
    ],
  ])("%s", (_label, hull, order, expected) => {
    const state = withShip(together([PIRACY], [CRATE]), "p2", { hitPoints: hull });
    const shot = (n: number) => fire(n, "side-0", "p2");
    const take = (n: number) => seize(n, "p2", CRATE.cargoId);
    const result =
      order === "seize, fire"
        ? executeTurnAs(state, take(1), shot(2), coast(3))
        : executeTurnAs(state, shot(1), take(2), coast(3));
    expect(result.errors).toBeUndefined();
    expect({
      seized: eventsOf(result.events, "cargo_seized").length === 1,
      destroyed: eventsOf(result.events, "ship_destroyed").length === 1,
      skipped: eventsOf(result.events, "action_skipped").some(
        (e) => e.action === "seize" && e.targetId === "p2"
      ),
    }).toEqual(expected);
    expect(holds(result.gameState, "p1", PIRACY.cargoId)).toBe(expected.seized);
  });

  it("seize, then move away: the item is kept", () => {
    const result = executeTurnAs(
      together([PIRACY], [CRATE]),
      seize(1, "p2", CRATE.cargoId),
      coast(2)
    );
    expect(result.errors).toBeUndefined();
    expect(positionOf(getShip(result.gameState, "p1"))).not.toEqual(LANDING);
    expect(holds(result.gameState, "p1", PIRACY.cargoId)).toBe(true);
    expect(holds(result.gameState, "p2", CRATE.cargoId)).toBe(false);
  });

  it("move away, then seize: the victim is no longer in the sector, and the turn is refused", () => {
    const state = together([PIRACY], [CRATE]);
    expectRefusedUnless(
      executeTurnAs(state, coast(1), seize(2, "p2", CRATE.cargoId)),
      executeTurnAs(state, seize(1, "p2", CRATE.cargoId), coast(2))
    );
  });

  // p1 moored at Alpha's station (ring 2, sector 0). A soft burn casts off;
  // the victim waits where it lands, or on the berth beside the pirate.
  it.each<[string, "berth" | "landing", "before" | "after", boolean]>([
    ["moored, before casting off: refused", "berth", "before", false],
    ["after burning off the berth, on the victim's sector: taken", "landing", "after", true],
  ])("%s", (_label, where, when, allowed) => {
    const berth = at(STATION_RING, 0, ALPHA);
    let state = withShip(alongside([PIRACY], [CRATE]), "p1", berth);
    const landing = positionOf(getShip(executeTurnAs(state, burn(1, "soft")).gameState, "p1"));
    state = withShip(state, "p2", where === "berth" ? berth : landing);
    const result =
      when === "before"
        ? executeTurnAs(state, seize(1, "p2", CRATE.cargoId), burn(2, "soft"))
        : executeTurnAs(state, burn(1, "soft"), seize(2, "p2", CRATE.cargoId));
    if (allowed) expect(eventsOf(result.events, "cargo_seized")).toHaveLength(1);
    else expectRefusedUnless(result, executeTurnAs(state, burn(1, "soft")));
  });

  it.each<[string, (s: GameState) => GameState]>([
    ["the opening round", (s) => ({ ...s, turn: FIRST_TURN })],
    [
      "the pirate's own first turn back from Home",
      (s) => withPlayer(s, "p1", { recovering: true }),
    ],
  ])("a quiet turn refuses a seizure, as it refuses a shot and a scan: %s", (_label, quiet) => {
    const state = quiet(together([PIRACY], [CRATE]));
    const refused = executeTurnAs(state, seize(1, "p2", CRATE.cargoId), coast(2));
    expectRefused(refused, state);
    // The same turn on a live round takes the item.
    expectRefusedUnless(
      refused,
      executeTurnAs(together([PIRACY], [CRATE]), seize(1, "p2", CRATE.cargoId), coast(2))
    );
    // Nothing offers the seizure either: the seat's list and the referee's are empty.
    expect(seizableItems(viewFor(state, "p1"), "p1", positionOf(getShip(state, "p1")))).toEqual([]);
    expect(seizableItemsNow(state, "p1", positionOf(getShip(state, "p1")))).toEqual([]);
  });

  it("a seizure puts no energy on any subsystem", () => {
    const result = executeTurnAs(
      together([PIRACY], [CRATE]),
      seize(1, "p2", CRATE.cargoId),
      coast(2)
    );
    expect(getShip(result.gameState, "p1").subsystems.every((s) => s.allocatedEnergy === 0)).toBe(
      true
    );
  });
});
