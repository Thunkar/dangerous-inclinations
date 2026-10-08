import { describe, it, expect } from "vitest";
import { processOwnerMissiles, projectMissilePath, stepToward } from "../../game/missiles.ts";
import { processActions } from "../../game/actionProcessors.ts";
import { resetSubsystemUsage } from "../../game/ship.ts";
import type { GameState, PlayerAction, ShipLoadout } from "../../models/game.ts";
import {
  LOADOUTS,
  ALPHA,
  BH,
  coast,
  eventsOf,
  eventTypes,
  executeTurnAs,
  expectRefusedUnless,
  fire,
  getShip,
  getSub,
  burn,
  makeGameState,
  withMissile,
  makePlayer,
  makeTwoPlayerGame,
  mustExecute,
  power,
  scan,
  withPlayer,
  withPower,
  withShip,
  withSub,
} from "../testUtils.ts";

/** One action as the test helpers draft it, before `executeTurnAs` stamps the player. */
type Draft = Parameters<typeof executeTurnAs>[1];

/** p1 at R3 S0 with a launcher aboard; p2 at the given spot. The launch powers it. */
function launcher(target = { ring: 5, sector: 0 }, targetLoadout?: ShipLoadout) {
  return makeTwoPlayerGame({ ring: 3, sector: 0 }, { ...target, loadout: targetLoadout });
}

