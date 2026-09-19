/**
 * Experiment-only bot parameter overrides for the simulator:
 * `--bot=criticalOrder=forward,aggressiveness=0.8`
 *
 * Where `--tiles`, `--weapons` and `--rules` change the game, this changes the
 * players: the knobs every bot decides with (`ai/types.BotParameters`). A
 * policy the bots do not use is not measurable, so a proposed one is given to
 * them here first — `criticalOrder=forward` plays a batch in which every
 * critical goes for the bow — and only moves into the defaults once the batch
 * says it is worth having.
 *
 * Like the other channels it mutates the shared configuration of the process
 * (or worker thread) running the games, so every game of a batch is played by
 * the same bots. The server and the UI never see it: they read
 * `DEFAULT_BOT_PARAMETERS` as written.
 */
import { DEFAULT_BOT_PARAMETERS, type BotParameters } from "../ai/types.ts";

export type BotOverrides = Partial<BotParameters>;

/** Keys whose value is one of a fixed set of words, and what those words are. */
const ENUM_VALUES: Partial<Record<keyof BotParameters, readonly string[]>> = {
  targetPreference: ["closest", "weakest", "mission"],
  criticalOrder: ["suppress", "forward"],
};
const BOOLEAN_KEYS: ReadonlySet<keyof BotParameters> = new Set<keyof BotParameters>([
  "conserveAmmo",
  "scanUnknowns",
]);
const NUMBER_KEYS: ReadonlySet<keyof BotParameters> = new Set<keyof BotParameters>([
  "aggressiveness",
  "repairHullThreshold",
  "lowFuelThreshold",
]);

const KEYS: Array<keyof BotParameters> = [
  ...NUMBER_KEYS,
  ...BOOLEAN_KEYS,
  ...(Object.keys(ENUM_VALUES) as Array<keyof BotParameters>),
];

export function parseBotOverrides(text: string): BotOverrides {
  const out: BotOverrides = {};
  for (const pair of text.split(",")) {
    if (!pair.trim()) continue;
    const eq = pair.indexOf("=");
    if (eq === -1) throw new Error(`Bot override "${pair}" needs parameter=value`);
    const key = pair.slice(0, eq).trim() as keyof BotParameters;
    const raw = pair.slice(eq + 1).trim();
    if (!KEYS.includes(key))
      throw new Error(`Unknown bot parameter "${key}". Known: ${KEYS.join(", ")}`);

    const allowed = ENUM_VALUES[key];
    if (allowed) {
      if (!allowed.includes(raw))
        throw new Error(`Bot override "${pair}" must be one of: ${allowed.join(", ")}`);
      (out as Record<string, unknown>)[key] = raw;
    } else if (BOOLEAN_KEYS.has(key)) {
      if (raw !== "true" && raw !== "false")
        throw new Error(`Bot override "${pair}" must be true or false`);
      (out as Record<string, unknown>)[key] = raw === "true";
    } else {
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Bot override "${pair}" needs a number`);
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

export function applyBotOverrides(overrides?: BotOverrides): void {
  if (!overrides) return;
  Object.assign(DEFAULT_BOT_PARAMETERS, overrides);
}

/** The overrides in force, as the benchmark stamps them on its page. */
export function describeBotOverrides(overrides?: BotOverrides): string {
  return Object.entries(overrides ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}
