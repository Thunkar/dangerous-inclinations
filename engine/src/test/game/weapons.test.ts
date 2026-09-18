import { describe, it, expect } from "vitest";
import { calculateFiringSolutions, isInWeaponRange } from "../../game/targeting.ts";
import { getSideFiringDirection, getSubsystemSide } from "../../game/ship.ts";
import { missileCanReach } from "../../game/missiles.ts";
import { getSubsystemConfig } from "../../models/subsystems.ts";
import type { Facing, ShipLoadout } from "../../models/game.ts";
import { FIRST_TURN } from "../../models/game.ts";
import {
  ALPHA,
  BH,
  burn,
  coast,
  eventsOf,
  eventTypes,
  executeTurnAs,
  fire,
  getShip,
  getSub,
  jump,
  makeGameState,
  makePlayer,
  makeTwoPlayerGame,
  mustExecute,
  scan,
  withPlayer,
  withPower,
  withShip,
  withSub,
} from "../testUtils.ts";

const STARBOARD_LASER: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["laser", "shields", "laser", "missiles"],
};
const RACKS: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["ballistic_rack", "laser", "ballistic_rack", "missiles"],
};

const attackerAt = (ring: number, sector: number, facing: Facing = "prograde") => ({
  wellId: BH,
  ring,
  sector,
  facing,
});
const at = (ring: number, sector: number, wellId = BH) => ({ wellId, ring, sector });

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

  it.each([
    ["port", "prograde", "outward"],
    ["starboard", "prograde", "inward"],
    ["port", "retrograde", "inward"],
    ["starboard", "retrograde", "outward"],
  ] as const)("%s fires %s when %s", (side, facing, direction) => {
    expect(getSideFiringDirection(side, facing)).toBe(direction);
  });
});

describe("weapons: point blank", () => {
  const game = makeTwoPlayerGame();
  const here = at(3, 0);
  it.each([
    ["railgun (spinal, wants a target ahead)", "forward-0", makeTwoPlayerGame()],
    ["laser (broadside, wants a side to fire toward)", "side-0", makeTwoPlayerGame()],
    ["rack (broadside, same ring but one sector off)", "side-0", makeTwoPlayerGame({ loadout: RACKS })],
  ])("%s reaches a ship in its own sector", (_label, slot, state) => {
    expect(isInWeaponRange(getSub(state, "p1", slot), attackerAt(3, 0), here)).toBe(true);
  });

  it("holds from either facing: there is no ahead or behind at zero range", () => {
    const railgun = getSub(game, "p1", "forward-0");
    expect(isInWeaponRange(railgun, { ...attackerAt(3, 0), facing: "retrograde" }, here)).toBe(true);
  });
});

describe("weapons: the opening round reaches nobody", () => {
  /**
   * Everyone deploys on the same ring, so before anyone has moved the table is
   * a firing line and every mat is within sensor range. The rule is about the
   * round, not about the ship: a seat that has already taken its turn is no
   * more allowed to shoot than the one that has not.
   */
  const SENSING: ShipLoadout = {
    forwardSlots: ["sensor_array"],
    sideSlots: ["laser", "shields", "radiator", "missiles"],
  };
  const sameSector = (turn: number) => {
    const game = makeTwoPlayerGame({}, { ring: 3, sector: 0 }, { turn });
    return withPower(game, "p1", "forward-0", 4);
  };
  const sensing = (turn: number) => {
    const game = makeTwoPlayerGame({ loadout: SENSING }, { ring: 3, sector: 1 }, { turn });
    return withPower(game, "p1", "forward-0", getSubsystemConfig("sensor_array").minEnergy);
  };

  it.each([
    ["a shot", FIRST_TURN, "weapon_fired", sameSector, () => fire(1, "forward-0", "p2")],
    ["a scan", FIRST_TURN, "scanned", sensing, () => scan(1, "p2", "side-0")],
  ])("refuses %s in the first round", (_what, turn, event, build, action) => {
    const result = executeTurnAs(build(turn), action());
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(eventTypes(result.events)).not.toContain(event);
  });

  it.each([
    ["the shot", "weapon_fired", sameSector, () => fire(1, "forward-0", "p2")],
    ["the scan", "scanned", sensing, () => scan(1, "p2", "side-0")],
  ])("allows %s in the second", (_what, event, build, action) => {
    const result = executeTurnAs(build(FIRST_TURN + 1), action());
    expect(result.errors ?? []).toEqual([]);
    expect(eventTypes(result.events)).toContain(event);
  });
});

