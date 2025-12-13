/**
 * Test Setup for Game Logic
 *
 * Enables deterministic mode for all tests to eliminate flaky tests
 * caused by random d10 rolls (10% miss, 10% critical).
 */
import { beforeAll, afterAll } from "vitest";
import { enableDeterministicMode, resetGameConfig } from "../config";

beforeAll(() => {
  // Enable deterministic rolls (fixed value: 5 = normal hit)
  // This eliminates random misses (roll 1) and criticals (roll 10)
  enableDeterministicMode(5);
});

afterAll(() => {
  // Reset to default (random) behavior after tests
  resetGameConfig();
});
