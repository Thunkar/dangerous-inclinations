import { describe, it, expect } from "vitest";
import { OPENING_ROUNDS, FIRST_TURN } from "../../models/game.ts";
import { processOwnerMissiles, projectMissilePath, stepToward } from "../../game/missiles.ts";
import { processActions } from "../../game/actionProcessors.ts";
import { SUBSYSTEM_CONFIGS, getMissileStats } from "../../models/subsystems.ts";
import type { GameState, Missile, PlayerAction, ShipLoadout } from "../../models/game.ts";
import {
  ALPHA,
  BH,
  coast,
  eventsOf,
  eventTypes,
  executeTurnAs,
  fire,
  getShip,
  getSub,
  burn,
  makeGameState,
  makeMissile,
  makePlayer,
  makeTwoPlayerGame,
  mustExecute,
  withPlayer,
  withPower,
  withShip,
  withSub,
} from "../testUtils.ts";

const RACK: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["ballistic_rack", "laser", "shields", "laser"],
};
const TWO_RACKS: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["ballistic_rack", "laser", "ballistic_rack", "laser"],
};
/** One port laser and nothing else that fires: a shot that is legal but for a count. */
const LASER_ONLY: ShipLoadout = {
  forwardSlots: [null],
  sideSlots: ["laser", null, null, null],
};

/** p1 at R3 S0 with powered missiles; p2 at the given spot. */
function launcher(target = { ring: 5, sector: 0 }, targetLoadout?: ShipLoadout) {
  return withPower(
    makeTwoPlayerGame({ ring: 3, sector: 0 }, { ...target, loadout: targetLoadout }),
    "p1",
    "side-3",
    2
  );
}

function missileAt(
  state: GameState,
  ring: number,
  sector: number,
  extra: Partial<Missile> = {}
): GameState {
  return { ...state, missiles: [...state.missiles, makeMissile({ ring, sector, ...extra })] };
}

describe("missiles: pathing", () => {
  it("closes rings before sectors and stops after the given steps", () => {
    expect(
      stepToward({ wellId: BH, ring: 3, sector: 0 }, { wellId: BH, ring: 5, sector: 3 }, 3)
    ).toEqual({ wellId: BH, ring: 5, sector: 1 });
    expect(
      stepToward({ wellId: BH, ring: 3, sector: 0 }, { wellId: BH, ring: 1, sector: 0 }, 1)
    ).toEqual({ wellId: BH, ring: 2, sector: 0 });
  });

  it("takes the short way round the ring", () => {
    expect(
      stepToward({ wellId: BH, ring: 3, sector: 0 }, { wellId: BH, ring: 3, sector: 20 }, 3)
    ).toEqual({ wellId: BH, ring: 3, sector: 21 });
  });

  it("stops on the target and never crosses wells", () => {
    const target = { wellId: BH, ring: 3, sector: 1 };
    expect(stepToward({ wellId: BH, ring: 3, sector: 0 }, target, 3)).toEqual(target);
    expect(
      stepToward({ wellId: BH, ring: 3, sector: 0 }, { wellId: ALPHA, ring: 3, sector: 1 }, 3)
    ).toEqual({ wellId: BH, ring: 3, sector: 0 });
  });

  it("projectMissilePath starts with the drift and ends on the target when reachable", () => {
    expect(
      projectMissilePath({ wellId: BH, ring: 3, sector: 0 }, { wellId: BH, ring: 5, sector: 4 })
    ).toEqual([
      { wellId: BH, ring: 3, sector: 4 },
      { wellId: BH, ring: 4, sector: 4 },
      { wellId: BH, ring: 5, sector: 4 },
    ]);
    expect(
      projectMissilePath({ wellId: BH, ring: 5, sector: 0 }, { wellId: ALPHA, ring: 3, sector: 4 })
    ).toEqual([{ wellId: BH, ring: 5, sector: 1 }]);
  });

  it("projectMissilePath skips the drift segment for a missile launched after the ship moved", () => {
    const from = { wellId: BH, ring: 3, sector: 0 };
    const target = { wellId: BH, ring: 3, sector: 10 };
    expect(projectMissilePath({ ...from, launchedAfterMove: true }, target)[0]).toEqual(from);
    expect(projectMissilePath(from, target)[0]).toEqual({ ...from, sector: 4 });
  });

  it("never plans more than the missile's fuel allowance", () => {
    const path = projectMissilePath(
      { wellId: BH, ring: 5, sector: 0 },
      { wellId: BH, ring: 1, sector: 12 }
    );
    expect(path).toHaveLength(getMissileStats().fuelPerTurn + 1);
  });

  const pathCases: Array<
    [
      string,
      { ring: number; sector: number; launchedAfterMove?: boolean },
      { ring: number; sector: number },
    ]
  > = [
    ["a target it reaches", { ring: 5, sector: 0 }, { ring: 5, sector: 13 }],
    ["a target it falls short of", { ring: 1, sector: 0 }, { ring: 5, sector: 12 }],
    [
      "a missile launched after moving",
      { ring: 3, sector: 6, launchedAfterMove: true },
      { ring: 4, sector: 20 },
    ],
  ];

  it.each(pathCases)(
    "projectMissilePath agrees with processOwnerMissiles for %s",
    (_label, missile, target) => {
      const state = missileAt(
        withShip(makeTwoPlayerGame(), "p2", { wellId: BH, ...target }),
        missile.ring,
        missile.sector,
        {
          launchedAfterMove: missile.launchedAfterMove ?? false,
        }
      );
      const path = projectMissilePath(state.missiles[0], { wellId: BH, ...target });
      const result = processOwnerMissiles(state, "p1");
      const landed = result.state.missiles[0]
        ? {
            wellId: result.state.missiles[0].wellId,
            ring: result.state.missiles[0].ring,
            sector: result.state.missiles[0].sector,
          }
        : { wellId: BH, ...target };
      expect(path[path.length - 1]).toEqual(landed);
    }
  );
});

