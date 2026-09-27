/**
 * The simulator's rule channel: `--rules=missionsToWin=4,oneSalePerStation=1,unlimitedHold=1`.
 *
 * `missionsToWin` overrides nothing in the process. A table plays to
 * three and is offered nothing else, but the number rides on the state, so
 * {@link runGame} can hand it to `createGame` as `pointsToWin` and create
 * every game of a batch playing to another one. Everything else the
 * rules are made of is a constant in `models/`: a game is played under RULES.md
 * and nothing else, and a proposed change to one of those is measured by
 * changing the constant, not by switching it at run time.
 *
 *
 * `oneSalePerStation` is an experiment under measurement, so it is a switch
 * like the tile overrides: {@link applyRuleOverrides} sets
 * `SALE_RULES.oneSalePerStation` in the process (or worker thread) running
 * the games. 1 is on, 0 is off (the rules as they stand). `unlimitedHold`
 * is another, independent of it: it sets `HOLD_RULES.unlimited`.
 *
 * | key               | reaches                                           |
 * |-------------------|---------------------------------------------------|
 * | missionsToWin     | GameState.pointsToWin (default 3), via createGame |
 * | oneSalePerStation | SALE_RULES.oneSalePerStation (default 0)          |
 * | unlimitedHold     | HOLD_RULES.unlimited (default 0)                  |
 */
import { HOLD_RULES, SALE_RULES } from "../models/missions.ts";

export interface RuleOverrides {
  /** Points that trigger the final round; passed to `createGame`, not a binding. */
  missionsToWin?: number;
  /** 1: a station buys one item from each player, once (SALE_RULES). */
  oneSalePerStation?: number;
  /** 1: the hold has no limit and the pirate names the item it seizes (HOLD_RULES). */
  unlimitedHold?: number;
}

const KEYS = ["missionsToWin", "oneSalePerStation", "unlimitedHold"] as const;

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

/** Set the switches the overrides name in this process; keys left out are left alone. */
export function applyRuleOverrides(overrides?: RuleOverrides): void {
  if (overrides?.oneSalePerStation !== undefined)
    SALE_RULES.oneSalePerStation = overrides.oneSalePerStation !== 0;
  if (overrides?.unlimitedHold !== undefined) HOLD_RULES.unlimited = overrides.unlimitedHold !== 0;
}

/** The overrides in force, as the benchmark stamps them on its page. */
export function describeRuleOverrides(overrides?: RuleOverrides): string {
  return Object.entries(overrides ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}
