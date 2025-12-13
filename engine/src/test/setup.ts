/**
 * Test Setup for Game Logic
 *
 * Enables deterministic mode for all tests to eliminate flaky tests
 * caused by random d10 rolls (10% miss, 10% critical).
 */
import { enableDeterministicMode } from "../game/config";

// Enable deterministic rolls (fixed value: 5 = normal hit)
// This eliminates random misses (roll 1) and criticals (roll 10)
enableDeterministicMode(5);