describe("missiles: launch", () => {
  it("places a missile at the ship's position and spends one round of ammo", () => {
    const result = executeTurnAs(launcher(), fire(1, "side-3", "p2", "side-1"), coast(2));
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "missile_launched")).toEqual([
      expect.objectContaining({
        ownerId: "p1",
        targetId: "p2",
        at: { wellId: BH, ring: 3, sector: 0 },
      }),
    ]);
    expect(getSub(result.gameState, "p1", "side-3").ammo).toBe(3);
    expect(getSub(result.gameState, "p1", "side-3").isRevealed).toBe(true);
    expect(eventsOf(result.events, "attack_resolved")).toEqual([]);
    const [missile] = result.gameState.missiles;
    expect(missile).toMatchObject({
      ownerId: "p1",
      targetId: "p2",
      criticalTarget: "side-1",
      turnFired: FIRST_TURN + OPENING_ROUNDS,
      movesMade: 1,
    });
  });

  it("refuses to launch with no ammo", () => {
    const state = withSub(launcher(), "p1", "side-3", { ammo: 0 });
    expect(executeTurnAs(state, fire(1, "side-3", "p2")).errors?.[0]).toMatch(/no missiles/i);
  });

  it("a salvo puts one token per missile in the air and is one use of the tile", () => {
    const processed = processActions(launcher(), [
      { ...fire(1, "side-3", "p2", "side-1", undefined, 3), playerId: "p1" } as PlayerAction,
    ]);
    expect(processed.success).toBe(true);
    const launched = eventsOf(processed.events as never, "missile_launched");
    expect(launched).toHaveLength(3);
    expect(new Set(launched.map((e) => e.missileId)).size).toBe(3);
    expect(processed.state.missiles).toHaveLength(3);
    for (const missile of processed.state.missiles) {
      expect(missile).toMatchObject({ targetId: "p2", criticalTarget: "side-1" });
    }
    expect(getSub(processed.state, "p1", "side-3").ammo).toBe(1);
    // Three rounds off the rail, the tile's two cubes charged once.
    expect(getShip(processed.state, "p1").heat.currentHeat).toBe(2);
    expect(eventsOf(processed.events as never, "weapon_fired")[0]).toMatchObject({
      count: 3,
      heat: 2,
    });
  });

  it.each([
    ["more missiles than the tile holds", 5],
    ["no missiles at all", 0],
    ["a fraction of a missile", 1.5],
  ])("refuses a salvo of %s", (_label, count) => {
    const result = executeTurnAs(launcher(), fire(1, "side-3", "p2", "engines", undefined, count));
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(result.gameState.missiles).toEqual([]);
  });

  it("refuses a count on a weapon that is not a missiles tile", () => {
    // A laser to port with the target one ring out: a legal shot but for the count.
    const state = withPower(
      makeTwoPlayerGame({ ring: 3, sector: 0, loadout: LASER_ONLY }, { ring: 4, sector: 0 }),
      "p1",
      "side-0",
      2
    );
    expect(executeTurnAs(state, fire(1, "side-0", "p2")).errors).toBeUndefined();
    expect(
      executeTurnAs(state, fire(1, "side-0", "p2", "engines", undefined, 2)).errors?.length
    ).toBeGreaterThan(0);
  });

  it("an absent count is a single missile", () => {
    const processed = processActions(launcher(), [
      { ...fire(1, "side-3", "p2"), playerId: "p1" } as PlayerAction,
    ]);
    expect(processed.state.missiles).toHaveLength(1);
    expect(getSub(processed.state, "p1", "side-3").ammo).toBe(3);
    expect(eventsOf(processed.events as never, "weapon_fired")[0]).toMatchObject({
      count: 1,
      heat: 2,
    });
  });

  it("is a turret: fires backwards too", () => {
    const state = withPower(
      makeTwoPlayerGame({ ring: 3, sector: 0, facing: "retrograde" }, { ring: 3, sector: 3 }),
      "p1",
      "side-3",
      2
    );
    expect(executeTurnAs(state, fire(1, "side-3", "p2")).errors).toBeUndefined();
  });

  it("launches from wherever the ship is when the shot resolves", () => {
    const state = launcher({ ring: 5, sector: 1 });
    const before = executeTurnAs(state, fire(1, "side-3", "p2"), coast(2));
    const after = executeTurnAs(state, coast(1), fire(2, "side-3", "p2"));
    expect(eventsOf(before.events, "missile_launched")[0].at).toEqual({
      wellId: BH,
      ring: 3,
      sector: 0,
    });
    expect(eventsOf(after.events, "missile_launched")[0].at).toEqual({
      wellId: BH,
      ring: 3,
      sector: 4,
    });
  });

  it.each([
    ["false when nothing has moved yet", [fire(1, "side-3", "p2")], false],
    ["false when the move comes after the shot", [fire(1, "side-3", "p2"), coast(2)], false],
    ["true when a coast came first", [coast(1), fire(2, "side-3", "p2")], true],
    ["true when a burn came first", [burn(1, "soft"), fire(2, "side-3", "p2")], true],
  ])("launchedAfterMove is %s", (_label, actions, expected) => {
    const state = withPower(launcher({ ring: 5, sector: 2 }), "p1", "engines", 1);
    const stamped = actions.map((a) => ({ ...a, playerId: "p1" }) as PlayerAction);
    const processed = processActions(state, stamped);
    expect(processed.success).toBe(true);
    expect(processed.state.missiles).toHaveLength(1);
    expect(processed.state.missiles[0].launchedAfterMove).toBe(expected);
  });
});

