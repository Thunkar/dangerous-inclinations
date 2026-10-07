import { describe, it, expect } from "vitest";
import { PLANET_OUTER_RING } from "../../models/gravityWells.ts";
import { isInWeaponRange } from "../../game/targeting.ts";
import { getSubsystemSide } from "../../game/ship.ts";
import { missileCanReach } from "../../game/missiles.ts";
import { getSubsystemConfig } from "../../models/subsystems.ts";
import type { Facing, GameState, Position } from "../../models/game.ts";
import { FIRST_TURN } from "../../models/game.ts";
import {
  LOADOUTS,
  ALPHA,
  BH,
  burn,
  coast,
  eventsOf,
  eventTypes,
  executeTurnAs,
  expectRefused,
  expectRefusedUnless,
  fire,
  getShip,
  getSub,
  jump,
  makeGameState,
  makePlayer,
  makeTwoPlayerGame,
  scan,
  withPower,
  withShip,
  at,
  attackerAt,
} from "../testUtils.ts";

describe("weapons: sides", () => {
  it("side slots 0-1 are port and 2-3 starboard; fixed and forward tiles have no side", () => {
    const ship = getShip(makeTwoPlayerGame(), "p1");
    const side = (id: string) => getSubsystemSide(ship.subsystems.find((s) => s.id === id)!);
    expect([side("side-0"), side("side-1"), side("side-2"), side("side-3")]).toEqual([
      "port",
      "port",
      "starboard",
      "starboard",
    ]);
    expect(side("forward-0")).toBeNull();
    expect(side("engines")).toBeNull();
  });
});

describe("weapons: the opening round reaches nobody", () => {
  const sameSector = (turn: number) => {
    const game = makeTwoPlayerGame({}, { ring: 3, sector: 0 }, { turn });
    return withPower(game, "p1", "forward-0", 4);
  };
  /**
   * Everyone deploys on the same ring, so before anyone has moved the table is
   * a firing line and every loadout is within sensor range. The rule is about the
   * round, not about the ship: a seat that has already taken its turn is no
   * more allowed to shoot than the one that has not.
   */
  const sensing = (turn: number) => {
    const game = makeTwoPlayerGame(
      { loadout: LOADOUTS.sensorLaserMissiles },
      { ring: 3, sector: 1 },
      { turn }
    );
    return withPower(game, "p1", "forward-0", getSubsystemConfig("sensor_array").minEnergy);
  };

  it.each([
    ["a shot", FIRST_TURN, "weapon_fired", sameSector, () => fire(1, "forward-0", "p2")],
    ["a scan", FIRST_TURN, "scanned", sensing, () => scan(1, "p2", "side-0")],
  ])("refuses %s in the first round", (_what, turn, event, build, action) => {
    const result = executeTurnAs(build(turn), action());
    expectRefusedUnless(result, executeTurnAs(build(turn + 1), action()));
    expect(eventTypes(result.events)).not.toContain(event);
  });
});

describe("weapons: railgun range (spinal)", () => {
  const railgun = getSub(makeTwoPlayerGame(), "p1", "forward-0");

  it.each<[string, Facing, Position, boolean]>([
    ["point blank", "prograde", at(3, 0), true],
    ["1 ahead", "prograde", at(3, 1), true],
    ["5 ahead", "prograde", at(3, 5), true],
    ["6 ahead", "prograde", at(3, 6), false],
    ["1 behind", "prograde", at(3, 23), false],
    ["ahead but one ring out", "prograde", at(4, 2), false],
    // Retrograde, ahead is decreasing sectors, wrapping at 0.
    ["1 ahead", "retrograde", at(3, 23), true],
    ["1 behind", "retrograde", at(3, 1), false],
  ])("at R3 S0: %s facing %s -> %s", (_label, facing, target, expected) => {
    expect(isInWeaponRange(railgun, attackerAt(3, 0, facing), target)).toBe(expected);
  });
});

