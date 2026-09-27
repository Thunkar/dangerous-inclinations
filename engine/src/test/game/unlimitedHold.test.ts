/**
 * The unlimited-hold experiment (`HOLD_RULES.unlimited`): the hold has no
 * limit, and a pirate takes one item of its choice per undone Piracy card,
 * named with a `seize` action. Every test sets the switch and puts it back.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { GameState } from "../../models/game.ts";
import type { Mission } from "../../models/missions.ts";
import { CARGO_HOLD_CRATES, HOLD_RULES, dataAboard } from "../../models/missions.ts";
import { STATION_RING } from "../../models/gravityWells.ts";
import { ringVelocity, wrapSector } from "../../game/geometry.ts";
import { viewFor } from "../../game/view.ts";
import { seizableItems } from "../../game/piracy.ts";
import {
  ALPHA,
  BETA,
  BH,
  GAMMA,
  approachSector,
  coast,
  deliverMission,
  eventsOf,
  executeTurnAs,
  expectRefusedUnless,
  fire,
  getPlayer,
  interceptMission,
  lootCargo,
  makeGameState,
  makePlayer,
  piracyMission,
  seize,
  surveyMission,
  takenData,
  withMissions,
  withPlayer,
  withShip,
} from "../testUtils.ts";

const AT = { wellId: BH, ring: 3, sector: 4 };

/**
 * p1 holds `pirate` and coasts onto p2, who holds `victim` with everything
 * those cards imply aboard. Ring 3 drifts 4.
 */
function alongside(pirate: Mission[], victim: Mission[]): GameState {
  const drift = ringVelocity(AT.wellId, AT.ring);
  let state = makeGameState([
    makePlayer("p1", { ...AT, sector: wrapSector(AT.sector - drift) }),
    makePlayer("p2", AT),
  ]);
  state = withMissions(state, "p1", pirate);
  state = withMissions(state, "p2", victim);
  const p2 = getPlayer(state, "p2");
  const data = p2.missions.flatMap((m) =>
    m.type === "survey" || m.type === "intercept_transmission" ? [takenData(m)] : []
  );
  return withPlayer(state, "p2", {
    cargo: [...p2.cargo.map((c) => ({ ...c, isPickedUp: true })), ...data],
  });
}

const CRATE = deliverMission(ALPHA, BETA, "deliver-p2");
const SURVEY = surveyMission("survey-p2");
const INTERCEPT = interceptMission("p1", "intercept-p2", BETA);
const PIRACY = piracyMission();

function withSwitch(on: boolean, run: () => void) {
  HOLD_RULES.unlimited = on;
  try {
    run();
  } finally {
    HOLD_RULES.unlimited = false;
  }
}

describe("unlimited hold: off, the rules as they stand", () => {
  it("a seize action is refused, and the same turn without it stands", () => {
    const state = alongside([PIRACY], [CRATE]);
    expectRefusedUnless(
      executeTurnAs(state, coast(1), seize("p2", CRATE.cargoId)),
      executeTurnAs(state, coast(1))
    );
  });

  it("the seizure is automatic: the crate is taken with nothing named", () => {
    const result = executeTurnAs(alongside([PIRACY], [CRATE, SURVEY]), coast(1));
    expect(eventsOf(result.events, "cargo_seized").map((e) => e.cargoId)).toEqual([CRATE.cargoId]);
  });

  it("the view lists no items", () => {
    const view = viewFor(alongside([PIRACY], [CRATE]), "p1");
    expect(view.players.every((p) => p.hold.length === 0)).toBe(true);
  });
});

describe("unlimited hold: on against off", () => {
  it.each([
    [true, 2],
    [false, CARGO_HOLD_CRATES],
  ])("switch %s: a crate loads with another crate aboard (%i aboard after)", (on, expected) => {
    withSwitch(on, () => {
      const base = makeGameState([makePlayer("p1"), makePlayer("p2", { ...AT, ring: 5 })]);
      let state = makeGameState([
        makePlayer("p1", {
          wellId: ALPHA,
          ring: STATION_RING,
          sector: approachSector(base, ALPHA),
        }),
        base.players[1],
      ]);
      const first = deliverMission(GAMMA, BETA, "deliver-first");
      const second = deliverMission(ALPHA, GAMMA, "deliver-second");
      state = withMissions(state, "p1", [first, second]);
      state = withPlayer(state, "p1", {
        cargo: getPlayer(state, "p1").cargo.map((c) =>
          c.missionId === first.id ? { ...c, isPickedUp: true } : c
        ),
      });
      const result = executeTurnAs(state, coast(1));
      expect(getPlayer(result.gameState, "p1").cargo.filter((c) => c.isPickedUp)).toHaveLength(
        expected
      );
    });
  });

  it.each([
    [true, 1],
    [false, 0],
  ])("switch %s: a pirate with a crate of its own aboard seizes (%i seized)", (on, expected) => {
    withSwitch(on, () => {
      const ours = deliverMission(BETA, GAMMA, "deliver-ours");
      let state = alongside([PIRACY, ours], [CRATE]);
      state = withPlayer(state, "p1", {
        cargo: getPlayer(state, "p1").cargo.map((c) => ({ ...c, isPickedUp: true })),
      });
      const actions = on ? [coast(1), seize("p2", CRATE.cargoId)] : [coast(1)];
      const result = executeTurnAs(state, ...actions);
      expect(eventsOf(result.events, "cargo_seized")).toHaveLength(expected);
    });
  });
});

describe("unlimited hold: on", () => {
  beforeEach(() => {
    HOLD_RULES.unlimited = true;
  });
  afterEach(() => {
    HOLD_RULES.unlimited = false;
  });

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
      expect.objectContaining({ victimId: "p2", kind: "data", cargoId: SURVEY.dataCargoId }),
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
    if (looted) state = withPlayer(state, "p1", { cargo: [lootCargo(PIRACY.cargoId, PIRACY.id)] });
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

  it("the view lists every item aboard with its public kind", () => {
    let state = alongside([PIRACY], [CRATE, SURVEY]);
    state = withPlayer(state, "p2", {
      cargo: [...getPlayer(state, "p2").cargo, lootCargo("loot-other", "piracy-other")],
    });
    const p2 = viewFor(state, "p1").players.find((p) => p.id === "p2")!;
    expect(p2.hold).toEqual([
      { cargoId: CRATE.cargoId, kind: "crate" },
      { cargoId: SURVEY.dataCargoId, kind: "data" },
      { cargoId: "loot-other", kind: "loot" },
    ]);
  });

  it.each<[string, Mission[], number]>([
    ["a free Piracy card", [PIRACY], 2],
    ["no Piracy card", [], 0],
  ])("seizableItems with %s lists %i items where the turn ends", (_label, hand, expected) => {
    const state = alongside(hand, [CRATE, SURVEY]);
    const items = seizableItems(viewFor(state, "p1"), "p1", AT);
    expect(items).toHaveLength(expected);
    expect(seizableItems(viewFor(state, "p1"), "p1", { ...AT, sector: 9 })).toEqual([]);
  });
});