describe("missiles: movement at the end of the owner's turn", () => {
  it.each([
    ["drifts first when it was launched before the ship moved", false, 1],
    ["starts where it was dropped when it was launched after the ship moved", true, 0],
  ])("a missile %s", (_label, launchedAfterMove, driftedSectors) => {
    // The target sits in another well, so the missile can only ride its orbit.
    const state = missileAt(
      withShip(makeTwoPlayerGame(), "p2", { wellId: ALPHA, ring: 3, sector: 0 }),
      5,
      0,
      {
        launchedAfterMove,
      }
    );
    const result = processOwnerMissiles(state, "p1");
    expect(result.state.missiles[0]).toMatchObject({
      ring: 5,
      sector: driftedSectors,
      movesMade: 1,
    });
    expect(result.state.missiles[0].launchedAfterMove).toBe(false);
  });

  it("drifts with its ring, then moves up to 3 steps (rings first)", () => {
    const result = executeTurnAs(launcher(), fire(1, "side-3", "p2"));
    // Launched R3 S0 -> drift to S4 -> R4, R5 -> one sector toward S0 -> R5 S3.
    expect(eventsOf(result.events, "missile_moved")).toEqual([
      expect.objectContaining({
        ownerId: "p1",
        to: { wellId: BH, ring: 5, sector: 3 },
        movesLeft: 2,
      }),
    ]);
    expect(result.gameState.missiles[0]).toMatchObject({ ring: 5, sector: 3, movesMade: 1 });
  });

  it("keeps tracking across turns and attacks when it reaches the target", () => {
    let state = mustExecute(launcher(), fire(1, "side-3", "p2")); // missile R5 S3, p2 R5 S0
    state = mustExecute(state, coast(1)); // p2 drifts to S1
    const result = executeTurnAs(state, coast(1)); // missile drifts to S4 then steps 4->3->2->1
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "attack_resolved")).toEqual([
      expect.objectContaining({
        attackerId: "p1",
        targetId: "p2",
        weaponType: "missiles",
        damage: 2,
        toHull: 2,
        targetHullAfter: 8,
      }),
    ]);
    expect(result.gameState.missiles).toEqual([]);
    expect(getShip(result.gameState, "p2").hitPoints).toBe(8);
  });

  it("expires after three moves without hitting", () => {
    const far = missileAt(makeTwoPlayerGame({}, { ring: 5, sector: 12 }), 1, 0, { movesMade: 2 });
    const result = processOwnerMissiles(far, "p1");
    expect(result.state.missiles).toEqual([]);
    expect(result.events).toEqual([
      expect.objectContaining({ type: "missile_expired", missileId: "m-1" }),
    ]);
  });

  it("only moves the active owner's missiles", () => {
    const state = missileAt(makeTwoPlayerGame({}, { ring: 5, sector: 12 }), 1, 0, {
      ownerId: "p2",
      targetId: "p1",
    });
    const result = processOwnerMissiles(state, "p1");
    expect(result.state.missiles).toEqual(state.missiles);
    expect(result.events).toEqual([]);
  });

  it("drifts but cannot pursue a target in another well", () => {
    const state = missileAt(
      withShip(makeTwoPlayerGame(), "p2", { wellId: ALPHA, ring: 3, sector: 0 }),
      5,
      0
    );
    const result = processOwnerMissiles(state, "p1");
    expect(result.state.missiles[0]).toMatchObject({
      wellId: BH,
      ring: 5,
      sector: 1,
      movesMade: 1,
    });
  });

  it.each([
    ["destroyed", (s: GameState) => withShip(s, "p2", { hitPoints: 0 })],
    ["not deployed", (s: GameState) => withPlayer(s, "p2", { hasDeployed: false })],
  ])("expires when its target is %s", (_label, setup) => {
    const state = missileAt(setup(makeTwoPlayerGame()), 3, 12);
    const result = processOwnerMissiles(state, "p1");
    expect(result.state.missiles).toEqual([]);
    expect(eventTypes(result.events as never)).toEqual(["missile_expired"]);
  });
});

