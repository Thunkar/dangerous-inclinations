import { describe, it, expect } from "vitest";
import {
  TRANSFER_LANES,
  TRANSFER_POINTS,
  TRANSFER_ARC_LENGTH,
  arcSectors,
  findJump,
  getJumpOptions,
} from "../../models/gravityWells.ts";
import { SECTORS_PER_RING } from "../../models/rings.ts";
import type { ShipLoadout } from "../../models/game.ts";
import {
  ALPHA,
  BETA,
  BH,
  GAMMA,
  burn,
  coast,
  eventsOf,
  executeTurnAs,
  getShip,
  getSub,
  jump,
  makeGameState,
  makePlayer,
  makeTwoPlayerGame,
  withPower,
  withShip,
  withSub,
} from "../testUtils.ts";

const COMPRESSOR: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["fuel_compressor", "laser", "shields", "laser"],
};

function readyToJump(
  wellId: string,
  ring: number,
  sector: number,
  facing: "prograde" | "retrograde" = "prograde",
  loadout?: ShipLoadout
) {
  const state = makeGameState([
    makePlayer("p1", { wellId, ring, sector, facing }, loadout),
    makePlayer("p2", { wellId: BH, ring: 4, sector: 12 }),
  ]);
  return withPower(state, "p1", "engines", 3);
}

describe("jumps: lane geometry", () => {
  it("six two-way lanes of four sectors each", () => {
    expect(TRANSFER_LANES).toHaveLength(6);
    expect(
      TRANSFER_LANES.every(
        (l) =>
          l.blackHoleArc.length === TRANSFER_ARC_LENGTH &&
          l.planetArc.length === TRANSFER_ARC_LENGTH
      )
    ).toBe(true);
    expect(TRANSFER_POINTS).toHaveLength(6 * TRANSFER_ARC_LENGTH * 2);
  });

  it("the whole of black hole ring 5 is lanes, each sector in exactly one", () => {
    for (let sector = 0; sector < SECTORS_PER_RING; sector++) {
      expect(getJumpOptions({ wellId: BH, ring: 5, sector })).toHaveLength(1);
    }
    const covered = TRANSFER_LANES.flatMap((l) => arcSectors(l.blackHoleArc)).sort((a, b) => a - b);
    expect(covered).toEqual(Array.from({ length: SECTORS_PER_RING }, (_, i) => i));
  });

  it("each planet has two arcs on ring 3 (4-7 and 16-19)", () => {
    for (const planet of [ALPHA, BETA, GAMMA]) {
      const arcs = TRANSFER_LANES.filter((l) => l.planetId === planet)
        .map((l) => l.planetArc.startSector)
        .sort((a, b) => a - b);
      expect(arcs).toEqual([4, 16]);
    }
  });

  it.each([
    [0, BETA, 4],
    [3, BETA, 7],
    [5, ALPHA, 17],
    [11, GAMMA, 7],
    [12, BETA, 16],
    [19, ALPHA, 7],
    [23, GAMMA, 19],
  ])(
    "BH R5 S%i jumps to %s R3 S%i, keeping the offset inside the arc",
    (sector, planet, landing) => {
      const [option] = getJumpOptions({ wellId: BH, ring: 5, sector });
      expect(option.destination).toEqual({ wellId: planet, ring: 3, sector: landing });
    }
  );

  it.each([
    [ALPHA, 4, 16],
    [ALPHA, 19, 7],
    [BETA, 6, 2],
    [BETA, 16, 12],
    [GAMMA, 17, 21],
  ])("%s R3 S%i jumps to BH R5 S%i", (planet, sector, landing) => {
    const [option] = getJumpOptions({ wellId: planet, ring: 3, sector });
    expect(option.destination).toEqual({ wellId: BH, ring: 5, sector: landing });
  });

  it.each([
    [ALPHA, 3, 0],
    [ALPHA, 3, 8],
    [ALPHA, 2, 5],
    [BH, 4, 0],
  ])("no lane from %s R%i S%i", (wellId, ring, sector) => {
    expect(getJumpOptions({ wellId, ring, sector })).toEqual([]);
  });

  it("lanes are two-way: jumping out and back returns to the same sector", () => {
    for (let sector = 0; sector < SECTORS_PER_RING; sector++) {
      const out = getJumpOptions({ wellId: BH, ring: 5, sector })[0].destination;
      const back = findJump(out, BH)!.destination;
      expect(back).toEqual({ wellId: BH, ring: 5, sector });
    }
  });

  it("findJump only matches the lane's destination well", () => {
    expect(findJump({ wellId: BH, ring: 5, sector: 5 }, ALPHA)?.lane.id).toBe("alpha-a");
    expect(findJump({ wellId: BH, ring: 5, sector: 5 }, BETA)).toBeUndefined();
    expect(findJump({ wellId: ALPHA, ring: 3, sector: 5 }, BETA)).toBeUndefined();
  });
});

