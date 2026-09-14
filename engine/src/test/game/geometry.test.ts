import { describe, it, expect } from "vitest";
import {
  wrapSector,
  sectorDistance,
  forwardDistance,
  sectorStepToward,
  ringVelocity,
  driftPosition,
  positionOf,
  samePosition,
} from "../../game/geometry.ts";
import {
  arcOffset,
  arcSectors,
  getMaxRing,
  TRANSFER_ARC_LENGTH,
} from "../../models/gravityWells.ts";
import { SECTORS_PER_RING } from "../../models/rings.ts";
import { ALPHA, BH } from "../testUtils.ts";

describe("geometry: sector arithmetic", () => {
  it("rings have 24 sectors", () => {
    expect(SECTORS_PER_RING).toBe(24);
  });

  it.each([
    [0, 0],
    [24, 0],
    [25, 1],
    [-1, 23],
    [-25, 23],
    [48, 0],
  ])("wrapSector(%i) = %i", (input, expected) => {
    expect(wrapSector(input)).toBe(expected);
  });

  it.each([
    [0, 0, 0],
    [0, 1, 1],
    [0, 23, 1],
    [0, 12, 12],
    [5, 20, 9],
    [23, 1, 2],
    [-1, 1, 2],
  ])("sectorDistance(%i, %i) = %i (shortest way round)", (a, b, expected) => {
    expect(sectorDistance(a, b)).toBe(expected);
    expect(sectorDistance(b, a)).toBe(expected);
  });

  it.each([
    [0, 5, 5],
    [5, 0, 19],
    [23, 1, 2],
    [7, 7, 0],
    [12, 11, 23],
  ])("forwardDistance(%i, %i) = %i (prograde only)", (from, to, expected) => {
    expect(forwardDistance(from, to)).toBe(expected);
  });

  it.each([
    [0, 0, 0],
    [0, 1, 1],
    [0, 23, -1],
    [0, 12, 1],
    [0, 13, -1],
    [10, 22, 1],
    [22, 10, 1], // exactly half way round: ties go prograde
  ])("sectorStepToward(%i, %i) = %i", (from, to, expected) => {
    expect(sectorStepToward(from, to)).toBe(expected);
  });
});

describe("geometry: rings and drift", () => {
  it.each([
    [BH, 1, 8],
    [BH, 2, 6],
    [BH, 3, 4],
    [BH, 4, 2],
    [BH, 5, 1],
    [ALPHA, 1, 4],
    [ALPHA, 2, 2],
    [ALPHA, 3, 1],
  ])("%s ring %i drifts %i sectors per turn", (wellId, ring, velocity) => {
    expect(ringVelocity(wellId, ring)).toBe(velocity);
    expect(driftPosition({ wellId, ring, sector: 0 })).toEqual({ wellId, ring, sector: velocity });
  });

  it("falls back to velocity 1 for unknown wells and rings", () => {
    expect(ringVelocity("nowhere", 1)).toBe(1);
    expect(ringVelocity(BH, 9)).toBe(1);
    expect(ringVelocity(ALPHA, 4)).toBe(1);
  });

  it("drift wraps around the ring and keeps well and ring", () => {
    expect(driftPosition({ wellId: BH, ring: 1, sector: 20 })).toEqual({
      wellId: BH,
      ring: 1,
      sector: 4,
    });
    expect(driftPosition({ wellId: ALPHA, ring: 3, sector: 23 })).toEqual({
      wellId: ALPHA,
      ring: 3,
      sector: 0,
    });
  });

  it("the black hole has 5 rings and planets have 3", () => {
    expect(getMaxRing(BH)).toBe(5);
    expect(getMaxRing(ALPHA)).toBe(3);
  });

  it("positionOf strips everything but the position", () => {
    const pos = positionOf({ wellId: BH, ring: 2, sector: 7, facing: "retrograde" } as never);
    expect(pos).toEqual({ wellId: BH, ring: 2, sector: 7 });
  });

  it("samePosition compares well, ring and sector", () => {
    const a = { wellId: BH, ring: 2, sector: 7 };
    expect(samePosition(a, { ...a })).toBe(true);
    expect(samePosition(a, { ...a, sector: 8 })).toBe(false);
    expect(samePosition(a, { ...a, ring: 3 })).toBe(false);
    expect(samePosition(a, { ...a, wellId: ALPHA })).toBe(false);
  });
});

describe("geometry: transfer arcs", () => {
  const arc = { wellId: BH, ring: 5, startSector: 20, length: TRANSFER_ARC_LENGTH };

  it("arcSectors lists the arc's sectors, wrapping past 23", () => {
    expect(arcSectors(arc)).toEqual([20, 21, 22, 23]);
    expect(arcSectors({ ...arc, startSector: 22 })).toEqual([22, 23, 0, 1]);
  });

  it.each([
    [20, 0],
    [22, 2],
    [23, 3],
    [0, -1],
    [19, -1],
  ])("arcOffset for sector %i is %i", (sector, expected) => {
    expect(arcOffset(arc, { wellId: BH, ring: 5, sector })).toBe(expected);
  });

  it("arcOffset is -1 off the arc's ring or well", () => {
    expect(arcOffset(arc, { wellId: BH, ring: 4, sector: 21 })).toBe(-1);
    expect(arcOffset(arc, { wellId: ALPHA, ring: 5, sector: 21 })).toBe(-1);
  });
});
