/**
 * A turn's actions in every order (RULES §A Turn: "Actions, in any order you
 * choose").
 *
 * Every permutation of each table in `actionOrder.scenarios.ts` is played in
 * one test per table, and every ordering must keep the invariants that need
 * no reading of the rules: the turn is deterministic, a refused turn leaves
 * the state untouched, an accepted one's heat check bills exactly the cubes
 * on the loadout and exactly what the actions reported, the tank never goes
 * below empty, and a turn that names no move coasts after everything else.
 * Each table says whether its orderings are all accepted, all refused or some
 * of each. Two properties hold across orderings: a shield or rack power goes
 * anywhere in the sequence to the same end, and a rotation added last turns
 * the ship and changes nothing else.
 *
 * What the order changes is pinned below with literal numbers.
 */
import { describe, expect, it } from "vitest";
import type { GameEvent } from "../../models/events.ts";
import type { GameState } from "../../models/game.ts";
import type { TurnResult } from "../../game/turns.ts";
import {
  ALPHA,
  BH,
  burn,
  canonicalJson,
  checkEach,
  coast,
  cubesOnLoadout,
  eventsOf,
  eventTypes,
  executeTurnAs,
  expectRefused,
  fire,
  getShip,
  jump,
  power,
  rotate,
  scan,
  withShip,
} from "../testUtils.ts";
import {
  ORDER_TABLES,
  type Draft,
  type Item,
  alphaLanding,
  belowLaneState,
  brawlerState,
  draftsOf,
  label,
  laneState,
  orderings,
  sensorState,
  stationState,
} from "./actionOrder.scenarios.ts";

/** The cubes p1's actions say they put on a tile, added up the way the check should bill them. */
function reportedCubes(events: GameEvent[], playerId = "p1"): number {
  return (
    eventsOf(events, "subsystem_powered")
      .filter((e) => e.playerId === playerId)
      .reduce((sum, e) => sum + e.amount, 0) +
    eventsOf(events, "weapon_fired")
      .filter((e) => e.attackerId === playerId)
      .reduce((sum, e) => sum + e.heat, 0) +
    eventsOf(events, "recoil")
      .filter((e) => e.playerId === playerId)
      .reduce((sum, e) => sum + e.heat, 0) +
    eventsOf(events, "burned")
      .filter((e) => e.playerId === playerId)
      .reduce((sum, e) => sum + e.heat, 0) +
    eventsOf(events, "jumped")
      .filter((e) => e.playerId === playerId)
      .reduce((sum, e) => sum + e.heat, 0) +
    eventsOf(events, "coasted")
      .filter((e) => e.playerId === playerId)
      .reduce((sum, e) => sum + e.heat, 0) +
    eventsOf(events, "scanned")
      .filter((e) => e.scannerId === playerId)
      .reduce((sum, e) => sum + e.heat, 0) +
    eventsOf(events, "rotated")
      .filter((e) => e.playerId === playerId)
      .reduce((sum, e) => sum + e.heat, 0)
  );
}

function play(state: GameState, ordering: readonly Item[]): TurnResult {
  return executeTurnAs(state, ...draftsOf(state, ordering));
}

const isMove = (item: Item) =>
  item.kind === "coast" || item.kind === "burn" || item.kind === "jump";

/** p1's cubes on every tile but the thrusters. */
const cubesBesideThrusters = (state: GameState) =>
  Object.fromEntries(
    getShip(state, "p1")
      .subsystems.filter((s) => s.id !== "rotation")
      .map((s) => [s.id, s.allocatedEnergy])
  );