describe("weapons: laser range (broadside, side-restricted)", () => {
  const port = getSub(makeTwoPlayerGame(), "p1", "side-0");
  const starboard = getSub(makeTwoPlayerGame({ loadout: LOADOUTS.starboardLaser }), "p1", "side-2");
  const lasers = { port, starboard };

  // A port laser fires outward facing prograde and inward facing retrograde,
  // a starboard one the other way, and reaches two rings that way only.
  it.each<[string, keyof typeof lasers, number, Facing, Position, boolean]>([
    ["point blank", "port", 3, "prograde", at(3, 0), true],
    ["one ring out, same sector", "port", 3, "prograde", at(4, 0), true],
    ["one ring out, +1 sector", "port", 3, "prograde", at(4, 1), true],
    ["one ring out, -1 sector (wrap)", "port", 3, "prograde", at(4, 23), true],
    ["two rings out", "port", 3, "prograde", at(5, 0), true],
    ["one ring out, +2 sectors", "port", 3, "prograde", at(4, 2), false],
    ["same ring", "port", 3, "prograde", at(3, 1), false],
    ["one ring in (wrong side)", "port", 3, "prograde", at(2, 0), false],
    ["two rings out from ring 1", "port", 1, "prograde", at(3, 0), true],
    ["three rings out from ring 1", "port", 1, "prograde", at(4, 0), false],
    ["one ring in", "port", 3, "retrograde", at(2, 0), true],
    ["one ring out", "port", 3, "retrograde", at(4, 0), false],
    ["one ring in", "starboard", 3, "prograde", at(2, 0), true],
    ["two rings in, +1 sector", "starboard", 3, "prograde", at(1, 1), true],
    ["one ring out", "starboard", 3, "prograde", at(4, 0), false],
    ["two rings out", "starboard", 3, "retrograde", at(5, 0), true],
  ])("%s: %s laser at R%i S0 facing %s -> %s", (_label, side, ring, facing, target, expected) => {
    expect(isInWeaponRange(lasers[side], attackerAt(ring, 0, facing), target)).toBe(expected);
  });
});

describe("weapons: ballistic rack range", () => {
  const rack = getSub(makeTwoPlayerGame({ loadout: LOADOUTS.racksAndMissiles }), "p1", "side-0");
  const starboardRack = getSub(
    makeTwoPlayerGame({ loadout: LOADOUTS.racksAndMissiles }),
    "p1",
    "side-2"
  );

  it.each([
    ["point blank", at(3, 0), true],
    ["same ring, +1", at(3, 1), true],
    ["same ring, -1 (wrap)", at(3, 23), true],
    ["same ring, +2", at(3, 2), false],
    ["one ring out, +1", at(4, 1), true],
    ["one ring in, -1", at(2, 23), true],
    ["two rings out", at(5, 0), false],
  ])("rack at R3 S0: %s -> %s", (_label, target, expected) => {
    expect(isInWeaponRange(rack, attackerAt(3, 0), target)).toBe(expected);
    expect(isInWeaponRange(starboardRack, attackerAt(3, 0), target)).toBe(expected);
  });
});

describe("weapons: missile range (turret)", () => {
  const launcher = getSub(makeTwoPlayerGame(), "p1", "side-3");

  // A missile is self-guided: anything in the well can be launched at, however
  // far, and whether it catches up is the missile's problem (missileCanReach).
  it.each([
    ["a ship sharing the launcher's sector", at(3, 0)],
    ["two rings out and past the far side of the ring", at(5, 14)],
  ])("missiles at R3 S0 may be launched at %s", (_label, target) => {
    expect(isInWeaponRange(launcher, attackerAt(3, 0), target)).toBe(true);
    expect(isInWeaponRange(launcher, attackerAt(3, 0, "retrograde"), target)).toBe(true);
  });

  // The flight is the range: three moves of three steps, with the missile
  // drifting before every move but the first, and the target after each one.
  // From R3 S0 that reaches nine sectors either way round the ring, not the far side.
  it.each([
    ["two sectors away", at(3, 2), true],
    ["nine sectors ahead", at(3, 9), true],
    ["ten sectors ahead", at(3, 10), false],
    ["the far side of the ring", at(3, 12), false],
    ["nine sectors behind", at(3, 15), true],
    ["two rings in, three sectors", at(1, 3), true],
    ["two rings in, half the ring away", at(1, 12), false],
  ])("a missile launched at R3 S0 at a target %s: reaches %s", (_label, target, expected) => {
    expect(missileCanReach(at(3, 0), target)).toBe(expected);
  });
});

