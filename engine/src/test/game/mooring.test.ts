/**
 * A moored ship can neither fire nor be fired at, missiles included (RULES
 * §Stations).
 */
import { describe, it, expect } from "vitest";
import type { GameState, Position } from "../../models/game.ts";
import { getMissileStats } from "../../models/subsystems.ts";
import { processOwnerMissiles } from "../../game/missiles.ts";
import { advanceStations, isMooredAt } from "../../game/stations.ts";
import { viewFor } from "../../game/view.ts";
import { canBeTargeted } from "../../game/targeting.ts";
import { executeTurn } from "../../game/turns.ts";
import { botDecideActions } from "../../ai/index.ts";
import { seatOptions } from "../../agent/options.ts";
import { buildTurn, type TurnIntent } from "../../agent/intent.ts";
import {
  LOADOUTS,
  ALPHA,
  burn,
  coast,
  eventsOf,
  eventTypes,
  executeTurnAs,
  expectRefused,
  expectRefusedUnless,
  fire,
  getPlayer,
  getShip,
  makeGameState,
  makeMissile,
  makePlayer,
  makeTwoPlayerGame,
  mustExecute,
  scan,
  withPower,
  withShip,
  grounded,
  berthOf,
  interceptMission,
  withMissions,
} from "../testUtils.ts";

/** p1 two sectors behind p2 on Alpha's station ring, railgun powered: p2 dead ahead. */
function railgunLine(p1Sector: number, p2Sector: number): GameState {
  return withPower(
    makeTwoPlayerGame(
      { wellId: ALPHA, ring: 2, sector: p1Sector, facing: "prograde" },
      { wellId: ALPHA, ring: 2, sector: p2Sector }
    ),
    "p1",
    "forward-0",
    4
  );
}

// Clear of the berth at S0, the target moored on it, and the shooter moored on it.
const CLEAR = [6, 8] as const;
const AT_TARGET = [22, 0] as const;
const FROM_BERTH = [0, 2] as const;
type Line = readonly [number, number];

describe("moored ships are safe", () => {
  it.each<[string, boolean, Line]>([
    ["clear of any station", true, CLEAR],
    ["moored", false, AT_TARGET],
    ["clear, with the shooter moored", true, FROM_BERTH],
  ])("a target %s may be fired at: %s, read off the state or any view", (_label, firable, line) => {
    const state = railgunLine(...line);
    const seats = [
      getPlayer(state, "p2"),
      viewFor(state, "p1").players[1],
      viewFor(state, null).players[1],
    ];
    expect(seats.map((seat) => canBeTargeted(seat, state.stations))).toEqual([
      firable,
      firable,
      firable,
    ]);
  });

  it.each<[string, (berth: Position) => Position, boolean]>([
    ["on the berth", (b) => b, true],
    ["one sector along the station's ring", (b) => ({ ...b, sector: b.sector + 1 }), false],
    ["the berth's sector on ring 1, inside the station", (b) => ({ ...b, ring: 1 }), false],
    ["the berth's sector on ring 3, outside it", (b) => ({ ...b, ring: 3 }), false],
    ["the same square round another planet", (b) => ({ ...b, wellId: "planet-beta" }), true],
    ["the same numbers round the black hole", (b) => ({ ...b, wellId: "blackhole" }), false],
  ])("a ship %s is moored and safe: %s", (_label, where, moored) => {
    const state = railgunLine(...CLEAR);
    const position = where(berthOf(state, ALPHA));
    expect(isMooredAt(state.stations, position)).toBe(moored);
  });

  it("the berth moves with its station: the old square is open water once the round ends", () => {
    const before = railgunLine(...CLEAR);
    const oldBerth = berthOf(before, ALPHA);
    const after = advanceStations(before).state;
    const newBerth = berthOf(after, ALPHA);
    expect(newBerth).not.toEqual(oldBerth);
    expect(isMooredAt(after.stations, newBerth)).toBe(true);
    expect(isMooredAt(after.stations, oldBerth)).toBe(false);
  });

  const shots = {
    "a railgun shot": fire(1, "forward-0", "p2"),
    "a missile launch": fire(1, "side-3", "p2", "engines", undefined, 1),
  };
  it.each<[keyof typeof shots, string, boolean, Line]>(
    (Object.keys(shots) as Array<keyof typeof shots>).flatMap((shot) => [
      [shot, "clear of any station", true, CLEAR],
      [shot, "at a moored target", false, AT_TARGET],
      [shot, "from a mooring", false, FROM_BERTH],
    ])
  )("%s %s: accepted = %s", (shot, _label, accepted, [p1, p2]) => {
    const result = executeTurnAs(railgunLine(p1, p2), shots[shot]);
    expect(result.errors === undefined).toBe(accepted);
  });

  it("a ship that burns off its berth fires after the move", () => {
    // Moored at S0; a soft burn takes it out to ring 3, off the berth.
    const state = railgunLine(...FROM_BERTH);
    const result = executeTurnAs(
      state,
      burn(1, "soft"),
      fire(2, "side-3", "p2", "engines", undefined, 1)
    );
    expect(result.errors).toBeUndefined();
    expect(state.missiles).toEqual([]);
    expect(eventTypes(result.events)).toContain("missile_launched");
  });

  // p1 with a sensor bow on Alpha's station ring, facing prograde, p2 two
  // sectors ahead: the berth is as safe from a scan as from a shot, and a
  // moored ship may still scan.
  it.each<[string, Line, boolean]>([
    ["clear of any station", CLEAR, true],
    ["at a moored target", AT_TARGET, false],
    ["from a mooring", FROM_BERTH, true],
  ])("a scan %s: accepted = %s", (_label, [p1, p2], accepted) => {
    const state = makeTwoPlayerGame(
      { wellId: ALPHA, ring: 2, sector: p1, facing: "prograde", loadout: LOADOUTS.sensor },
      { wellId: ALPHA, ring: 2, sector: p2 }
    );
    const result = executeTurnAs(state, scan(1, "p2"));
    expect(result.errors === undefined).toBe(accepted);
    if (!accepted) expectRefused(result, state);
  });
});