describe("missiles: pathing", () => {
  it("takes the short way round the ring", () => {
    expect(
      stepToward({ wellId: BH, ring: 3, sector: 0 }, { wellId: BH, ring: 3, sector: 20 }, 3)
    ).toEqual({ wellId: BH, ring: 3, sector: 21 });
  });

  it("projectMissilePath starts with the drift once the missile has moved, never on its launch turn, and ends on the target", () => {
    expect(
      projectMissilePath(
        { wellId: BH, ring: 3, sector: 0, movesMade: 1 },
        { wellId: BH, ring: 5, sector: 4 }
      )
    ).toEqual([
      { wellId: BH, ring: 3, sector: 4 },
      { wellId: BH, ring: 4, sector: 4 },
      { wellId: BH, ring: 5, sector: 4 },
    ]);
    expect(
      projectMissilePath(
        { wellId: BH, ring: 5, sector: 0, movesMade: 1 },
        { wellId: ALPHA, ring: 3, sector: 4 }
      )
    ).toEqual([{ wellId: BH, ring: 5, sector: 1 }]);
    const from = { wellId: BH, ring: 3, sector: 0 };
    expect(projectMissilePath({ ...from, movesMade: 0 }, { ...from, sector: 10 })[0]).toEqual(from);
  });

  it("never plans more than the missile's fuel allowance", () => {
    const path = projectMissilePath(
      { wellId: BH, ring: 5, sector: 0, movesMade: 0 },
      { wellId: BH, ring: 1, sector: 12 }
    );
    // Where it is, then three steps.
    expect(path).toHaveLength(4);
  });

  const pathCases: Array<
    [string, { ring: number; sector: number; movesMade: number }, { ring: number; sector: number }]
  > = [
    ["a target it reaches", { ring: 5, sector: 0, movesMade: 1 }, { ring: 5, sector: 4 }],
    ["a target it falls short of", { ring: 1, sector: 0, movesMade: 1 }, { ring: 5, sector: 12 }],
  ];

  it.each(pathCases)(
    "projectMissilePath agrees with processOwnerMissiles for %s",
    (_label, missile, target) => {
      const state = withMissile(withShip(makeTwoPlayerGame(), "p2", { wellId: BH, ...target }), {
        ring: missile.ring,
        sector: missile.sector,
        movesMade: missile.movesMade,
      });
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

  it.each([
    ["a target it falls short of", { ring: 4, sector: 20 }],
    ["a target it reaches", { ring: 5, sector: 1 }],
  ])("projectMissilePath agrees with the launch flight for %s", (_label, target) => {
    const from = { wellId: BH, ring: 3, sector: 0 };
    const path = projectMissilePath({ ...from, movesMade: 0 }, { wellId: BH, ...target });
    const result = executeTurnAs(launcher(target), fire(1, "side-3", "p2"));
    expect(result.errors).toBeUndefined();
    const [missile] = result.gameState.missiles;
    const landed = missile
      ? { wellId: missile.wellId, ring: missile.ring, sector: missile.sector }
      : { wellId: BH, ...target };
    expect(path[path.length - 1]).toEqual(landed);
    expect(eventsOf(result.events, "attack_resolved")).toHaveLength(missile ? 0 : 1);
  });
});

describe("missiles: launch", () => {
  it("places a missile at the ship's position and spends one round of ammo", () => {
    // p2 is out of reach of the launch turn's flight (R3 S0 -> R5 S1).
    const result = executeTurnAs(
      launcher({ ring: 5, sector: 8 }),
      fire(1, "side-3", "p2", "side-1"),
      coast(2)
    );
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
      movesMade: 1,
    });
  });

  it("refuses to launch with no ammo", () => {
    const state = withSub(launcher(), "p1", "side-3", { ammo: 0 });
    const lastRound = withSub(launcher(), "p1", "side-3", { ammo: 1 });
    expectRefusedUnless(
      executeTurnAs(state, fire(1, "side-3", "p2")),
      executeTurnAs(lastRound, fire(1, "side-3", "p2"))
    );
  });

  it("a salvo puts one token per missile in the air and is one use of the tile", () => {
    // p2 is out of reach of the launch flight, so every token is still flying.
    const state = launcher({ ring: 5, sector: 8 });
    const processed = processActions(
      state,
      [{ ...fire(1, "side-3", "p2", "side-1", undefined, 3), playerId: "p1" } as PlayerAction],
      { start: getShip(state, "p1") }
    );
    expect(processed.success).toBe(true);
    const launched = eventsOf(processed.events as never, "missile_launched");
    expect(launched).toHaveLength(3);
    expect(new Set(launched.map((e) => e.missileId)).size).toBe(3);
    expect(processed.state.missiles).toHaveLength(3);
    for (const missile of processed.state.missiles) {
      // Flown once already, and marked so the end of the turn leaves it be.
      expect(missile).toMatchObject({
        targetId: "p2",
        criticalTarget: "side-1",
        movesMade: 1,
        launchedThisTurn: true,
      });
    }
    expect(getSub(processed.state, "p1", "side-3").ammo).toBe(1);
    // Three rounds off the rail, and the tile is carrying its two cubes once:
    // two heat at the check, whatever the size of the salvo.
    expect(getSub(processed.state, "p1", "side-3").allocatedEnergy).toBe(2);
    expect(eventsOf(processed.events as never, "weapon_fired")[0]).toMatchObject({
      count: 3,
      heat: 2,
    });
  });

  // The last column is the nearest salvo the same tile fires.
  it.each([
    ["more missiles than the tile holds", 5, 4],
    ["no missiles at all", 0, 1],
    ["a fraction of a missile", 1.5, 1],
  ])("refuses a salvo of %s", (_label, count, legal) => {
    const salvo = (n: number) =>
      executeTurnAs(launcher(), fire(1, "side-3", "p2", "engines", undefined, n));
    const result = salvo(count);
    expectRefusedUnless(result, salvo(legal));
    expect(result.gameState.missiles).toEqual([]);
  });

  it("refuses a count on a weapon that is not a missiles tile", () => {
    // A laser to port with the target one ring out: a legal shot but for the count.
    const state = withPower(
      makeTwoPlayerGame(
        { ring: 3, sector: 0, loadout: LOADOUTS.laserOnly },
        { ring: 4, sector: 0 }
      ),
      "p1",
      "side-0",
      2
    );
    expect(executeTurnAs(state, fire(1, "side-0", "p2")).errors).toBeUndefined();
    expect(
      executeTurnAs(state, fire(1, "side-0", "p2", "engines", undefined, 2)).errors?.length
    ).toBeGreaterThan(0);
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
    ["before its ship moves", [fire(1, "side-3", "p2"), coast(2)]],
    ["before a burn", [fire(1, "side-3", "p2"), burn(2, "soft")]],
    ["with no move at all", [fire(1, "side-3", "p2")]],
  ])("a point-blank launch %s attacks that turn: no ride on the launch turn", (_label, actions) => {
    // Ring 3 drifts 4 a turn: a missile that rode it would land 4 sectors past
    // the target and fly only 3 back.
    const state = withPower(launcher({ ring: 3, sector: 0 }), "p1", "engines", 1);
    const result = executeTurnAs(state, ...actions);
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "attack_resolved")).toEqual([
      expect.objectContaining({ attackerId: "p1", targetId: "p2", weaponType: "missiles" }),
    ]);
    expect(result.gameState.missiles).toEqual([]);
  });
});