describe("weapons: firing", () => {
  /** p1 at R3 S0 with a port laser, p2 one ring out. Firing powers the laser. */
  const duel = (targetSector = 0) =>
    makeTwoPlayerGame({ ring: 3, sector: 0 }, { ring: 4, sector: targetSector });

  it("firing uses the weapon, reveals it, heats it and resolves an attack", () => {
    const result = executeTurnAs(duel(), fire(1, "side-0", "p2"));
    expect(result.errors).toBeUndefined();
    expect(eventTypes(result.events).slice(0, 3)).toEqual([
      "weapon_fired",
      "subsystem_revealed",
      "attack_resolved",
    ]);
    expect(eventsOf(result.events, "weapon_fired")[0]).toMatchObject({
      attackerId: "p1",
      targetId: "p2",
      subsystemId: "side-0",
      weaponType: "laser",
      heat: 2,
    });
    expect(eventsOf(result.events, "subsystem_revealed")[0]).toMatchObject({
      playerId: "p1",
      subsystemId: "side-0",
      reason: "fired",
    });
    expect(getSub(result.gameState, "p1", "side-0").isRevealed).toBe(true);
    expect(getShip(result.gameState, "p2").hitPoints).toBe(8);
  });

  it.each([
    // In range from S0, out of range from S4 after the drift.
    [
      "fire, then coast",
      1,
      [fire(1, "side-0", "p2"), coast(2)],
      [coast(1), fire(2, "side-0", "p2")],
    ],
    // Out of range from S0, in range from S4.
    [
      "coast, then fire",
      4,
      [coast(1), fire(2, "side-0", "p2")],
      [fire(1, "side-0", "p2"), coast(2)],
    ],
  ])(
    "range is checked when the shot executes: %s reaches a target on S%i",
    (_label, sector, taken, refused) => {
      const state = duel(sector);
      expectRefusedUnless(executeTurnAs(state, ...refused), executeTurnAs(state, ...taken));
    }
  );

  it("after a jump the shot is measured from the destination", () => {
    // BH R5 S17 jumps along Alpha's outbound lane to Alpha R3 S5.
    let state = makeGameState([
      makePlayer("p1", { wellId: BH, ring: 5, sector: 17 }, LOADOUTS.starboardLaser),
      makePlayer("p2", { wellId: ALPHA, ring: 2, sector: 5 }),
    ]);
    state = withPower(state, "p1", "side-2", 2);
    const result = executeTurnAs(state, jump(1, ALPHA), fire(2, "side-2", "p2"));
    expectRefusedUnless(executeTurnAs(state, fire(1, "side-2", "p2"), jump(2, ALPHA)), result);
    expect(getShip(result.gameState, "p2").hitPoints).toBe(8);
  });

  it("each weapon fires once per turn, but two lasers are two weapons", () => {
    const state = withPower(duel(), "p1", "side-1", 2);
    const result = executeTurnAs(state, fire(1, "side-0", "p2"), fire(2, "side-1", "p2"));
    expectRefusedUnless(
      executeTurnAs(state, fire(1, "side-0", "p2"), fire(2, "side-0", "p2")),
      result
    );
    expect(getShip(result.gameState, "p2").hitPoints).toBe(6);
  });

  it.each([
    ["in another well", "p2", (state: GameState) => withShip(state, "p2", { wellId: ALPHA })],
    ["not at the table", "p9", (state: GameState) => state],
  ])("rejects firing at a target %s", (_label, target, setup) => {
    const state = setup(duel());
    const result = executeTurnAs(state, fire(1, "side-0", target));
    expectRefused(result, state);
    expectRefusedUnless(result, executeTurnAs(duel(), fire(1, "side-0", "p2")));
  });

  it("rejects a critical target that is not a slot on the target's ship", () => {
    expectRefusedUnless(
      executeTurnAs(duel(), fire(1, "side-0", "p2", "side-7")),
      executeTurnAs(duel(), fire(1, "side-0", "p2", "side-3"))
    );
  });
});