describe("a missile that reaches a moored ship", () => {
  /**
   * p2 moored at Alpha's berth with its rack powered, a missile already on its
   * sector: the rack shows point defence never rolls at a missile that does not attack.
   */
  function missileOnBerth(movesMade = 0): GameState {
    const base = makeTwoPlayerGame(
      { wellId: ALPHA, ring: 3, sector: 12 },
      { wellId: ALPHA, ring: 2, sector: 0, loadout: LOADOUTS.rack }
    );
    const state = withPower(base, "p2", "side-0", 2);
    return {
      ...state,
      missiles: [makeMissile({ wellId: ALPHA, ring: 2, sector: 0, movesMade })],
    };
  }

  it("does not attack and is not shot down: it stays in flight with a move behind it", () => {
    const result = processOwnerMissiles(missileOnBerth(), "p1");
    const types = eventTypes(result.events as never);
    expect(types).not.toContain("attack_resolved");
    expect(types).not.toContain("missile_intercepted");
    expect(getShip(result.state, "p2").hitPoints).toBe(10);
    expect(result.state.missiles).toEqual([expect.objectContaining({ id: "m-1", movesMade: 1 })]);
    expect(eventsOf(result.events as never, "missile_moved")).toHaveLength(1);
  });

  it("still burns out on schedule", () => {
    const result = processOwnerMissiles(missileOnBerth(getMissileStats().maxMoves - 1), "p1");
    expect(eventTypes(result.events as never)).toContain("missile_expired");
    expect(result.state.missiles).toEqual([]);
    expect(getShip(result.state, "p2").hitPoints).toBe(10);
  });
});

describe("bots and seats never offer a scan at a berth", () => {
  /** p1 with a sensor bow and an Intercept on p2, as in the scan table above; engines broken. */
  const scanLine = ([a, b]: Line) =>
    grounded(
      withMissions(
        makeTwoPlayerGame(
          { wellId: ALPHA, ring: 2, sector: a, facing: "prograde", loadout: LOADOUTS.sensor },
          { wellId: ALPHA, ring: 2, sector: b }
        ),
        "p1",
        [interceptMission("p2")]
      )
    );

  it.each<[string, Line, boolean]>([
    ["clear of any station", CLEAR, true],
    ["at a moored target", AT_TARGET, false],
    ["from a mooring", FROM_BERTH, true],
  ])("a scan %s is offered and taken: %s", (_label, line, offered) => {
    const state = scanLine(line);
    const view = viewFor(state, "p1");
    expect(seatOptions(view).scanTargets.includes("p2")).toBe(offered);
    const decision = botDecideActions(view);
    expect(decision.actions.some((x) => x.type === "scan")).toBe(offered);
    expect(executeTurn(state, decision.actions).errors).toBeUndefined();
  });
});

