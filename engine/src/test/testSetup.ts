/**
 * Test Setup Helper
 *
 * Import this at the top of test files to enable deterministic mode
 */
import { enableDeterministicMode } from "../game/config";

// Enable deterministic rolls (fixed value: 5 = normal hit)
// This eliminates random misses (roll 1) and criticals (roll 10)
enableDeterministicMode(5);