describe("weapons: railgun recoil", () => {
  /** p1 at R3 S0 with a powered railgun; p2 two sectors ahead on the same ring. */
  // No cubes placed: the shot powers the railgun and the compensation powers
  // the engines.
  const gunline = (facing: Facing = "prograde", ring = 3) =>
    makeTwoPlayerGame(
      { ring, sector: 0, facing },
      { ring, sector: facing === "prograde" ? 2 : 22 }
    );

  it("an uncompensated shot pushes the ship one ring against its facing", () => {
    // The shot goes forward, so the ship goes back: prograde, inward.
    const prograde = executeTurnAs(gunline("prograde"), fire(1, "forward-0", "p2"));
    expect(prograde.errors).toBeUndefined();
    expect(getShip(prograde.gameState, "p1").ring).toBe(2);
    // A railgun does 4 damage.
    expect(getShip(prograde.gameState, "p2").hitPoints).toBe(6);
    expect(eventsOf(prograde.events, "recoil")[0]).toMatchObject({
      playerId: "p1",
      compensated: false,
      to: { wellId: BH, ring: 2 },
      massSpent: 0,
      heat: 0,
    });

    const retrograde = executeTurnAs(gunline("retrograde"), fire(1, "forward-0", "p2"));
    expect(retrograde.errors).toBeUndefined();
    expect(getShip(retrograde.gameState, "p1").ring).toBe(4);
  });

  it("recoil happens before later actions: a broadside can use the new ring", () => {
    let state = makeGameState([
      makePlayer("p1", { wellId: BH, ring: 3, sector: 0 }, LOADOUTS.starboardLaser),
      makePlayer("p2", { wellId: BH, ring: 3, sector: 2 }),
      makePlayer("p3", { wellId: BH, ring: 3, sector: 1 }),
    ]);
    state = withPower(state, "p1", "side-0", 2);
    // From R3 the port laser cannot hit p3 on R3; after the recoil to R2 it fires outward at R3.
    const result = executeTurnAs(state, fire(1, "forward-0", "p2"), fire(2, "side-0", "p3"));
    expectRefusedUnless(executeTurnAs(state, fire(1, "side-0", "p3")), result);
    expect(getShip(result.gameState, "p3").hitPoints).toBe(8);
  });

  it("compensating costs 1 mass and a soft burn's cube on the engines", () => {
    const result = executeTurnAs(gunline(), fire(1, "forward-0", "p2", "engines", true));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1")).toMatchObject({ ring: 3, reactionMass: 9 });
    expect(eventsOf(result.events, "recoil")[0]).toMatchObject({
      compensated: true,
      massSpent: 1,
      heat: 1,
    });
    expect(eventsOf(result.events, "recoil")[0]).not.toHaveProperty("to");
  });

  it("compensation uses the engines for the turn: a burn afterwards is rejected, and vice versa", () => {
    const state = gunline();
    expectRefusedUnless(
      executeTurnAs(state, fire(1, "forward-0", "p2", "engines", true), burn(2, "soft")),
      executeTurnAs(state, fire(1, "forward-0", "p2", "engines", true))
    );
    // Burning first: p2 waits two sectors ahead of where the burn lands (R4
    // S4), so the railgun reaches it and only the compensation is refused.
    const afterBurn = makeTwoPlayerGame({ ring: 3, sector: 0 }, { ring: 4, sector: 6 });
    expectRefusedUnless(
      executeTurnAs(afterBurn, burn(1, "soft"), fire(2, "forward-0", "p2", "engines", true)),
      executeTurnAs(afterBurn, burn(1, "soft"), fire(2, "forward-0", "p2"))
    );
  });

  it("compensation needs a unit of mass, and nothing else", () => {
    const dry = withShip(gunline(), "p1", { reactionMass: 0 });
    const lastUnit = withShip(gunline(), "p1", { reactionMass: 1 });
    expectRefusedUnless(
      executeTurnAs(dry, fire(1, "forward-0", "p2", "engines", true)),
      executeTurnAs(lastUnit, fire(1, "forward-0", "p2", "engines", true))
    );
    // Four cubes on the railgun and one on the engines is five heat, which is
    // a price and no longer a refusal: nothing caps what a ship may light.
    const result = executeTurnAs(gunline(), fire(1, "forward-0", "p2", "engines", true));
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "heat_check")[0].cubes).toBe(5);
  });

  it("an uncompensated shot that would push the ship off the rings is rejected", () => {
    // Compensated, the same shot stays put and is taken.
    for (const [facing, ring] of [
      ["prograde", 1],
      ["retrograde", 5],
    ] as const) {
      expectRefusedUnless(
        executeTurnAs(gunline(facing, ring), fire(1, "forward-0", "p2")),
        executeTurnAs(gunline(facing, ring), fire(1, "forward-0", "p2", "engines", true))
      );
    }
  });

  it.each([
    ["prograde on a planet's innermost ring", "prograde", 1, false],
    ["prograde one ring outside it", "prograde", 2, true],
    ["retrograde on a planet's outer ring", "retrograde", PLANET_OUTER_RING, false],
    ["retrograde one ring inside it", "retrograde", PLANET_OUTER_RING - 1, true],
  ] as const)(
    "the well's own ring count decides: firing %s is allowed = %s",
    (_label, facing, ring, allowed) => {
      // Sector 6, clear of the station (sector 0 of ring 2 at the start).
      const state = withPower(
        makeTwoPlayerGame(
          { wellId: ALPHA, ring, sector: 6, facing },
          { wellId: ALPHA, ring, sector: facing === "prograde" ? 8 : 4 }
        ),
        "p1",
        "forward-0",
        4
      );
      const result = executeTurnAs(state, fire(1, "forward-0", "p2"));
      expect(result.errors === undefined).toBe(allowed);
      // The recoil pushes one ring against the facing, or nowhere.
      expect(getShip(result.gameState, "p1").ring).toBe(
        allowed ? ring + (facing === "prograde" ? -1 : 1) : ring
      );
    }
  );

  it("a killing shot destroys the target and credits the attacker", () => {
    const state = withShip(gunline(), "p2", { hitPoints: 4 });
    const result = executeTurnAs(state, fire(1, "forward-0", "p2"));
    expect(getShip(result.gameState, "p2").hitPoints).toBe(0);
    expect(eventsOf(result.events, "ship_destroyed")).toEqual([
      expect.objectContaining({ victimId: "p2", killerId: "p1", cause: "weapon" }),
    ]);
  });
});

