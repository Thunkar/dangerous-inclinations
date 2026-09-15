/**
 * Rule knobs. The defaults are the rules in RULES.md; the simulator can
 * override them per game to measure a change before it is adopted. A game
 * carries its rules on the state so recordings and replays are
 * self-describing.
 */
export interface RuleSet {
  /**
   * What happens to shield cubes that absorbed damage.
   * - "every_turn": they return to the reactor at once (the shield is refilled
   *   for free on the owner's next energy step);
   * - "on_dock": they are spent — off the shield and out of the reactor — until
   *   the ship docks.
   */
  shieldRefill: "every_turn" | "on_dock";
  /** Cubes a shield tile can hold. Two since 15 Sept 2026 (docs/edge-cases-2026-09-15.md §8). */
  shieldMaxEnergy: number;
  /**
   * Heat the defender takes per point of damage a shield absorbs. Two since
   * 15 Sept 2026: shields were free walls, now soaking a volley is a decision
   * about how much heat to eat (docs/edge-cases-2026-09-15.md §7).
   */
  shieldHeatPerPoint: number;
  /** A critical breaks the named tile even when shields absorbed the whole shot. */
  criticalThroughShields: boolean;
  /** Hull restored when docking. */
  dockHullRepair: number;
  /** Hull points a ship starts (and respawns) with. */
  startingHull: number;
  /** Heat a bare hull sheds at the check each turn (a radiator adds 2). */
  baseDissipation: number;
  /**
   * Points a completed Destroy card is worth. Two since 15 Sept 2026: a kill
   * needs another player's active cooperation to fail and costs the victim
   * two turns and their cargo, and at one point nobody kept the card
   * (docs/experiments-2026-09-15.md).
   */
  destroyPoints: number;
  /** How many of the six Deliver routes go into each player's deck. */
  deliverRoutesDealt: number;
  /**
   * Limit each tile type to maxPerShip copies per ship. Off by default: any
   * tile may fill any slot it fits, repeats included (designer's call, 15 Sept
   * 2026). On, for experiments that want the old one-set-per-player rule.
   */
  tileLimits: boolean;
}

export const DEFAULT_RULES: RuleSet = {
  shieldRefill: "every_turn",
  shieldMaxEnergy: 2,
  shieldHeatPerPoint: 2,
  criticalThroughShields: false,
  dockHullRepair: 3,
  startingHull: 10,
  baseDissipation: 5,
  destroyPoints: 2,
  deliverRoutesDealt: 6,
  tileLimits: false,
};

export function resolveRules(partial?: Partial<RuleSet> | null): RuleSet {
  return { ...DEFAULT_RULES, ...(partial ?? {}) };
}

/** Parse "key=value,key=value" (CLI) into a partial rule set. */
export function parseRuleOverrides(text: string): Partial<RuleSet> {
  const out: Record<string, unknown> = {};
  for (const pair of text.split(",")) {
    if (!pair.trim()) continue;
    const [key, raw] = pair.split("=").map((s) => s.trim());
    if (!(key in DEFAULT_RULES))
      throw new Error(`Unknown rule "${key}". Known: ${Object.keys(DEFAULT_RULES).join(", ")}`);
    const current = DEFAULT_RULES[key as keyof RuleSet];
    if (typeof current === "number") {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`Rule ${key} needs a number, got "${raw}"`);
      out[key] = n;
    } else if (typeof current === "boolean") {
      out[key] = raw === "true" || raw === "1";
    } else {
      out[key] = raw;
    }
  }
  return out as Partial<RuleSet>;
}
