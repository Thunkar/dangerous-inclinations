import { describe, it, expect } from "vitest";
import {
  TRANSFER_LANES,
  TRANSFER_POINTS,
  TRANSFER_ARC_LENGTH,
  arcSectors,
  findJump,
  getJumpAdjustmentRange,
  getJumpOptions,
  laneArrivalArc,
  laneDepartureArc,
  phasedJumpDestination,
  PLANET_OUTER_RING,
  STATION_RING,
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
  forwardSlots: ["fuel_compressor"],
  sideSlots: ["missiles", "laser", "shields", "laser"],
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
  it("six one-way lanes of four sectors each: one out and one in per planet", () => {
    expect(TRANSFER_LANES).toHaveLength(6);
    expect(
      TRANSFER_LANES.every(
        (l) =>
          l.blackHoleArc.length === TRANSFER_ARC_LENGTH &&
          l.planetArc.length === TRANSFER_ARC_LENGTH
      )
    ).toBe(true);
    for (const planet of [ALPHA, BETA, GAMMA]) {
      const directions = TRANSFER_LANES.filter((l) => l.planetId === planet).map(
        (l) => l.direction
      );
      expect(directions.sort()).toEqual(["inbound", "outbound"]);
    }
    // One transfer point per departure sector, none back.
    expect(TRANSFER_POINTS).toHaveLength(6 * TRANSFER_ARC_LENGTH);
  });

  it("the whole of black hole ring 5 is lanes, each sector in exactly one; only outbound arcs offer a jump", () => {
    const outbound = new Set(
      TRANSFER_LANES.filter((l) => l.direction === "outbound").flatMap((l) =>
        arcSectors(l.blackHoleArc)
      )
    );
    expect(outbound.size).toBe(SECTORS_PER_RING / 2);
    for (let sector = 0; sector < SECTORS_PER_RING; sector++) {
      expect(getJumpOptions({ wellId: BH, ring: 5, sector })).toHaveLength(
        outbound.has(sector) ? 1 : 0
      );
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
    [9, GAMMA, 5],
    [11, GAMMA, 7],
    [16, ALPHA, 4],
    [19, ALPHA, 7],
  ])(
    "BH R5 S%i jumps to %s's lane ring S%i, keeping the offset inside the arc",
    (sector, planet, landing) => {
      const [option] = getJumpOptions({ wellId: BH, ring: 5, sector });
      expect(option.destination).toEqual({ wellId: planet, ring: PLANET_OUTER_RING, sector: landing });
    }
  );

  it.each([
    [ALPHA, 16, 4],
    [ALPHA, 19, 7],
    [BETA, 16, 12],
    [BETA, 19, 15],
    [GAMMA, 17, 21],
  ])("%s lane ring S%i jumps back to BH R5 S%i along the inbound lane", (planet, sector, landing) => {
    const [option] = getJumpOptions({ wellId: planet, ring: PLANET_OUTER_RING, sector });
    expect(option.destination).toEqual({ wellId: BH, ring: 5, sector: landing });
  });

  it.each([
    [ALPHA, PLANET_OUTER_RING, 0],
    [ALPHA, PLANET_OUTER_RING, 8],
    [ALPHA, STATION_RING, 5],
    [BH, 4, 0],
    // Arrival arcs: you land here, you never leave from here.
    [ALPHA, PLANET_OUTER_RING, 4],
    [BETA, PLANET_OUTER_RING, 6],
    [BH, 5, 5],
    [BH, 5, 12],
    [BH, 5, 23],
  ])("no lane from %s R%i S%i", (wellId, ring, sector) => {
    expect(getJumpOptions({ wellId, ring, sector })).toEqual([]);
  });

  it("lanes are one-way: where a jump lands offers no jump back", () => {
    for (let sector = 0; sector < SECTORS_PER_RING; sector++) {
      for (const option of getJumpOptions({ wellId: BH, ring: 5, sector })) {
        expect(getJumpOptions(option.destination)).toEqual([]);
      }
    }
    for (const planet of [ALPHA, BETA, GAMMA]) {
      for (let sector = 0; sector < SECTORS_PER_RING; sector++) {
        for (const option of getJumpOptions({ wellId: planet, ring: PLANET_OUTER_RING, sector })) {
          expect(getJumpOptions(option.destination)).toEqual([]);
        }
      }
    }
  });

  it("the cheap circuit is Alpha → Gamma → Beta → Alpha: each arrival arc precedes the next departure", () => {
    const landingFrom = (planet: string) =>
      getJumpOptions({ wellId: planet, ring: PLANET_OUTER_RING, sector: 19 })[0].destination;
    const nextOutbound = (bhSector: number) =>
      getJumpOptions({ wellId: BH, ring: 5, sector: (bhSector + 1) % SECTORS_PER_RING })[0].lane
        .planetId;
    expect(nextOutbound(landingFrom(ALPHA).sector)).toBe(GAMMA);
    expect(nextOutbound(landingFrom(GAMMA).sector)).toBe(BETA);
    expect(nextOutbound(landingFrom(BETA).sector)).toBe(ALPHA);
  });

  it("findJump only matches the lane's destination well", () => {
    expect(findJump({ wellId: BH, ring: 5, sector: 17 }, ALPHA)?.lane.id).toBe("alpha-b");
    expect(findJump({ wellId: BH, ring: 5, sector: 17 }, BETA)).toBeUndefined();
    expect(findJump({ wellId: ALPHA, ring: PLANET_OUTER_RING, sector: 17 }, BETA)).toBeUndefined();
    expect(findJump({ wellId: ALPHA, ring: PLANET_OUTER_RING, sector: 17 }, BH)?.lane.id).toBe("alpha-a");
  });
});