describe("missiles: on the target's sector", () => {
  /** A missile already sitting where p2 will still be after its drift: p2 on R5 S12 (drift 1) -> S13; missile on R5 S12 drifts to S13. */
  const onTarget = (targetLoadout?: ShipLoadout) =>
    missileAt(makeTwoPlayerGame({}, { ring: 5, sector: 13, loadout: targetLoadout }), 5, 12);

  it("attacks with the missile's own critical target", () => {
    const state = withPower({ ...onTarget(), forcedRollValue: 10 }, "p2", "side-1", 2);
    const result = processOwnerMissiles(
      { ...state, missiles: [{ ...state.missiles[0], criticalTarget: "side-1" }] },
      "p1"
    );
    expect(getSub(result.state, "p2", "side-1").isBroken).toBe(true);
    expect(eventsOf(result.events as never, "attack_resolved")[0]).toMatchObject({
      result: "critical",
      weaponType: "missiles",
    });
  });

  it("a killing missile destroys the target and credits the owner", () => {
    const state = withShip(onTarget(), "p2", { hitPoints: 2 });
    const result = processOwnerMissiles(state, "p1");
    expect(eventsOf(result.events as never, "ship_destroyed")).toEqual([
      expect.objectContaining({ victimId: "p2", killerId: "p1", cause: "missile" }),
    ]);
  });

  it("a powered ballistic rack intercepts on 2+: rack used, heated and revealed, target unharmed", () => {
    const state = withPower(onTarget(RACK), "p2", "side-0", 2);
    const result = processOwnerMissiles(state, "p1");
    expect(eventsOf(result.events as never, "missile_intercepted")).toEqual([
      expect.objectContaining({ missileId: "m-1", targetId: "p2", roll: 5, heat: 2 }),
    ]);
    expect(eventTypes(result.events as never)).not.toContain("attack_resolved");
    expect(result.state.missiles).toEqual([]);
    const rack = getSub(result.state, "p2", "side-0");
    expect(rack).toMatchObject({ usedThisTurn: true, isRevealed: true });
    expect(getShip(result.state, "p2")).toMatchObject({ hitPoints: 10, heat: { currentHeat: 2 } });
    expect(eventsOf(result.events as never, "subsystem_revealed")[0]).toMatchObject({
      subsystemId: "side-0",
      reason: "intercepted",
    });
  });

  it("a rack that rolls 1 misses and the missile attacks anyway", () => {
    const state = withPower({ ...onTarget(RACK), forcedRollValue: 1 }, "p2", "side-0", 2);
    const result = processOwnerMissiles(state, "p1");
    expect(eventTypes(result.events as never)).toContain("missile_intercepted");
    expect(eventsOf(result.events as never, "missile_intercepted")[0].roll).toBe(1);
    expect(eventTypes(result.events as never)).toContain("attack_resolved");
    expect(result.state.missiles).toEqual([]);
  });

  it.each([
    ["unpowered", (s: GameState) => s],
    [
      "broken",
      (s: GameState) =>
        withSub(withPower(s, "p2", "side-0", 2), "p2", "side-0", { isBroken: true }),
    ],
  ])("a rack that is %s does not intercept", (_label, setup) => {
    const result = processOwnerMissiles(setup(onTarget(RACK)), "p1");
    expect(eventTypes(result.events as never)).not.toContain("missile_intercepted");
    expect(getShip(result.state, "p2").hitPoints).toBe(8);
  });

  /** `count` copies of the missile already sitting on the target's sector. */
  const salvoOf = (state: GameState, count: number): GameState => ({
    ...state,
    missiles: Array.from({ length: count }, (_, i) => ({ ...state.missiles[0], id: `m-${i + 1}` })),
  });

  it("one rack rolls at every missile of a salvo and is used once for the turn", () => {
    const state = withPower(salvoOf(onTarget(RACK), 3), "p2", "side-0", 2);
    const result = processOwnerMissiles({ ...state, forcedRollValue: 5 }, "p1");
    const intercepts = eventsOf(result.events as never, "missile_intercepted");
    expect(intercepts).toHaveLength(3);
    // The rack's cubes are charged on its first roll of the turn; the rest ride free.
    expect(intercepts.map((e) => e.heat)).toEqual([2, 0, 0]);
    expect(eventTypes(result.events as never)).not.toContain("attack_resolved");
    expect(result.state.missiles).toEqual([]);
    expect(getShip(result.state, "p2")).toMatchObject({
      hitPoints: 10,
      heat: { currentHeat: 2 },
    });
  });

  it("a rack that keeps rolling 1 keeps rolling and every missile attacks", () => {
    // A 1 is a miss for the attack too, so the salvo does no damage here: what
    // is on trial is that the rack does not stop rolling after a miss, and that
    // a turn of misses still costs it only the one use.
    const state = withPower(salvoOf(onTarget(RACK), 3), "p2", "side-0", 2);
    const result = processOwnerMissiles({ ...state, forcedRollValue: 1 }, "p1");
    expect(eventsOf(result.events as never, "missile_intercepted")).toHaveLength(3);
    expect(eventsOf(result.events as never, "attack_resolved")).toHaveLength(3);
    expect(getShip(result.state, "p2").heat.currentHeat).toBe(2);
  });

  it("an unpowered rack lets the whole salvo through", () => {
    const result = processOwnerMissiles(
      { ...salvoOf(onTarget(RACK), 3), forcedRollValue: 5 },
      "p1"
    );
    expect(eventTypes(result.events as never)).not.toContain("missile_intercepted");
    expect(getShip(result.state, "p2").hitPoints).toBe(4);
  });

  it("only one of two powered racks does the rolling", () => {
    const two = withPower(
      withPower(salvoOf(onTarget(TWO_RACKS), 2), "p2", "side-0", 2),
      "p2",
      "side-2",
      2
    );
    const result = processOwnerMissiles({ ...two, forcedRollValue: 5 }, "p1");
    expect(eventsOf(result.events as never, "missile_intercepted")).toHaveLength(2);
    expect(getShip(result.state, "p2")).toMatchObject({ hitPoints: 10, heat: { currentHeat: 2 } });
    expect(getSub(result.state, "p2", "side-2").isRevealed).toBe(false);
  });

  /**
   * A ship just back from Home is untouchable until it acts (RULES
   * §Destruction and Respawn): the missile finds nothing to hit and nothing to
   * shoot it down, so it flies on with one more move behind it.
   */
  it("slides past a recovering target: no attack, no interception, still in the air", () => {
    const state = withPlayer(withPower(onTarget(RACK), "p2", "side-0", 2), "p2", {
      recovering: true,
    });
    const result = processOwnerMissiles(state, "p1");
    expect(eventTypes(result.events as never)).not.toContain("attack_resolved");
    expect(eventTypes(result.events as never)).not.toContain("missile_intercepted");
    expect(getShip(result.state, "p2")).toMatchObject({ hitPoints: 10, heat: { currentHeat: 0 } });
    expect(result.state.missiles).toEqual([
      expect.objectContaining({ id: "m-1", ring: 5, sector: 13, movesMade: 1 }),
    ]);
    expect(eventsOf(result.events as never, "missile_moved")).toHaveLength(1);
  });

  it("but the clock still runs: its last move over a recovering ship burns it out", () => {
    const state = withPlayer(
      missileAt(makeTwoPlayerGame({}, { ring: 5, sector: 13 }), 5, 12, {
        movesMade: getMissileStats().maxMoves - 1,
      }),
      "p2",
      { recovering: true }
    );
    const result = processOwnerMissiles(state, "p1");
    expect(eventTypes(result.events as never)).toContain("missile_expired");
    expect(result.state.missiles).toEqual([]);
    expect(getShip(result.state, "p2").hitPoints).toBe(10);
  });

  it("shields absorb missile damage like any other: two cubes stop one point", () => {
    const state = withPower(onTarget(), "p2", "side-2", 2);
    const result = processOwnerMissiles(state, "p1");
    expect(getShip(result.state, "p2").hitPoints).toBe(9);
    expect(eventsOf(result.events as never, "attack_resolved")[0]).toMatchObject({
      toHull: 1,
      toHeat: 1,
    });
  });
});

