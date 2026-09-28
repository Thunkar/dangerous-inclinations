/**
 * The simulator's rule channel: `--rules=missionsToWin=4`.
 *
 * One key is left, and it overrides nothing in the process. A table plays to
 * three and is offered nothing else, but the number rides on the state, so
 * {@link runGame} can hand it to `createGame` as `pointsToWin` and create
 * every game of a batch playing to another one. Everything else the
 * rules are made of is a constant in `models/`: a game is played under RULES.md
 * and nothing else, and a proposed change to one of those is measured by
 * changing the constant, not by switching it at run time.
 *
 * | key           | reaches                                           |
 * |---------------|---------------------------------------------------|
 * | missionsToWin | GameState.pointsToWin (default 3), via createGame |
 */

export interface RuleOverrides {
  /** Points that trigger the final round; passed to `createGame`, not a binding. */
  missionsToWin?: number;
}

const KEYS = ["missionsToWin"] as const;

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

/** The overrides in force, as the benchmark stamps them on its page. */
export function describeRuleOverrides(overrides?: RuleOverrides): string {
  return Object.entries(overrides ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}