describe("weapons: railgun range (spinal)", () => {
  const railgun = getSub(makeTwoPlayerGame(), "p1", "forward-0");

  it.each([
    ["1 ahead", at(3, 1), true],
    ["5 ahead", at(3, 5), true],
    ["6 ahead", at(3, 6), false],
    ["1 behind", at(3, 23), false],
    ["same sector (point blank)", at(3, 0), true],
    ["ahead but one ring out", at(4, 2), false],
  ])("prograde at R3 S0: %s -> %s", (_label, target, expected) => {
    expect(isInWeaponRange(railgun, attackerAt(3, 0), target)).toBe(expected);
  });

  it("retrograde flips 'ahead' to decreasing sectors, wrapping at 0", () => {
    expect(isInWeaponRange(railgun, attackerAt(3, 0, "retrograde"), at(3, 23))).toBe(true);
    expect(isInWeaponRange(railgun, attackerAt(3, 0, "retrograde"), at(3, 19))).toBe(true);
    expect(isInWeaponRange(railgun, attackerAt(3, 0, "retrograde"), at(3, 18))).toBe(false);
    expect(isInWeaponRange(railgun, attackerAt(3, 0, "retrograde"), at(3, 1))).toBe(false);
  });
});

describe("weapons: laser range (broadside, side-restricted)", () => {
  const port = getSub(makeTwoPlayerGame(), "p1", "side-0");
  const starboard = getSub(makeTwoPlayerGame({ loadout: STARBOARD_LASER }), "p1", "side-2");

  it.each([
    ["one ring out, same sector", at(4, 0), true],
    ["one ring out, +1 sector", at(4, 1), true],
    ["one ring out, -1 sector (wrap)", at(4, 23), true],
    ["two rings out", at(5, 0), true],
    ["one ring out, +2 sectors", at(4, 2), false],
    ["same ring", at(3, 1), false],
    ["one ring in (wrong side)", at(2, 0), false],
  ])("port laser prograde at R3 S0: %s -> %s", (_label, target, expected) => {
    expect(isInWeaponRange(port, attackerAt(3, 0), target)).toBe(expected);
  });

  it("starboard fires inward when prograde; both sides flip when retrograde", () => {
    expect(isInWeaponRange(starboard, attackerAt(3, 0), at(2, 0))).toBe(true);
    expect(isInWeaponRange(starboard, attackerAt(3, 0), at(1, 1))).toBe(true);
    expect(isInWeaponRange(starboard, attackerAt(3, 0), at(4, 0))).toBe(false);
    expect(isInWeaponRange(port, attackerAt(3, 0, "retrograde"), at(2, 0))).toBe(true);
    expect(isInWeaponRange(port, attackerAt(3, 0, "retrograde"), at(4, 0))).toBe(false);
    expect(isInWeaponRange(starboard, attackerAt(3, 0, "retrograde"), at(5, 0))).toBe(true);
  });

  it("ring range is 2 in the firing direction only", () => {
    expect(isInWeaponRange(port, attackerAt(1, 0), at(3, 0))).toBe(true);
    expect(isInWeaponRange(port, attackerAt(1, 0), at(4, 0))).toBe(false);
  });
});