describe("bots and seats never offer a shot at or from a berth", () => {
  /** Engines broken: the bot can only coast, so it shoots from where it sits. */

  it.each<[string, Line]>([
    ["at a moored target", AT_TARGET],
    ["from a mooring", FROM_BERTH],
  ])("the bot fires nothing %s, and its turn is legal", (_label, [a, b]) => {
    const state = grounded(railgunLine(a, b));
    const decision = botDecideActions(viewFor(state, "p1"));
    expect(decision.actions.filter((x) => x.type === "fire_weapon")).toEqual([]);
    expect(executeTurn(state, decision.actions).errors).toBeUndefined();
  });

  it("the bot takes the same shot once nobody is at a berth", () => {
    const state = grounded(railgunLine(...CLEAR));
    const decision = botDecideActions(viewFor(state, "p1"));
    expect(decision.actions.some((x) => x.type === "fire_weapon")).toBe(true);
  });

  it.each<[string, boolean, Line]>([
    ["at a moored target", false, AT_TARGET],
    ["from a mooring", false, FROM_BERTH],
    ["clear of any station", true, CLEAR],
  ])("the seat lists p2 as a railgun target %s: %s", (_label, listed, [a, b]) => {
    const options = seatOptions(viewFor(railgunLine(a, b), "p1"));
    const railgun = options.weapons.find((w) => w.weapon === "forward-0")!;
    expect(railgun.targetsNow.includes("p2")).toBe(listed);
  });
});