describe("missiles: movement at the end of the owner's turn", () => {
  it("a missile rides its orbit first on every turn after its launch", () => {
    // The target sits in another well, so the missile can only ride its orbit.
    const state = withMissile(
      withShip(makeTwoPlayerGame(), "p2", { wellId: ALPHA, ring: 3, sector: 0 }),
      { ring: 5, sector: 0, movesMade: 1 }
    );
    const result = processOwnerMissiles(state, "p1");
    expect(result.state.missiles[0]).toMatchObject({ ring: 5, sector: 1, movesMade: 2 });
  });

  it("on its launch flight flies up to 3 steps from where it was dropped (rings first)", () => {
    const result = executeTurnAs(launcher({ ring: 5, sector: 4 }), fire(1, "side-3", "p2"));
    // Launched R3 S0, no ride -> R4, R5 -> one sector toward S4 -> R5 S1.
    expect(eventsOf(result.events, "missile_moved")).toEqual([
      expect.objectContaining({
        ownerId: "p1",
        to: { wellId: BH, ring: 5, sector: 1 },
        movesLeft: 2,
      }),
    ]);
    expect(result.gameState.missiles[0]).toMatchObject({ ring: 5, sector: 1, movesMade: 1 });
  });

  it("keeps tracking across turns, riding its orbit, and attacks when it reaches the target", () => {
    let state = mustExecute(launcher({ ring: 5, sector: 4 }), fire(1, "side-3", "p2")); // missile R5 S1, p2 R5 S4
    state = mustExecute(state, coast(1)); // p2 drifts to S5
    const result = executeTurnAs(state, coast(1)); // missile drifts to S2 then steps 2->3->4->5
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
    const far = withMissile(makeTwoPlayerGame({}, { ring: 5, sector: 12 }), {
      ring: 1,
      sector: 0,
      movesMade: 2,
    });
    const result = processOwnerMissiles(far, "p1");
    expect(result.state.missiles).toEqual([]);
    expect(result.events).toEqual([
      expect.objectContaining({ type: "missile_expired", missileId: "m-1" }),
    ]);
  });

  it("only moves the active owner's missiles", () => {
    const state = withMissile(makeTwoPlayerGame({}, { ring: 5, sector: 12 }), {
      ring: 1,
      sector: 0,
      ownerId: "p2",
      targetId: "p1",
    });
    const result = processOwnerMissiles(state, "p1");
    expect(result.state.missiles).toEqual(state.missiles);
    expect(result.events).toEqual([]);
  });

  it.each([
    ["destroyed", (s: GameState) => withShip(s, "p2", { hitPoints: 0 })],
    ["not deployed", (s: GameState) => withPlayer(s, "p2", { hasDeployed: false })],
  ])("expires when its target is %s", (_label, setup) => {
    const state = withMissile(setup(makeTwoPlayerGame()), { ring: 3, sector: 12 });
    const result = processOwnerMissiles(state, "p1");
    expect(result.state.missiles).toEqual([]);
    expect(eventTypes(result.events as never)).toEqual(["missile_expired"]);
  });
});

