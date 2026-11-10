/**
 * The experiment channels every simulator command takes, read, applied and
 * stamped in one place: `--tiles=`, `--rules=`, `--bot=` and `--loadouts=`.
 *
 * `--rules=` rides on each game (`GameConfig.rules`, dealt into `createGame`).
 * The other three mutate the configuration of the process that plays the
 * games, so only the entry points that own a process apply them: a CLI in its
 * own process (for its stamps, and for a batch it plays in-process) and each
 * worker thread before it plays a job (`sim/worker.ts`). `runGame` never
 * applies them, so it stays pure, as the browser barrel promises.
 */
import { applyTileOverrides, describeTileOverrides, parseTileOverrides } from './tileOverrides.ts'
import type { TileOverrides } from './tileOverrides.ts'
import { describeRuleOverrides, parseRuleOverrides, type RuleOverrides } from './ruleOverrides.ts'
import { applyBotOverrides, describeBotOverrides, parseBotOverrides } from './botOverrides.ts'
import type { BotOverrides } from './botOverrides.ts'
import {
  applyLoadoutOverrides,
  describeLoadoutOverrides,
  parseLoadoutOverrides,
  type LoadoutOverrides,
} from './loadoutOverrides.ts'

export interface Overrides {
  tiles?: TileOverrides
  rules?: RuleOverrides
  /** `--bot=`: how the bots think (`--bots=N` in `yarn sim` is how many play). */
  bot?: BotOverrides
  loadouts?: LoadoutOverrides
}

/** The channels that mutate the process: what a worker is handed with every job. */
export type ProcessOverrides = Pick<Overrides, 'tiles' | 'bot' | 'loadouts'>

export type OverrideFlag = keyof Overrides

/** What a page calls each channel when it stamps the overrides it ran under. */
export const OVERRIDE_LABEL: Record<OverrideFlag, string> = {
  rules: 'Rule overrides',
  tiles: 'Tile overrides',
  bot: 'Bot overrides',
  loadouts: 'Loadout overrides',
}

/** `--key=value` as a key and a value; a bare `--key` reads as `true`. */
export function splitFlag(raw: string): { key: string; value: string } | null {
  if (!raw.startsWith('--')) return null
  const eq = raw.indexOf('=')
  return eq === -1
    ? { key: raw.slice(2), value: 'true' }
    : { key: raw.slice(2, eq), value: raw.slice(eq + 1) }
}

/**
 * Read one experiment flag into `into`. False when `key` is not an
 * experiment channel; a bad value throws, so a typo never runs.
 */
export function parseOverrideFlag(key: string, value: string, into: Overrides): boolean {
  switch (key) {
    case 'tiles':
      into.tiles = parseTileOverrides(value)
      return true
    case 'rules':
      into.rules = parseRuleOverrides(value)
      return true
    case 'bot':
      into.bot = parseBotOverrides(value)
      return true
    case 'loadouts':
      into.loadouts = parseLoadoutOverrides(value)
      return true
    default:
      return false
  }
}

/** Apply the channels that mutate the process, in this process. */
export function applyOverrides(overrides: ProcessOverrides | undefined): void {
  applyTileOverrides(overrides?.tiles)
  applyBotOverrides(overrides?.bot)
  applyLoadoutOverrides(overrides?.loadouts)
}

/** The channels in force, as `flag text` pairs, in the order the pages stamp them. */
export function describeOverrides(overrides: Overrides): Array<[OverrideFlag, string]> {
  const pairs: Array<[OverrideFlag, string]> = [
    ['rules', describeRuleOverrides(overrides.rules)],
    ['tiles', describeTileOverrides(overrides.tiles)],
    ['bot', describeBotOverrides(overrides.bot)],
    ['loadouts', describeLoadoutOverrides(overrides.loadouts)],
  ]
  return pairs.filter(([, text]) => text !== '')
}
