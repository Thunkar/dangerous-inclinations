import { describe, it, expect } from "vitest";
import {
  wrapSector,
  sectorDistance,
  forwardDistance,
  sectorStepToward,
  ringVelocity,
} from "../../game/geometry.ts";
import {
  arcOffset,
  arcSectors,
  getMaxRing,
  TRANSFER_ARC_LENGTH,
} from "../../models/gravityWells.ts";
import { ALPHA, BH } from "../testUtils.ts";

describe("geometry: sector arithmetic", () => {
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
  it("falls back to velocity 1 for unknown wells and rings", () => {
    expect(ringVelocity("nowhere", 1)).toBe(1);
    expect(ringVelocity(BH, 9)).toBe(1);
    expect(ringVelocity(ALPHA, 5)).toBe(1);
  });

  it("the black hole has 5 rings and planets have 4", () => {
    expect(getMaxRing(BH)).toBe(5);
    expect(getMaxRing(ALPHA)).toBe(4);
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