describe("missiles: on the target's sector", () => {
  /** A missile already sitting where p2 will still be after its drift: p2 on R5 S12 (drift 1) -> S13; missile on R5 S12 drifts to S13. */
  const onTarget = (targetLoadout?: ShipLoadout) =>
    withMissile(makeTwoPlayerGame({}, { ring: 5, sector: 13, loadout: targetLoadout }), {
      ring: 5,
      sector: 12,
    });

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

  it("a rack that is up intercepts on 2+: used and revealed, its cubes left on it", () => {
    const state = withPower(onTarget(LOADOUTS.rack), "p2", "side-0", 2);
    const result = processOwnerMissiles(state, "p1");
    expect(eventsOf(result.events as never, "missile_intercepted")).toEqual([
      expect.objectContaining({ missileId: "m-1", targetId: "p2", roll: 5 }),
    ]);
    expect(eventTypes(result.events as never)).not.toContain("attack_resolved");
    expect(result.state.missiles).toEqual([]);
    const rack = getSub(result.state, "p2", "side-0");
    expect(rack).toMatchObject({ usedThisTurn: true, isRevealed: true, allocatedEnergy: 2 });
    expect(getShip(result.state, "p2").hitPoints).toBe(10);
    expect(eventsOf(result.events as never, "subsystem_revealed")[0]).toMatchObject({
      subsystemId: "side-0",
      reason: "intercepted",
    });
  });

  it.each([
    ["unpowered", (s: GameState) => s],
    [
      "broken",
      (s: GameState) =>
        withSub(withPower(s, "p2", "side-0", 2), "p2", "side-0", { isBroken: true }),
    ],
  ])("a rack that is %s does not intercept", (_label, setup) => {
    const result = processOwnerMissiles(setup(onTarget(LOADOUTS.rack)), "p1");
    expect(eventTypes(result.events as never)).not.toContain("missile_intercepted");
    expect(getShip(result.state, "p2").hitPoints).toBe(8);
  });

  /** `count` copies of the missile already sitting on the target's sector. */
  const salvoOf = (state: GameState, count: number): GameState => ({
    ...state,
    missiles: Array.from({ length: count }, (_, i) => ({ ...state.missiles[0], id: `m-${i + 1}` })),
  });

  it("one rack rolls at every missile of a salvo and is used once for the turn", () => {
    const state = withPower(salvoOf(onTarget(LOADOUTS.rack), 3), "p2", "side-0", 2);
    const result = processOwnerMissiles({ ...state, forcedRollValue: 5 }, "p1");
    const intercepts = eventsOf(result.events as never, "missile_intercepted");
    expect(intercepts).toHaveLength(3);
    expect(eventTypes(result.events as never)).not.toContain("attack_resolved");
    expect(result.state.missiles).toEqual([]);
    expect(getShip(result.state, "p2").hitPoints).toBe(10);
    expect(getSub(result.state, "p2", "side-0").allocatedEnergy).toBe(2);
  });

  it("a rack that keeps rolling 1 keeps rolling and every missile attacks", () => {
    // A 1 is a miss for the attack too, so the salvo does no damage here: what
    // is on trial is that the rack does not stop rolling after a miss, and that
    // a turn of misses still costs it only the one use.
    const state = withPower(salvoOf(onTarget(LOADOUTS.rack), 3), "p2", "side-0", 2);
    const result = processOwnerMissiles({ ...state, forcedRollValue: 1 }, "p1");
    expect(eventsOf(result.events as never, "missile_intercepted")).toHaveLength(3);
    expect(eventsOf(result.events as never, "attack_resolved")).toHaveLength(3);
    expect(getSub(result.state, "p2", "side-0").allocatedEnergy).toBe(2);
  });

  it("one rack answers four and the fifth gets through", () => {
    // Two cubes throw four missiles, so two cubes shoot four down: the rule is
    // the same number read from either end (RULES §Weapons -> Ballistic rack).
    const state = withPower(salvoOf(onTarget(LOADOUTS.rack), 5), "p2", "side-0", 2);
    const result = processOwnerMissiles({ ...state, forcedRollValue: 5 }, "p1");
    expect(eventsOf(result.events as never, "missile_intercepted")).toHaveLength(4);
    expect(getSub(result.state, "p2", "side-0").rollsThisTurn).toBe(4);
    // The one it could not roll at attacks.
    expect(eventsOf(result.events as never, "attack_resolved")).toHaveLength(1);
    expect(getShip(result.state, "p2").hitPoints).toBe(8);
  });

  it("a second rack answers the next four, and pays its own cubes", () => {
    const two = withPower(
      withPower(salvoOf(onTarget(LOADOUTS.twoRacks), 5), "p2", "side-0", 2),
      "p2",
      "side-2",
      2
    );
    const result = processOwnerMissiles({ ...two, forcedRollValue: 5 }, "p1");
    expect(eventsOf(result.events as never, "missile_intercepted")).toHaveLength(5);
    expect(eventTypes(result.events as never)).not.toContain("attack_resolved");
    expect(getShip(result.state, "p2").hitPoints).toBe(10);
    // The first rack spent its four, the second took the fifth and turned over.
    expect(getSub(result.state, "p2", "side-0").rollsThisTurn).toBe(4);
    expect(getSub(result.state, "p2", "side-2")).toMatchObject({
      rollsThisTurn: 1,
      isRevealed: true,
    });
  });

  it.each([
    // [label, missiles, racks up, roll, heat added]
    ["one missile shot down", 1, 1, 5, 2],
    ["a salvo of four shot down", 4, 1, 5, 2],
    ["a salvo of four, every roll a miss", 4, 1, 1, 2],
    ["five against two racks: both answer", 5, 2, 5, 4],
    ["two against two racks: only the first answers", 2, 2, 5, 2],
    ["two against a rack that is down", 2, 0, 5, 0],
  ])(
    "answering puts 2 heat on the track once a rack a turn: %s",
    (_label, count, racks, roll, heat) => {
      const loadout = racks === 2 ? LOADOUTS.twoRacks : LOADOUTS.rack;
      let state = salvoOf(onTarget(loadout), count);
      if (racks >= 1) state = withPower(state, "p2", "side-0", 2);
      if (racks === 2) state = withPower(state, "p2", "side-2", 2);
      const result = processOwnerMissiles({ ...state, forcedRollValue: roll }, "p1");
      expect(getShip(result.state, "p2").heat.currentHeat).toBe(heat);
    }
  );

  it("one rack is enough for a salvo of two, and the second stays a secret", () => {
    const two = withPower(
      withPower(salvoOf(onTarget(LOADOUTS.twoRacks), 2), "p2", "side-0", 2),
      "p2",
      "side-2",
      2
    );
    const result = processOwnerMissiles({ ...two, forcedRollValue: 5 }, "p1");
    expect(eventsOf(result.events as never, "missile_intercepted")).toHaveLength(2);
    expect(getShip(result.state, "p2").hitPoints).toBe(10);
    expect(getSub(result.state, "p2", "side-2").isRevealed).toBe(false);
  });

  it("the count is per player-turn: a rack that spent its four answers again next turn", () => {
    const state = withPower(salvoOf(onTarget(LOADOUTS.rack), 4), "p2", "side-0", 2);
    const spent = processOwnerMissiles({ ...state, forcedRollValue: 5 }, "p1");
    expect(getSub(spent.state, "p2", "side-0").rollsThisTurn).toBe(4);
    // `finish` clears it for everyone when play passes (game/turns.ts).
    const fresh = {
      ...spent.state,
      players: spent.state.players.map((p) => ({ ...p, ship: resetSubsystemUsage(p.ship) })),
    };
    expect(getSub(fresh, "p2", "side-0").rollsThisTurn).toBe(0);
  });

  /**
   * A ship just back from Home is untouchable until the turn it plays next is
   * over (RULES §Destruction and Respawn): the missile finds nothing to hit and
   * nothing to shoot it down, so it flies on with one more move behind it.
   */
  it("slides past a recovering target: no attack, no interception, still in the air", () => {
    const state = withPlayer(withPower(onTarget(LOADOUTS.rack), "p2", "side-0", 2), "p2", {
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
});

describe("missiles: lost with their ship", () => {
  /** p1 (active) kills p2 with a missile; p2 has one of its own in flight far away. */
  function killWithMissileInFlight(): GameState {
    let state = makeGameState([
      makePlayer("p1", { wellId: BH, ring: 5, sector: 10 }),
      makePlayer("p2", { wellId: BH, ring: 5, sector: 13 }),
    ]);
    state = withShip(state, "p2", { hitPoints: 2 });
    state = withMissile(state, { ring: 5, sector: 12 });
    return withMissile(state, { ring: 1, sector: 0, id: "m-p2", ownerId: "p2", targetId: "p1" });
  }

  it("a destroyed ship's missiles in flight are removed", () => {
    const result = executeTurnAs(killWithMissileInFlight(), coast(1));
    expect(eventsOf(result.events, "ship_destroyed")).toEqual([
      expect.objectContaining({ victimId: "p2" }),
    ]);
    expect(result.gameState.missiles.filter((m) => m.ownerId === "p2")).toEqual([]);
    expect(eventsOf(result.events, "missile_expired")).toEqual([
      expect.objectContaining({ missileId: "m-p2", ownerId: "p2" }),
    ]);
  });

  it("they never move or attack on the owner's respawn turn or the quiet turn after", () => {
    let state = mustExecute(killWithMissileInFlight(), coast(1));
    const later: string[] = [];
    // p2 respawns, p1 coasts, p2 plays its quiet turn.
    for (let turn = 0; turn < 3; turn++) {
      const result = executeTurnAs(state, coast(1));
      expect(result.errors).toBeUndefined();
      for (const e of result.events) {
        if (e.type === "missile_moved" || e.type === "missile_expired") later.push(e.missileId);
        if (e.type === "attack_resolved" && e.attackerId === "p2") later.push(e.type);
      }
      state = result.gameState;
    }
    expect(later).toEqual([]);
    expect(state.missiles.some((m) => m.ownerId === "p2")).toBe(false);
  });

  it("a ship that dies at its own heat check loses the missiles that just moved", () => {
    let state = makeTwoPlayerGame({ ring: 3, sector: 0 }, { ring: 1, sector: 12 });
    state = withShip(state, "p1", { hitPoints: 1, heat: { currentHeat: 30 } });
    state = withMissile(state, { ring: 3, sector: 6, targetId: "p2" });
    const result = executeTurnAs(state, coast(1));
    expect(eventTypes(result.events)).toEqual(
      expect.arrayContaining(["missile_moved", "ship_destroyed", "missile_expired"])
    );
    expect(result.gameState.missiles).toEqual([]);
  });
});

describe("missiles: the launch flight resolves at its place in the turn", () => {
  /**
   * The designer's table: p1 (sensor bow, a launcher on side-0, a disruptor on
   * side-1) one sector astern of p2, whose wall holds one cube. A missile
   * from there lands on its launch flight, and so does the EMP's box.
   */
  const wallState = () =>
    withPower(
      makeTwoPlayerGame(
        { ring: 3, sector: 0, loadout: LOADOUTS.sensorMissilesDisruptor },
        { ring: 3, sector: 1 }
      ),
      "p2",
      "side-2",
      1
    );

  it.each<[string, Draft[], boolean]>([
    // The missile's 2 damage takes the cube, so the wall is down when the EMP comes.
    [
      "salvo, then disruptor: the wall is down when the EMP comes",
      [fire(1, "side-0", "p2"), fire(2, "side-1", "p2", "side-1")],
      false,
    ],
    [
      "disruptor, then salvo: the wall still holds its cube",
      [fire(1, "side-1", "p2", "side-1"), fire(2, "side-0", "p2")],
      true,
    ],
  ])("%s", (_label, actions, blocked) => {
    const result = executeTurnAs(wallState(), ...actions);
    expect(result.errors).toBeUndefined();
    const attacks = eventsOf(result.events, "attack_resolved");
    const emp = attacks.find((e) => e.weaponType === "disruptor")!;
    expect(emp.blocked === true).toBe(blocked);
    expect(getSub(result.gameState, "p2", "side-1").isBroken).toBe(!blocked);
    // The missile landed either way, its one point soaked by the wall.
    expect(attacks.find((e) => e.weaponType === "missiles")).toMatchObject({
      absorbed: 1,
      toHull: 1,
    });
  });

  it.each<[string, Draft, "fire_weapon" | "scan"]>([
    ["a disruptor", fire(2, "side-1", "p2", "side-1"), "fire_weapon"],
    ["a scan", scan(2, "p2"), "scan"],
  ])(
    "a salvo that kills on its launch flight leaves %s after it nothing to aim at",
    (_label, later, skipped) => {
      const state = withShip(wallState(), "p2", { hitPoints: 2 });
      const result = executeTurnAs(
        withPower(state, "p2", "side-2", 0),
        fire(1, "side-0", "p2"),
        later
      );
      expect(result.errors).toBeUndefined();
      const types = eventTypes(result.events);
      // The kill comes before the later action is reached, and is the launcher's.
      expect(eventsOf(result.events, "ship_destroyed")).toEqual([
        expect.objectContaining({ victimId: "p2", killerId: "p1", cause: "missile" }),
      ]);
      expect(eventsOf(result.events, "action_skipped")).toEqual([
        expect.objectContaining({ action: skipped, targetId: "p2", reason: "target_destroyed" }),
      ]);
      expect(types.indexOf("ship_destroyed")).toBeLessThan(types.indexOf("action_skipped"));
      // Settled like any kill: the wreck is left where the ship died.
      expect(eventsOf(result.events, "wreck_left")).toEqual([
        expect.objectContaining({ victimId: "p2", at: { wellId: BH, ring: 3, sector: 1 } }),
      ]);
    }
  );

  it.each([
    // [label, actions, the sector the launch flight leaves it on, and the next turn's flight]
    ["launched before a coast", [fire(1, "side-3", "p2"), coast(2)], 1, 5],
    ["launched after a coast", [coast(1), fire(2, "side-3", "p2")], 5, 9],
  ])(
    "a missile that misses on its launch flight (%s) flies once that turn and once the next",
    (_label, actions, launchSector, flewTo) => {
      // p2 on ring 5, out of reach: the flight spends two steps on the rings.
      const state = launcher({ ring: 5, sector: 10 });
      const first = executeTurnAs(state, ...actions);
      expect(first.errors).toBeUndefined();
      expect(eventsOf(first.events, "missile_moved")).toEqual([
        expect.objectContaining({
          to: { wellId: BH, ring: 5, sector: launchSector },
          movesLeft: 2,
        }),
      ]);
      // Nothing more moved it at the end of the turn, nor did its ship's move.
      const [flying] = first.gameState.missiles;
      expect(flying).toMatchObject({ ring: 5, sector: launchSector, movesMade: 1 });
      expect(flying.launchedThisTurn).toBeUndefined();

      const next = executeTurnAs(mustExecute(first.gameState, coast(1)), coast(1));
      expect(next.errors).toBeUndefined();
      // Ring 5 rides one sector, then three steps toward p2 (now on S11).
      expect(eventsOf(next.events, "missile_moved")).toEqual([
        expect.objectContaining({ to: { wellId: BH, ring: 5, sector: flewTo }, movesLeft: 1 }),
      ]);
    }
  );

  it.each([
    [
      "the sensor powered before the launch",
      [power(1, "forward-0"), fire(2, "side-0", "p2")],
      "critical",
    ],
    [
      "the sensor powered after the launch",
      [fire(1, "side-0", "p2"), power(2, "forward-0")],
      "hit",
    ],
    ["no sensor at all", [fire(1, "side-0", "p2")], "hit"],
  ])("a launch flight with %s rolls its 8 as a %s", (_label, actions, expected) => {
    const state = { ...wallState(), forcedRollValue: 8 };
    const result = executeTurnAs(withPower(state, "p2", "side-2", 0), ...actions);
    expect(result.errors).toBeUndefined();
    const [attack] = eventsOf(result.events, "attack_resolved");
    expect(attack).toMatchObject({ weaponType: "missiles", result: expected });
  });
});