describe("weapons: ballistic rack range", () => {
  const rack = getSub(makeTwoPlayerGame({ loadout: RACKS }), "p1", "side-0");
  const starboardRack = getSub(makeTwoPlayerGame({ loadout: RACKS }), "p1", "side-2");

  it.each([
    ["same ring, +1", at(3, 1), true],
    ["same ring, -1 (wrap)", at(3, 23), true],
    ["same ring, same sector (point blank)", at(3, 0), true],
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
    ["two rings out, 3 sectors", at(5, 3)],
    ["two rings in, same sector", at(1, 0)],
    ["a ship sharing the launcher's sector", at(3, 0)],
    ["same ring, 4 sectors", at(3, 4)],
    ["the far side of the ring", at(3, 12)],
    ["four rings out and half the ring away", at(5, 14)],
  ])("missiles at R3 S0 may be launched at %s", (_label, target) => {
    expect(isInWeaponRange(launcher, attackerAt(3, 0), target)).toBe(true);
    expect(isInWeaponRange(launcher, attackerAt(3, 0, "retrograde"), target)).toBe(true);
  });

  // The flight is the range: three moves of three steps, with the missile
  // drifting before each move and the target after it. From R3 S0 that reaches
  // most of the way round the ring but not the far side.
  it.each([
    ["two sectors away", at(3, 2), true],
    ["eleven sectors ahead", at(3, 11), true],
    ["the far side of the ring", at(3, 16), false],
    ["two rings in, three sectors", at(1, 3), true],
    ["two rings in, half the ring away", at(1, 15), false],
  ])("a missile launched at R3 S0 at a target %s: reaches %s", (_label, target, expected) => {
    expect(missileCanReach(at(3, 0), target, false)).toBe(expected);
  });

  it("no weapon fires across gravity wells", () => {
    const railgun = getSub(makeTwoPlayerGame(), "p1", "forward-0");
    for (const weapon of [railgun, launcher, getSub(makeTwoPlayerGame(), "p1", "side-0")]) {
      expect(isInWeaponRange(weapon, attackerAt(3, 0), at(3, 1, ALPHA))).toBe(false);
    }
  });

  it("calculateFiringSolutions reports range and distances per target", () => {
    const solutions = calculateFiringSolutions(launcher, attackerAt(3, 0), [
      { id: "a", position: at(5, 2) },
      { id: "b", position: at(3, 12) },
    ]);
    expect(solutions).toEqual([
      { targetId: "a", inRange: true, ringDistance: 2, sectorDistance: 2 },
      // In range to launch at, though no missile would ever catch it.
      { targetId: "b", inRange: true, ringDistance: 0, sectorDistance: 12 },
    ]);
  });
});