describe("moored from docking until leaving the sector (RULES §Stations, Moored)", () => {
  /**
   * S1: p1 on Alpha ring 3, sector 22, facing retrograde: a soft burn drifts
   * it two sectors and drops it onto the station (ring 2, sector 0). p2 sits
   * one sector on, on the station's ring, in the rack's box from the berth.
   */
  function arriving(): GameState {
    return makeGameState([
      makePlayer(
        "p1",
        { wellId: ALPHA, ring: 3, sector: 22, facing: "retrograde" },
        LOADOUTS.railRack
      ),
      makePlayer("p2", { wellId: ALPHA, ring: 2, sector: 1 }, LOADOUTS.railRack),
    ]);
  }

  /**
   * S2: p1 on Alpha ring 3, sector 0, facing prograde, p2 two sectors ahead:
   * an uncompensated railgun shot recoils p1 inward onto the station's sector.
   */
  function recoiling(): GameState {
    return makeGameState([
      makePlayer("p1", { wellId: ALPHA, ring: 3, sector: 0 }, LOADOUTS.railRack),
      makePlayer("p2", { wellId: ALPHA, ring: 3, sector: 2 }, LOADOUTS.railRack),
    ]);
  }

  it("a ship arriving at a station fires after its move, then docks", () => {
    const state = arriving();
    const result = executeTurnAs(state, burn(1, "soft"), fire(2, "side-0", "p2"));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1")).toMatchObject(berthOf(state, ALPHA));
    expect(
      eventsOf(result.events, "attack_resolved").filter((e) => e.attackerId === "p1")
    ).toHaveLength(1);
    expect(eventsOf(result.events, "docked")).toHaveLength(1);
  });

  it("from the end of that turn it is moored: nobody fires at it", () => {
    // Holding the berth and riding the station are docking.test.ts's.
    const docked = mustExecute(arriving(), burn(1, "soft"), fire(2, "side-0", "p2"));
    // p2's turn: p1 is in the rack's box, and moored.
    expect(canBeTargeted(getPlayer(docked, "p1"), docked.stations)).toBe(false);
    expectRefused(executeTurnAs(docked, fire(1, "side-0", "p1")), docked);
  });

  it("from the end of that turn nobody scans it, and once off the berth they may", () => {
    // p2 one sector on from the berth, facing retrograde: the berth is ahead of its sensor.
    const state = makeGameState([
      makePlayer(
        "p1",
        { wellId: ALPHA, ring: 3, sector: 22, facing: "retrograde" },
        LOADOUTS.railRack
      ),
      makePlayer(
        "p2",
        { wellId: ALPHA, ring: 2, sector: 1, facing: "retrograde" },
        LOADOUTS.sensor
      ),
    ]);
    const docked = mustExecute(state, burn(1, "soft"));
    expect(getShip(docked, "p1")).toMatchObject(berthOf(state, ALPHA));
    expect(canBeTargeted(getPlayer(docked, "p1"), docked.stations)).toBe(false);
    const offBerth = withShip(docked, "p1", { sector: 23 });
    expectRefusedUnless(
      executeTurnAs(docked, scan(1, "p1")),
      executeTurnAs(offBerth, scan(1, "p1"))
    );
  });

  it("a ship that began its turn moored and coasts is still moored after the coast", () => {
    const docked = mustExecute(arriving(), burn(1, "soft"), fire(2, "side-0", "p2"));
    const p1Again = mustExecute(docked, coast(1));
    // p2 is now beside the berth's new sector on the ring: in the rack's box.
    const near = withShip(p1Again, "p2", { sector: berthOf(p1Again, ALPHA).sector + 1 });
    expectRefused(executeTurnAs(near, coast(1), fire(2, "side-0", "p2")), near);
    expectRefused(executeTurnAs(near, fire(1, "side-0", "p2"), coast(2)), near);
  });

  it.each<[string, Array<Parameters<typeof executeTurnAs>[1]>]>([
    ["then a coast", [fire(1, "forward-0", "p2"), coast(2)]],
    ["and no move", [fire(1, "forward-0", "p2")]],
  ])(
    "a railgun's recoil onto the station moors nothing: fired %s, the ship drifts off",
    (_l, actions) => {
      const state = recoiling();
      const result = executeTurnAs(state, ...actions);
      expect(result.errors).toBeUndefined();
      expect(eventsOf(result.events, "recoil")[0].to).toEqual(berthOf(state, ALPHA));
      // Ring 2 drifts 4 a turn round a planet.
      expect(getShip(result.gameState, "p1")).toMatchObject({ wellId: ALPHA, ring: 2, sector: 4 });
      expect(eventsOf(result.events, "coasted")[0].moored).toBeUndefined();
      expect(eventsOf(result.events, "docked")).toHaveLength(0);
    }
  );

  it.each<[string, () => GameState, TurnIntent, number]>([
    [
      "a shot after arriving at a station",
      arriving,
      {
        move: { kind: "burn", intensity: "soft" },
        fire: [{ weapon: "side-0", target: "p2", when: "after" }],
      },
      1,
    ],
    [
      "a railgun's recoil onto the station, then a coast",
      recoiling,
      { move: { kind: "coast" }, fire: [{ weapon: "forward-0", target: "p2", when: "before" }] },
      0,
    ],
  ])(
    "the seat's builder foresees no refusal for %s, and the engine agrees",
    (_l, build, intent, docks) => {
      const state = build();
      const built = buildTurn(viewFor(state, "p1"), intent);
      expect(built.notes.filter((n) => n.includes("moored"))).toEqual([]);
      const result = executeTurn(state, built.actions);
      expect(result.errors).toBeUndefined();
      expect(eventsOf(result.events, "docked")).toHaveLength(docks);
    }
  );

  it("a ship the recoil put on the station's sector may still fire", () => {
    // p3 one sector on from the berth, on its ring: the rack's from there.
    const state = makeGameState([
      ...recoiling().players,
      makePlayer("p3", { wellId: ALPHA, ring: 2, sector: 1 }),
    ]);
    const result = executeTurnAs(
      state,
      fire(1, "forward-0", "p2"),
      fire(2, "side-0", "p3"),
      coast(3)
    );
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "attack_resolved").map((e) => e.targetId)).toEqual(["p2", "p3"]);
  });
});