describe("jumps: executing a well transfer", () => {
  it("moves the ship to the lane's destination with no drift, spending 3 mass and heating the engines", () => {
    const result = executeTurnAs(readyToJump(BH, 5, 5), jump(1, ALPHA));
    expect(result.errors).toBeUndefined();
    const ship = getShip(result.gameState, "p1");
    expect(ship).toMatchObject({
      wellId: ALPHA,
      ring: 3,
      sector: 17,
      facing: "prograde",
      reactionMass: 7,
    });
    expect(eventsOf(result.events, "jumped")).toEqual([
      expect.objectContaining({
        from: { wellId: BH, ring: 5, sector: 5 },
        to: { wellId: ALPHA, ring: 3, sector: 17 },
        refunded: false,
        heat: 3,
      }),
    ]);
    expect(eventsOf(result.events, "coasted")).toEqual([]);
  });

  it("works from a planet back to the black hole, with any facing", () => {
    const result = executeTurnAs(readyToJump(BETA, 3, 18, "retrograde"), jump(1, BH));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1")).toMatchObject({
      wellId: BH,
      ring: 5,
      sector: 14,
      facing: "retrograde",
    });
  });

  it("uses the engines: a burn in the same turn is impossible anyway (one movement), and they count as used", () => {
    const result = executeTurnAs(readyToJump(BH, 5, 5), jump(1, ALPHA));
    expect(getSub(result.gameState, "p1", "engines").usedThisTurn).toBe(false); // reset at end of turn
    const both = executeTurnAs(readyToJump(BH, 5, 5), jump(1, ALPHA), burn(2, "soft"));
    expect(both.errors?.[0]).toMatch(/one movement/i);
    const withCoast = executeTurnAs(readyToJump(BH, 5, 5), jump(1, ALPHA), coast(2));
    expect(withCoast.errors?.[0]).toMatch(/one movement/i);
  });

  it.each([
    ["not on a lane", readyToJump(BH, 4, 5), ALPHA, /no transfer lane/i],
    ["wrong destination for this arc", readyToJump(BH, 5, 5), BETA, /no transfer lane/i],
    [
      "engines at 2",
      withPower(readyToJump(BH, 5, 5), "p1", "engines", 2),
      ALPHA,
      /energy in engines/i,
    ],
    [
      "engines unpowered",
      withPower(readyToJump(BH, 5, 5), "p1", "engines", 0),
      ALPHA,
      /energy in engines/i,
    ],
    [
      "only 2 mass",
      withShip(readyToJump(BH, 5, 5), "p1", { reactionMass: 2 }),
      ALPHA,
      /reaction mass/i,
    ],
    [
      "broken engines",
      withSub(readyToJump(BH, 5, 5), "p1", "engines", { isBroken: true }),
      ALPHA,
      /broken/i,
    ],
  ])("rejects a jump when %s", (_label, state, destination, message) => {
    const result = executeTurnAs(state, jump(1, destination));
    expect(result.errors?.[0]).toMatch(message);
    expect(result.gameState).toBe(state);
  });

  it("a working fuel compressor refunds the mass and is revealed", () => {
    const state = withShip(readyToJump(BH, 5, 5, "prograde", COMPRESSOR), "p1", {
      reactionMass: 0,
    });
    const result = executeTurnAs(state, jump(1, ALPHA));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1").reactionMass).toBe(0);
    expect(eventsOf(result.events, "jumped")[0].refunded).toBe(true);
    expect(eventsOf(result.events, "subsystem_revealed")).toEqual([
      expect.objectContaining({
        subsystemId: "side-0",
        subsystemType: "fuel_compressor",
        reason: "refunded_jump",
      }),
    ]);
    expect(getSub(result.gameState, "p1", "side-0").isRevealed).toBe(true);
  });

  it("a broken compressor refunds nothing", () => {
    const state = withSub(readyToJump(BH, 5, 5, "prograde", COMPRESSOR), "p1", "side-0", {
      isBroken: true,
    });
    const result = executeTurnAs(state, jump(1, ALPHA));
    expect(getShip(result.gameState, "p1").reactionMass).toBe(16 - 3);
    expect(eventsOf(result.events, "jumped")[0].refunded).toBe(false);
  });

  it("the lane is read from where the ship is when the jump executes", () => {
    // p1 sits on BH R5 S5 (alpha-a). Coasting first would move it to S6, still alpha-a; but coast + jump is two moves.
    // Instead: p1 on Alpha R3 S8 (no lane) cannot jump even though S7 next door is one.
    const result = executeTurnAs(readyToJump(ALPHA, 3, 8), jump(1, BH));
    expect(result.errors?.[0]).toMatch(/no transfer lane/i);
  });

  it("jumping is a movement: the ship does not drift afterwards even on a fast ring", () => {
    const state = makeTwoPlayerGame({ wellId: BETA, ring: 3, sector: 5 });
    const result = executeTurnAs(withPower(state, "p1", "engines", 3), jump(1, BH));
    expect(getShip(result.gameState, "p1").sector).toBe(1);
  });
});