describe("in every order", () => {
  it.each(ORDER_TABLES)("$name: comes out $outcome, keeping every invariant", (table) => {
    const all = orderings(table.items);
    let accepted = 0;
    checkEach(all, label, (ordering) => {
      const state = table.build();
      const result = play(state, ordering);

      // Deterministic: the same turn on the same state comes out the same.
      const again = play(table.build(), ordering);
      expect(again.errors).toEqual(result.errors);
      expect(canonicalJson(again.gameState)).toBe(canonicalJson(result.gameState));
      expect(canonicalJson(again.events)).toBe(canonicalJson(result.events));

      if (result.errors) {
        expectRefused(result, state);
        return;
      }
      accepted++;

      // The heat check bills the cubes on the loadout, and exactly what the actions reported.
      const ship = getShip(result.gameState, "p1");
      const [check] = eventsOf(result.events, "heat_check");
      expect(check.cubes).toBe(cubesOnLoadout(ship));
      expect(reportedCubes(result.events)).toBe(check.cubes);
      expect(ship.reactionMass).toBeGreaterThanOrEqual(0);

      if (!ordering.some(isMove)) {
        // A turn with no move coasts after everything else.
        const types = eventTypes(result.events);
        const lastAction = Math.max(
          ...(["subsystem_powered", "weapon_fired", "scanned", "rotated", "recoil"] as const).map(
            (t) => types.lastIndexOf(t)
          )
        );
        expect(types.indexOf("coasted")).toBeGreaterThan(lastAction);
      }
    });

    if (table.outcome === "accepted") expect(accepted).toBe(all.length);
    else if (table.outcome === "refused") expect(accepted).toBe(0);
    else {
      expect(accepted).toBeGreaterThan(0);
      expect(accepted).toBeLessThan(all.length);
    }
  });

  it("a shield or rack power ends the same wherever it goes in the sequence", () => {
    // A sensor's power is the exception: it widens only the shots after it
    // (energy.test.ts pins that), so its tables are left out.
    const tables = ORDER_TABLES.filter((table) => {
      const ship = getShip(table.build(), "p1");
      const powers = table.items.filter((i) => i.kind === "power");
      return (
        powers.length > 0 &&
        powers.every((i) => ship.subsystems.find((s) => s.id === i.tile)?.type !== "sensor_array")
      );
    });
    expect(tables.length).toBeGreaterThan(0);
    const cases = tables.flatMap((table) => orderings(table.items).map((o) => ({ table, o })));
    checkEach(
      cases,
      ({ table, o }) => `${table.name}: ${label(o)}`,
      ({ table, o }) => {
        const first = [
          ...o.filter((i) => i.kind === "power"),
          ...o.filter((i) => i.kind !== "power"),
        ];
        const anywhere = play(table.build(), o);
        const powerFirst = play(table.build(), first);
        expect(anywhere.errors === undefined).toBe(powerFirst.errors === undefined);
        expect(canonicalJson(anywhere.gameState)).toBe(canonicalJson(powerFirst.gameState));
      }
    );
  });

  it("a rotation added after every other action turns the ship and changes nothing else", () => {
    const cases = ORDER_TABLES.flatMap((table) =>
      orderings(table.items.filter((i) => i.kind !== "rotate")).map((o) => ({ table, o }))
    );
    let rotated = 0;
    checkEach(
      cases,
      ({ table, o }) => `${table.name}: ${label(o)}`,
      ({ table, o }) => {
        const base = play(table.build(), o);
        if (base.errors) return;
        const turned = play(table.build(), [...o, { kind: "rotate" }]);
        expect(turned.errors).toBeUndefined();
        rotated++;
        const [a, b] = [getShip(base.gameState, "p1"), getShip(turned.gameState, "p1")];
        expect(b.facing).not.toBe(a.facing);
        expect({ wellId: b.wellId, ring: b.ring, sector: b.sector, fuel: b.reactionMass }).toEqual({
          wellId: a.wellId,
          ring: a.ring,
          sector: a.sector,
          fuel: a.reactionMass,
        });
        expect(cubesBesideThrusters(turned.gameState)).toEqual(
          cubesBesideThrusters(base.gameState)
        );
      }
    );
    expect(rotated).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// What the order changes, pinned with literal numbers
// ---------------------------------------------------------------------------

const ok = (result: TurnResult) => result.errors === undefined;

describe("order: facing is read when the action comes up", () => {
  // p2 is two sectors ahead of p1 (prograde), p3 two astern.
  it.each<[string, boolean, Draft[]]>([
    ["railgun ahead, then rotate", true, [fire(1, "forward-0", "p2"), rotate(2, "retrograde")]],
    ["rotate, then railgun ahead", false, [rotate(1, "retrograde"), fire(2, "forward-0", "p2")]],
    ["rotate, then railgun astern", true, [rotate(1, "retrograde"), fire(2, "forward-0", "p3")]],
    ["railgun astern, then rotate", false, [fire(1, "forward-0", "p3"), rotate(2, "retrograde")]],
    // The port laser fires outward facing prograde, inward facing retrograde: p4 is outward.
    ["laser outward, then rotate", true, [fire(1, "side-0", "p4"), rotate(2, "retrograde")]],
    ["rotate, then laser outward", false, [rotate(1, "retrograde"), fire(2, "side-0", "p4")]],
  ])("%s: accepted %s", (_label, accepted, actions) => {
    const state = brawlerState();
    const result = executeTurnAs(state, ...actions);
    expect(ok(result)).toBe(accepted);
    if (!accepted) expectRefused(result, state);
  });
});

describe("order: an uncompensated railgun moves the ship on the spot", () => {
  it("a burn after the recoil drifts at the new ring's speed", () => {
    const result = executeTurnAs(brawlerState(), fire(1, "forward-0", "p2"), burn(2, "soft"));
    expect(result.errors).toBeUndefined();
    // Recoil from ring 3 to ring 2 (velocity 6): sector 6 + 6 = 12, then out to ring 3.
    expect(eventsOf(result.events, "recoil")[0].to).toEqual({ wellId: BH, ring: 2, sector: 6 });
    expect(eventsOf(result.events, "burned")[0].from).toEqual({ wellId: BH, ring: 2, sector: 6 });
    expect(getShip(result.gameState, "p1")).toMatchObject({ ring: 3, sector: 12 });
  });

  it("a burn before the shot drifts at ring 3's speed and the shot recoils from ring 4", () => {
    // Soft burn: ring 3 sector 6 drifts to 10, out to ring 4; p5 is at ring 4 sector 12.
    const result = executeTurnAs(brawlerState(), burn(1, "soft"), fire(2, "forward-0", "p5"));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1")).toMatchObject({ ring: 3, sector: 10 });
  });

  it.each<[string, boolean, Draft[]]>([
    // From ring 3 the rack reaches p4 (ring 4, one sector on); from ring 2 it does not.
    ["rack before the railgun", true, [fire(1, "side-1", "p4"), fire(2, "forward-0", "p2")]],
    ["rack after the railgun", false, [fire(1, "forward-0", "p2"), fire(2, "side-1", "p4")]],
  ])("%s: accepted %s", (_label, accepted, actions) => {
    const state = brawlerState();
    const result = executeTurnAs(state, ...actions);
    expect(ok(result)).toBe(accepted);
    if (!accepted) expectRefused(result, state);
  });

  it.each<[string, boolean, Draft[]]>([
    [
      "recoil onto the lane, rotate, jump",
      true,
      [fire(1, "forward-0", "p2"), rotate(2, "prograde"), jump(3, ALPHA)],
    ],
    ["rotate, jump, no railgun: not on the lane", false, [rotate(1, "prograde"), jump(2, ALPHA)]],
  ])("%s: accepted %s", (_label, accepted, actions) => {
    const state = belowLaneState();
    const result = executeTurnAs(state, ...actions);
    expect(ok(result)).toBe(accepted);
    if (accepted) expect(getShip(result.gameState, "p1")).toMatchObject(alphaLanding());
    else expectRefused(result, state);
  });

  it("refuses a railgun shot on the lane ring before the jump: the recoil takes the ship off the lane", () => {
    // Facing prograde the push is inward to ring 4, off the lane the jump needs.
    const state = laneState();
    expectRefused(
      executeTurnAs(state, rotate(1, "prograde"), fire(2, "forward-0", "p3"), jump(3, ALPHA)),
      state
    );
  });
});

describe("order: a missile reads the sensor when it is launched", () => {
  // forcedRollValue is 8: a hit, or a critical once a sensor has energy on it.
  it.each<[string, Draft[], "hit" | "critical"]>([
    // A missile flies and attacks the moment it is launched (RULES §Weapons,
    // Missiles), so a scan sequenced after the launch comes too late for it.
    ["salvo, then scan", [fire(1, "side-3", "p2", "engines", undefined, 1), scan(2, "p2")], "hit"],
    [
      "scan, then salvo",
      [scan(1, "p2"), fire(2, "side-3", "p2", "engines", undefined, 1)],
      "critical",
    ],
  ])("%s: a missile on the target's sector rolls its 8 as a %s", (_label, actions, result) => {
    // p2 two sectors ahead on p1's ring: the missile flies onto it at launch.
    const turn = executeTurnAs(sensorState(), ...actions);
    expect(turn.errors).toBeUndefined();
    const [hit] = eventsOf(turn.events, "attack_resolved").filter((e) => e.missileId);
    expect(hit.result).toBe(result);
  });
});

describe("order: the engines go once a turn, in either order", () => {
  it("a compensated railgun and a jump are refused both ways round", () => {
    const state = withShip(laneState(), "p1", { facing: "prograde" });
    for (const actions of [
      [fire(1, "forward-0", "p3", "engines", true), jump(2, ALPHA)],
      [jump(1, ALPHA), fire(2, "forward-0", "p3", "engines", true)],
    ]) {
      expectRefused(executeTurnAs(state, ...actions), state);
    }
  });
});

describe("order: fuel", () => {
  const dry = () => {
    const state = brawlerState();
    return {
      ...state,
      players: state.players.map((p) =>
        p.id === "p1"
          ? { ...p, ship: { ...p.ship, reactionMass: 0 } }
          : p.id === "p2"
            ? { ...p, ship: { ...p.ship, sector: 11 } }
            : p
      ),
    };
  };

  it.each<[string, Draft[], number | null]>([
    // The scoop on ring 3 takes 4; the compensation spends 1 of it.
    [
      "scoop, then a compensated railgun",
      [coast(1, true), fire(2, "forward-0", "p2", "engines", true)],
      3,
    ],
    [
      "a compensated railgun, then the scoop",
      [fire(1, "forward-0", "p2", "engines", true), coast(2, true)],
      null,
    ],
  ])("%s", (_label, actions, fuel) => {
    const state = dry();
    const result = executeTurnAs(state, ...actions);
    if (fuel === null) expectRefused(result, state);
    else {
      expect(result.errors).toBeUndefined();
      expect(getShip(result.gameState, "p1").reactionMass).toBe(fuel);
    }
  });
});

describe("order: no move is a coast after everything else", () => {
  it("fires from where the ship starts, then drifts", () => {
    // p4 is in the laser's box only from the start (ring 4, sector 7).
    const result = executeTurnAs(
      brawlerState(),
      fire(1, "side-0", "p4"),
      fire(2, "forward-0", "p2", "engines", true)
    );
    expect(result.errors).toBeUndefined();
    const types = eventTypes(result.events);
    expect(types.indexOf("coasted")).toBeGreaterThan(types.lastIndexOf("weapon_fired"));
    expect(getShip(result.gameState, "p1")).toMatchObject({ ring: 3, sector: 10 });
  });
});

describe("order: the station is reached by the burn the facing makes", () => {
  // Alpha ring 3, sector 22: two sectors of drift, then one ring in is the
  // station (ring 2, sector 0). Rotating after the burn burns outward.
  it.each<[string, boolean, Draft[]]>([
    ["wall, rotate, burn", true, [power(1, "side-2", 2), rotate(2, "retrograde"), burn(3, "soft")]],
    ["rotate, burn, wall", true, [rotate(1, "retrograde"), burn(2, "soft"), power(3, "side-2", 2)]],
    [
      "burn, rotate, wall",
      false,
      [burn(1, "soft"), rotate(2, "retrograde"), power(3, "side-2", 2)],
    ],
  ])("%s: docks %s", (_label, docks, actions) => {
    const result = executeTurnAs(stationState(), ...actions);
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "docked")).toHaveLength(docks ? 1 : 0);
    expect(getShip(result.gameState, "p1")).toMatchObject({
      wellId: ALPHA,
      ring: docks ? 2 : 4,
      sector: 0,
    });
  });
});