describe("jumps: executing a well transfer", () => {
  it("moves the ship to the lane's destination with no drift, spending 3 mass and heating the engines", () => {
    const result = executeTurnAs(readyToJump(BH, 5, 17), jump(1, ALPHA));
    expect(result.errors).toBeUndefined();
    const ship = getShip(result.gameState, "p1");
    expect(ship).toMatchObject({
      wellId: ALPHA,
      ring: PLANET_OUTER_RING,
      sector: 5,
      facing: "prograde",
      reactionMass: 7,
    });
    expect(eventsOf(result.events, "jumped")).toEqual([
      expect.objectContaining({
        from: { wellId: BH, ring: 5, sector: 17 },
        to: { wellId: ALPHA, ring: PLANET_OUTER_RING, sector: 5 },
        compressed: false,
        heat: 3,
      }),
    ]);
    expect(eventsOf(result.events, "coasted")).toEqual([]);
  });

  it("works from a planet back to the black hole, with any facing", () => {
    const result = executeTurnAs(readyToJump(BETA, PLANET_OUTER_RING, 18, "retrograde"), jump(1, BH));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1")).toMatchObject({
      wellId: BH,
      ring: 5,
      sector: 14,
      facing: "retrograde",
    });
  });

  it("uses the engines: a burn in the same turn is impossible anyway (one movement), and they count as used", () => {
    const result = executeTurnAs(readyToJump(BH, 5, 17), jump(1, ALPHA));
    expect(getSub(result.gameState, "p1", "engines").usedThisTurn).toBe(false); // reset at end of turn
    const both = executeTurnAs(readyToJump(BH, 5, 17), jump(1, ALPHA), burn(2, "soft"));
    expect(both.errors?.[0]).toMatch(/one movement/i);
    const withCoast = executeTurnAs(readyToJump(BH, 5, 17), jump(1, ALPHA), coast(2));
    expect(withCoast.errors?.[0]).toMatch(/one movement/i);
  });

  it.each([
    ["not on a lane", readyToJump(BH, 4, 5), ALPHA, /no transfer lane/i],
    ["wrong destination for this arc", readyToJump(BH, 5, 17), BETA, /no transfer lane/i],
    ["an arrival arc", readyToJump(BH, 5, 5), ALPHA, /no transfer lane/i],
    [
      "engines at 2",
      withPower(readyToJump(BH, 5, 17), "p1", "engines", 2),
      ALPHA,
      /energy in engines/i,
    ],
    [
      "engines unpowered",
      withPower(readyToJump(BH, 5, 17), "p1", "engines", 0),
      ALPHA,
      /energy in engines/i,
    ],
    [
      "only 2 mass",
      withShip(readyToJump(BH, 5, 17), "p1", { reactionMass: 2 }),
      ALPHA,
      /reaction mass/i,
    ],
    [
      "broken engines",
      withSub(readyToJump(BH, 5, 17), "p1", "engines", { isBroken: true }),
      ALPHA,
      /broken/i,
    ],
  ])("rejects a jump when %s", (_label, state, destination, message) => {
    const result = executeTurnAs(state, jump(1, destination));
    expect(result.errors?.[0]).toMatch(message);
    expect(result.gameState).toBe(state);
  });

  it("a working fuel compressor pays for the lane and is revealed", () => {
    const state = withShip(readyToJump(BH, 5, 17, "prograde", COMPRESSOR), "p1", {
      reactionMass: 0,
    });
    const result = executeTurnAs(state, jump(1, ALPHA));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1").reactionMass).toBe(0);
    expect(eventsOf(result.events, "jumped")[0]).toMatchObject({
      massSpent: 0,
      compressed: true,
    });
    expect(eventsOf(result.events, "subsystem_revealed")).toEqual([
      expect.objectContaining({
        subsystemId: "forward-0",
        subsystemType: "fuel_compressor",
        reason: "compressed_jump",
      }),
    ]);
    expect(getSub(result.gameState, "p1", "forward-0").isRevealed).toBe(true);
  });

  it("a broken compressor pays for nothing", () => {
    const state = withSub(readyToJump(BH, 5, 17, "prograde", COMPRESSOR), "p1", "forward-0", {
      isBroken: true,
    });
    const result = executeTurnAs(state, jump(1, ALPHA));
    expect(getShip(result.gameState, "p1").reactionMass).toBe(10 - 3);
    expect(eventsOf(result.events, "jumped")[0].compressed).toBe(false);
  });

  it("the lane is read from where the ship is when the jump executes", () => {
    // p1 on Alpha's lane ring S15 (no lane) cannot jump even though S16 next door starts the inbound arc.
    const result = executeTurnAs(readyToJump(ALPHA, PLANET_OUTER_RING, 15), jump(1, BH));
    expect(result.errors?.[0]).toMatch(/no transfer lane/i);
  });

  it("jumping is a movement: the ship does not drift afterwards even on a fast ring", () => {
    // Beta's lane ring S17 is on Beta's inbound lane (16–19 → BH 12–15).
    const state = makeTwoPlayerGame({ wellId: BETA, ring: PLANET_OUTER_RING, sector: 17 });
    const result = executeTurnAs(withPower(state, "p1", "engines", 3), jump(1, BH));
    expect(getShip(result.gameState, "p1").sector).toBe(13);
  });
});