describe("weapons: firing", () => {
  /** p1 at R3 S0 with a powered port laser, p2 one ring out. */
  const duel = (targetSector = 0) =>
    withPower(
      makeTwoPlayerGame({ ring: 3, sector: 0 }, { ring: 4, sector: targetSector }),
      "p1",
      "side-0",
      2
    );

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

  it("range is checked when the shot executes: fire-then-coast works, coast-then-fire does not", () => {
    const state = duel(1); // in range from S0, out of range from S4
    expect(executeTurnAs(state, fire(1, "side-0", "p2"), coast(2)).errors).toBeUndefined();
    expect(executeTurnAs(state, coast(1), fire(2, "side-0", "p2")).errors?.[0]).toMatch(
      /out of range/i
    );
  });

  it("a target that drifts into range can be shot after moving", () => {
    const state = duel(4); // out of range from S0, in range from S4
    expect(executeTurnAs(state, fire(1, "side-0", "p2")).errors?.[0]).toMatch(/out of range/i);
    expect(executeTurnAs(state, coast(1), fire(2, "side-0", "p2")).errors).toBeUndefined();
  });

  it("after a jump the shot is measured from the destination", () => {
    // BH R5 S17 jumps along Alpha's outbound lane to Alpha R3 S5.
    let state = makeGameState([
      makePlayer("p1", { wellId: BH, ring: 5, sector: 17 }, STARBOARD_LASER),
      makePlayer("p2", { wellId: ALPHA, ring: 2, sector: 5 }),
    ]);
    state = withPower(state, "p1", "engines", 3);
    state = withPower(state, "p1", "side-2", 2);
    expect(executeTurnAs(state, fire(1, "side-2", "p2"), jump(2, ALPHA)).errors?.[0]).toMatch(
      /out of range/i
    );
    const result = executeTurnAs(state, jump(1, ALPHA), fire(2, "side-2", "p2"));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p2").hitPoints).toBe(8);
  });

  it("each weapon fires once per turn, but two lasers are two weapons", () => {
    const state = withPower(duel(), "p1", "side-1", 2);
    expect(
      executeTurnAs(state, fire(1, "side-0", "p2"), fire(2, "side-0", "p2")).errors?.[0]
    ).toMatch(/already fired/i);
    const result = executeTurnAs(state, fire(1, "side-0", "p2"), fire(2, "side-1", "p2"));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p2").hitPoints).toBe(6);
  });

  it.each([
    [
      "an unpowered weapon",
      (s: ReturnType<typeof duel>) => withPower(s, "p1", "side-0", 0),
      "side-0",
      "p2",
      /not powered/i,
    ],
    [
      "a broken weapon",
      (s: ReturnType<typeof duel>) => withSub(s, "p1", "side-0", { isBroken: true }),
      "side-0",
      "p2",
      /broken/i,
    ],
    [
      "a non-weapon tile",
      (s: ReturnType<typeof duel>) => withPower(s, "p1", "side-2", 2),
      "side-2",
      "p2",
      /not a weapon/i,
    ],
    ["an unknown weapon id", (s: ReturnType<typeof duel>) => s, "side-9", "p2", /not found/i],
    ["yourself", (s: ReturnType<typeof duel>) => s, "side-0", "p1", /yourself/i],
    ["an unknown target", (s: ReturnType<typeof duel>) => s, "side-0", "p9", /not found/i],
    [
      "a destroyed target",
      (s: ReturnType<typeof duel>) => withShip(s, "p2", { hitPoints: 0 }),
      "side-0",
      "p2",
      /not on the board/i,
    ],
    [
      "an undeployed target",
      (s: ReturnType<typeof duel>) => withPlayer(s, "p2", { hasDeployed: false }),
      "side-0",
      "p2",
      /not on the board/i,
    ],
    [
      "a target in another well",
      (s: ReturnType<typeof duel>) => withShip(s, "p2", { wellId: ALPHA }),
      "side-0",
      "p2",
      /out of range/i,
    ],
  ])("rejects firing %s", (_label, setup, weapon, target, message) => {
    const state = setup(duel());
    const result = executeTurnAs(state, fire(1, weapon, target));
    expect(result.errors?.[0]).toMatch(message);
    expect(result.gameState).toBe(state);
  });

  it("rejects a critical target that is not a slot on the target's ship", () => {
    const result = executeTurnAs(duel(), fire(1, "side-0", "p2", "side-7"));
    expect(result.errors?.[0]).toMatch(/critical target/i);
  });

  it("a rejected shot aborts the turn: earlier valid actions do not apply", () => {
    const state = withPower(duel(), "p1", "side-1", 2);
    const result = executeTurnAs(state, fire(1, "side-0", "p2"), fire(2, "side-1", "p9"));
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(getShip(result.gameState, "p2").hitPoints).toBe(10);
    expect(result.gameState).toBe(state);
  });
});