describe("weapons: shots at a ship destroyed earlier this turn are skipped", () => {
  it("a laser kill followed by a missile at the same target skips the missile instead of failing the turn", () => {
    let state = makeTwoPlayerGame({ ring: 3, sector: 0 }, { ring: 4, sector: 0 });
    state = withPower(state, "p1", "side-0", 2); // port laser fires outward when prograde
    state = withPower(state, "p1", "side-3", 2); // missiles
    state = withShip(state, "p2", { hitPoints: 2 });
    const result = executeTurnAs(state, fire(1, "side-0", "p2"), fire(2, "side-3", "p2"), coast(3));
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "ship_destroyed")).toHaveLength(1);
    expect(eventsOf(result.events, "action_skipped")[0]).toMatchObject({
      playerId: "p1",
      action: "fire_weapon",
      targetId: "p2",
      reason: "target_destroyed",
    });
    expect(eventsOf(result.events, "missile_launched")).toHaveLength(0);
    expect(getSub(result.gameState, "p1", "side-3").ammo).toBe(4);
  });

  it("a shot at a ship that was already dead before the turn is still rejected", () => {
    let state = makeTwoPlayerGame({ ring: 3, sector: 0 }, { ring: 4, sector: 0 });
    state = withPower(state, "p1", "side-0", 2);
    const alive = state;
    state = withShip(state, "p2", { hitPoints: 0 });
    const result = executeTurnAs(state, fire(1, "side-0", "p2"), coast(2));
    expectRefused(result, state);
    expectRefusedUnless(result, executeTurnAs(alive, fire(1, "side-0", "p2"), coast(2)));
  });
});
