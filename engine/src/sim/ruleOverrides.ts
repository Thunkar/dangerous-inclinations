/**
 * Experiment-only rule overrides for the simulator:
 * `--rules=missionsToWin=3,secondariesKept=3,compressedJumpFuel=1`
 *
 * Where `--tiles` and `--weapons` reach the mats, this reaches the three
 * numbers the rules themselves are made of: what a game is worth, what a hand
 * is, and what a compressed jump costs. The last two are constants in
 * `models/missions.ts` and `models/rings.ts` — a game is played under RULES.md
 * and nothing else — so this channel reassigns them through their own setters,
 * once, in the process (or worker thread) about to run the games. Every game
 * of a batch therefore plays under the same rules, and the server and the UI
 * never see the channel at all: a change that survives its experiment is
 * written into the models for real.
 *
 * `missionsToWin` is the exception, and no longer an override of anything: the
 * table agrees its points to win before the deal, so the number rides on the
 * state. The key stays for the batches already written against it and is
 * handed to `createGame` as `pointsToWin` by {@link runGame}, not applied here.
 *
 * | key                | reaches                                          |
 * |--------------------|--------------------------------------------------|
 * | missionsToWin      | GameState.pointsToWin (default 3), via createGame |
 * | secondariesKept    | SECONDARIES_PER_PLAYER (default 2); the hand size follows |
 * | compressedJumpFuel | COMPRESSED_JUMP_MASS (default 0)                 |
 */
import { setMissionRules } from "../models/missions.ts";
import { setCompressedJumpMass } from "../models/rings.ts";

export interface RuleOverrides {
  /** Points that trigger the final round; passed to `createGame`, not a binding. */
  missionsToWin?: number;
  /** One-point cards a hand keeps; the hand is this plus the one primary. */
  secondariesKept?: number;
  /** Fuel a jump costs with a working fuel compressor. */
  compressedJumpFuel?: number;
}

const KEYS = ["missionsToWin", "secondariesKept", "compressedJumpFuel"] as const;

export function parseRuleOverrides(text: string): RuleOverrides {
  const out: RuleOverrides = {};
  for (const pair of text.split(",")) {
    if (!pair.trim()) continue;
    const eq = pair.indexOf("=");
    if (eq === -1) throw new Error(`Rule override "${pair}" needs rule=value`);
    const key = pair.slice(0, eq).trim();
    if (!(KEYS as readonly string[]).includes(key))
      throw new Error(`Unknown rule "${key}". Known: ${KEYS.join(", ")}`);
    const value = Number(pair.slice(eq + 1).trim());
    if (!Number.isFinite(value)) throw new Error(`Rule override "${pair}" needs a number`);
    out[key as (typeof KEYS)[number]] = value;
  }
  return out;
}

/**
 * Reassign the constants an override reaches. `missionsToWin` is not one of
 * them: {@link runGame} passes it to `createGame` so the games of the batch are
 * created playing to it.
 */
export function applyRuleOverrides(overrides?: RuleOverrides): void {
  if (!overrides) return;
  if (overrides.secondariesKept !== undefined)
    setMissionRules({ secondariesKept: overrides.secondariesKept });
  if (overrides.compressedJumpFuel !== undefined)
    setCompressedJumpMass(overrides.compressedJumpFuel);
}

/** The overrides in force, as the benchmark stamps them on its page. */
export function describeRuleOverrides(overrides?: RuleOverrides): string {
  return Object.entries(overrides ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}