describe("missiles: through executeTurn", () => {
  it("a missile that hits during the owner's turn counts toward that turn's missions and destruction", () => {
    let state = makeGameState([
      makePlayer("p1", { wellId: BH, ring: 5, sector: 10 }),
      makePlayer("p2", { wellId: BH, ring: 5, sector: 13 }),
    ]);
    state = withShip(state, "p2", { hitPoints: 2 });
    state = missileAt(state, 5, 12);
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "ship_destroyed")[0]).toMatchObject({
      victimId: "p2",
      killerId: "p1",
      cause: "missile",
    });
    expect(eventsOf(result.events, "cargo_dropped")).toEqual([]); // nothing carried
  });
});

describe("missiles: a salvo and a turn of interceptions are one use of a tile", () => {
  it("a salvo of three costs the launcher's cubes once", () => {
    const processed = processActions(launcher(), [
      { ...fire(1, "side-3", "p2", undefined, undefined, 3), playerId: "p1" } as PlayerAction,
    ]);
    expect(processed.success).toBe(true);
    expect(processed.state.missiles).toHaveLength(3);
    expect(getShip(processed.state, "p1").heat.currentHeat).toBe(
      SUBSYSTEM_CONFIGS.missiles.minEnergy
    );
    expect(eventsOf(processed.events as never, "weapon_fired")[0]).toMatchObject({
      count: 3,
      heat: SUBSYSTEM_CONFIGS.missiles.minEnergy,
    });
  });

  it("three interception rolls cost the rack's cubes once", () => {
    const expected = SUBSYSTEM_CONFIGS.ballistic_rack.minEnergy;
    const onTarget = missileAt(
      makeTwoPlayerGame({}, { ring: 5, sector: 13, loadout: RACK }),
      5,
      12
    );
    const salvo: GameState = {
      ...onTarget,
      forcedRollValue: 5,
      missiles: Array.from({ length: 3 }, (_, i) => ({ ...onTarget.missiles[0], id: `m-${i + 1}` })),
    };
    const result = processOwnerMissiles(withPower(salvo, "p2", "side-0", 2), "p1");
    const intercepts = eventsOf(result.events as never, "missile_intercepted");
    expect(intercepts).toHaveLength(3);
    expect(intercepts.every((e) => e.destroyed)).toBe(true);
    expect(result.state.missiles).toEqual([]);
    expect(eventTypes(result.events as never)).not.toContain("attack_resolved");
    expect(getShip(result.state, "p2")).toMatchObject({
      hitPoints: 10,
      heat: { currentHeat: expected },
    });
    expect(intercepts.reduce((sum, e) => sum + e.heat, 0)).toBe(expected);
  });
});