describe("weapons: railgun recoil", () => {
  /** p1 at R3 S0 with a powered railgun; p2 two sectors ahead on the same ring. */
  const gunline = (facing: Facing = "prograde", ring = 3) =>
    withPower(
      makeTwoPlayerGame(
        { ring, sector: 0, facing },
        { ring, sector: facing === "prograde" ? 2 : 22 }
      ),
      "p1",
      "forward-0",
      4
    );

  it("an uncompensated shot pushes the ship one ring in its facing direction", () => {
    const prograde = executeTurnAs(gunline("prograde"), fire(1, "forward-0", "p2"));
    expect(prograde.errors).toBeUndefined();
    expect(getShip(prograde.gameState, "p1").ring).toBe(4);
    expect(eventsOf(prograde.events, "recoil")[0]).toMatchObject({
      playerId: "p1",
      compensated: false,
      to: { wellId: BH, ring: 4 },
      massSpent: 0,
      heat: 0,
    });

    const retrograde = executeTurnAs(gunline("retrograde"), fire(1, "forward-0", "p2"));
    expect(retrograde.errors).toBeUndefined();
    expect(getShip(retrograde.gameState, "p1").ring).toBe(2);
  });

  it("recoil happens before later actions: a broadside can use the new ring", () => {
    let state = makeGameState([
      makePlayer("p1", { wellId: BH, ring: 3, sector: 0 }, STARBOARD_LASER),
      makePlayer("p2", { wellId: BH, ring: 3, sector: 2 }),
      makePlayer("p3", { wellId: BH, ring: 3, sector: 1 }),
    ]);
    state = withPower(state, "p1", "forward-0", 4);
    state = withPower(state, "p1", "side-2", 2);
    // From R3 the starboard laser cannot hit p3 on R3; after the recoil to R4 it fires inward at R3.
    expect(executeTurnAs(state, fire(1, "side-2", "p3")).errors?.[0]).toMatch(/out of range/i);
    const result = executeTurnAs(state, fire(1, "forward-0", "p2"), fire(2, "side-2", "p3"));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p3").hitPoints).toBe(8);
  });

  it("compensating costs 1 mass, uses the engines and heats them by their allocation", () => {
    const state = withPower(gunline(), "p1", "engines", 2);
    const result = executeTurnAs(state, fire(1, "forward-0", "p2", "engines", true));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1")).toMatchObject({ ring: 3, reactionMass: 9 });
    expect(eventsOf(result.events, "recoil")[0]).toMatchObject({
      compensated: true,
      massSpent: 1,
      heat: 2,
    });
    expect(eventsOf(result.events, "recoil")[0]).not.toHaveProperty("to");
  });

  it("compensation uses the engines for the turn: a burn afterwards is rejected, and vice versa", () => {
    const state = withPower(gunline(), "p1", "engines", 3);
    expect(
      executeTurnAs(state, fire(1, "forward-0", "p2", "engines", true), burn(2, "soft")).errors?.[0]
    ).toMatch(/already used/i);
    // Burning first also moves the ship off p2's ring, so the range error comes first; the engines error is still reported.
    expect(
      executeTurnAs(
        state,
        burn(1, "soft"),
        fire(2, "forward-0", "p2", "engines", true)
      ).errors?.join()
    ).toMatch(/already used/i);
  });

  it("compensation needs powered engines and a unit of mass", () => {
    expect(
      executeTurnAs(gunline(), fire(1, "forward-0", "p2", "engines", true)).errors?.[0]
    ).toMatch(/energy in engines/i);
    const dry = withShip(withPower(gunline(), "p1", "engines", 1), "p1", { reactionMass: 0 });
    expect(executeTurnAs(dry, fire(1, "forward-0", "p2", "engines", true)).errors?.[0]).toMatch(
      /reaction mass/i
    );
  });

  it("an uncompensated shot that would push the ship off the rings is rejected", () => {
    expect(executeTurnAs(gunline("prograde", 5), fire(1, "forward-0", "p2")).errors?.[0]).toMatch(
      /off the rings/i
    );
    expect(executeTurnAs(gunline("retrograde", 1), fire(1, "forward-0", "p2")).errors?.[0]).toMatch(
      /off the rings/i
    );
    const compensated = withPower(gunline("prograde", 5), "p1", "engines", 1);
    expect(
      executeTurnAs(compensated, fire(1, "forward-0", "p2", "engines", true)).errors
    ).toBeUndefined();
  });

  it.each([
    ["prograde on a planet's outer ring 3", "prograde", 3, false],
    ["prograde on a planet's ring 2", "prograde", 2, true],
    ["retrograde on a planet's ring 1", "retrograde", 1, false],
    ["retrograde on a planet's ring 2", "retrograde", 2, true],
  ] as const)(
    "the well's own ring count decides: firing %s is allowed = %s",
    (_label, facing, ring, allowed) => {
      const state = withPower(
        makeTwoPlayerGame(
          { wellId: ALPHA, ring, sector: 0, facing },
          { wellId: ALPHA, ring, sector: facing === "prograde" ? 2 : 22 }
        ),
        "p1",
        "forward-0",
        4
      );
      const result = executeTurnAs(state, fire(1, "forward-0", "p2"));
      expect(result.errors?.join(" ") ?? "accepted").toMatch(
        allowed ? /accepted/ : /off the rings/i
      );
      expect(getShip(result.gameState, "p1").ring).toBe(
        allowed ? (facing === "prograde" ? 3 : 1) : ring
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

  it("the railgun does 4 damage", () => {
    const state = mustExecute(gunline(), fire(1, "forward-0", "p2"));
    expect(getShip(state, "p2").hitPoints).toBe(6);
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
    state = withShip(state, "p2", { hitPoints: 0 });
    const result = executeTurnAs(state, fire(1, "side-0", "p2"), coast(2));
    expect(result.errors?.[0]).toMatch(/not on the board/i);
  });
});