describe("jumps: phasing inside the arrival arc", () => {
  it("every departure sector of a lane reaches every sector of its arrival arc", () => {
    for (const lane of TRANSFER_LANES) {
      const departure = laneDepartureArc(lane);
      const arrival = arcSectors(laneArrivalArc(lane));
      for (const sector of arcSectors(departure)) {
        const [option] = getJumpOptions({
          wellId: departure.wellId,
          ring: departure.ring,
          sector,
        });
        const { min, max } = getJumpAdjustmentRange(option);
        const reachable: number[] = [];
        for (let adj = min; adj <= max; adj++) {
          reachable.push(phasedJumpDestination(option, adj)!.sector);
        }
        expect(reachable.sort((a, b) => a - b)).toEqual([...arrival].sort((a, b) => a - b));
        expect(phasedJumpDestination(option, min - 1)).toBeUndefined();
        expect(phasedJumpDestination(option, max + 1)).toBeUndefined();
      }
    }
  });

  it.each([
    [16, -1, undefined],
    [16, 0, 4],
    [16, 3, 7],
    [17, -1, 4],
    [17, 2, 7],
    [17, 3, undefined],
    [19, -3, 4],
    [19, 0, 7],
    [19, 1, undefined],
  ])("from BH R5 S%i, phasing %i lands on Alpha's lane ring S%s", (sector, adjustment, landing) => {
    const [option] = getJumpOptions({ wellId: BH, ring: 5, sector });
    expect(phasedJumpDestination(option, adjustment)?.sector).toBe(landing);
  });

  it.each([
    [-1, 4, 4],
    [0, 5, 3],
    [1, 6, 4],
    [2, 7, 5],
  ])("a jump phased by %i lands on Alpha's lane ring S%i and costs %i fuel", (adjustment, landing, fuel) => {
    const result = executeTurnAs(readyToJump(BH, 5, 17), jump(1, ALPHA, adjustment));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1")).toMatchObject({
      wellId: ALPHA,
      ring: PLANET_OUTER_RING,
      sector: landing,
      reactionMass: 10 - fuel,
    });
    expect(eventsOf(result.events, "jumped")).toEqual([
      expect.objectContaining({
        to: { wellId: ALPHA, ring: PLANET_OUTER_RING, sector: landing },
        sectorAdjustment: adjustment,
        massSpent: fuel,
        // Phasing is fuel, never heat: the engines already burned their cubes.
        heat: 3,
      }),
    ]);
  });

  it.each([
    ["past the end of the arc", 17, 3],
    ["before the start of the arc", 17, -2],
    ["far outside it", 16, 9],
  ])("rejects a jump phased %s", (_label, sector, adjustment) => {
    const state = readyToJump(BH, 5, sector);
    const result = executeTurnAs(state, jump(1, ALPHA, adjustment));
    expect(result.errors?.[0]).toMatch(/arrival arc/i);
    expect(result.gameState).toBe(state);
  });

  it("rejects phasing the ship cannot pay for", () => {
    const state = withShip(readyToJump(BH, 5, 17), "p1", { reactionMass: 4 });
    expect(executeTurnAs(state, jump(1, ALPHA, 2)).errors?.[0]).toMatch(/reaction mass/i);
    expect(executeTurnAs(state, jump(1, ALPHA, 1)).errors).toBeUndefined();
  });

  it("rejects a fractional adjustment", () => {
    const result = executeTurnAs(readyToJump(BH, 5, 17), jump(1, ALPHA, 0.5));
    expect(result.errors?.[0]).toMatch(/integer/i);
  });

  it("a compressor pays for the lane but never for the phasing", () => {
    const phasing = 2;
    const state = withShip(readyToJump(BH, 5, 17, "prograde", COMPRESSOR), "p1", {
      reactionMass: phasing,
    });
    const result = executeTurnAs(state, jump(1, ALPHA, phasing));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1")).toMatchObject({ sector: 7, reactionMass: 0 });
    expect(eventsOf(result.events, "jumped")[0]).toMatchObject({
      massSpent: phasing,
      compressed: true,
    });
  });

  it("a compressor with a dry tank can still jump, but cannot phase", () => {
    const dry = withShip(readyToJump(BH, 5, 17, "prograde", COMPRESSOR), "p1", {
      reactionMass: 0,
    });
    expect(executeTurnAs(dry, jump(1, ALPHA)).errors).toBeUndefined();
    expect(executeTurnAs(dry, jump(1, ALPHA, 1)).errors?.[0]).toMatch(/reaction mass/i);
  });

  it("phasing an inbound jump works the same way, and still skips the drift", () => {
    // Beta's lane ring S17 is offset 1 of the inbound arc 16-19 -> BH 12-15, so S13 unphased.
    const result = executeTurnAs(readyToJump(BETA, PLANET_OUTER_RING, 17), jump(1, BH, -1));
    expect(getShip(result.gameState, "p1")).toMatchObject({
      wellId: BH,
      ring: 5,
      sector: 12,
      reactionMass: 6,
    });
  });
});
