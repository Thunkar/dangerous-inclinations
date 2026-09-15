/**
 * Rule knobs. The defaults are the rules in RULES.md; the simulator can
 * override them per game (`yarn sim --rules=k=v`) to measure a change before
 * it is adopted. A game carries its rules on the state so recordings and
 * replays are self-describing. Only knobs that are still live questions are
 * kept here; everything decided is a constant in the models.
 */
export interface RuleSet {
  /** Cubes a shield tile can hold. Two since 15 Sept 2026 (docs/edge-cases-2026-09-15.md §8). */
  shieldMaxEnergy: number;
  /**
   * Heat the defender takes per point of damage a shield absorbs. Two since
   * 15 Sept 2026: soaking a volley is a decision about how much heat to eat.
   */
  shieldHeatPerPoint: number;
  /**
   * Points a completed Destroy card is worth. Two since 15 Sept 2026: a kill
   * needs another player's active cooperation to fail and costs the victim
   * two turns and their cargo.
   */
  destroyPoints: number;
}

export const DEFAULT_RULES: RuleSet = {
  shieldMaxEnergy: 2,
  shieldHeatPerPoint: 2,
  destroyPoints: 2,
};

export function resolveRules(partial?: Partial<RuleSet> | null): RuleSet {
  return { ...DEFAULT_RULES, ...(partial ?? {}) };
}

/** Parse "key=value,key=value" (CLI) into a partial rule set. */
export function parseRuleOverrides(text: string): Partial<RuleSet> {
  const out: Record<string, unknown> = {};
  for (const pair of text.split(",")) {
    if (!pair.trim()) continue;
    const eq = pair.indexOf("=");
    const key = (eq === -1 ? pair : pair.slice(0, eq)).trim();
    const raw = (eq === -1 ? "" : pair.slice(eq + 1)).trim();
    if (!(key in DEFAULT_RULES))
      throw new Error(`Unknown rule "${key}". Known: ${Object.keys(DEFAULT_RULES).join(", ")}`);
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`Rule ${key} needs a number, got "${raw}"`);
    out[key] = n;
  }
  return out as Partial<RuleSet>;
}
