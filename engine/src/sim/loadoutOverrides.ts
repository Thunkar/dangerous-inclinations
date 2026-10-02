/**
 * Experiment-only bot hull overrides for the simulator:
 * `--loadouts=gunship=railgun/laser,laser,shields,radiator;raider=sensor_array/shields,laser,radiator,plasma_cannon`
 * (preset id = forward tile / four side tiles). They mutate the bot presets
 * of the process or worker that runs the games. Never used by the server.
 */
import { BOT_PRESET_LOADOUTS } from "../ai/behaviors/loadout.ts";
import type { BotPresetId } from "../ai/behaviors/loadout.ts";
import type { ShipLoadout } from "../models/game.ts";
import type { SubsystemType } from "../models/subsystems.ts";
import type { MissionType } from "../models/missions.ts";

export type LoadoutOverrides = Partial<Record<BotPresetId, ShipLoadout>>;
/** Hull forced on a given seat (`bot-1`…), whatever preset its hand asks for. */
export type SeatLoadouts = Record<string, ShipLoadout>;

/**
 * Seat id to the kind of primary its hand must lead with.
 *
 * The plan is **dealt, not filtered**: if the shuffle offered that seat no card
 * of the kind asked for, `setupBotGame` swaps one of its primary offers for a
 * printed card of that kind before the bot chooses (see `dealForcedPrimaries`
 * in sim/runGame.ts), so the row measures the plan in every game rather than
 * in the half of them the deal happened to serve. Experiment only: nothing
 * outside the simulator passes this, and the server never touches a deal.
 */
export type SeatHands = Record<string, MissionType>;

/**
 * `--hands=bot-1=destroy,bot-2=intercept`: the primary each named seat keeps.
 * Experiment only: it deals a seat a plan rather than letting it choose one,
 * which is the only way to measure a plan the bots price as second best.
 *
 * Every hand is one primary and two secondaries now (RULES §Missions), so the
 * shape is no longer a thing to force; which primary you are running is.
 */
const PRIMARY_ALIASES: Record<string, MissionType> = {
  destroy: "destroy_ship",
  destroy_ship: "destroy_ship",
  deliver: "deliver_cargo",
  deliver_cargo: "deliver_cargo",
  intercept: "intercept_transmission",
  intercept_transmission: "intercept_transmission",
};

export function parseSeatHands(text: string): SeatHands {
  const out: SeatHands = {};
  for (const entry of text.split(",")) {
    const [seat, kind] = entry.split("=");
    const type = PRIMARY_ALIASES[(kind ?? "").trim()];
    if (!seat || !type) {
      throw new Error(`--hands: expected seat=<destroy|deliver|intercept>, got "${entry}"`);
    }
    out[seat.trim()] = type;
  }
  return out;
}

function parseHull(entry: string, spec: string): ShipLoadout {
  const [forward, sides] = spec.split("/");
  const sideSlots = (sides ?? "").split(",").map((s) => s.trim()) as SubsystemType[];
  if (!forward || sideSlots.length !== 4)
    throw new Error(`Loadout override "${entry}" needs one forward subsystem and four side subsystems`);
  return {
    forwardSlots: [forward.trim() as SubsystemType],
    sideSlots: sideSlots as ShipLoadout["sideSlots"],
  };
}

/** `bot-1=railgun/missiles,radiator,laser,shields;bot-2=...` */
export function parseSeatLoadouts(text: string): SeatLoadouts {
  const out: SeatLoadouts = {};
  for (const entry of text.split(";")) {
    if (!entry.trim()) continue;
    const eq = entry.indexOf("=");
    if (eq === -1)
      throw new Error(`Seat loadout "${entry}" needs seat=forward/side,side,side,side`);
    out[entry.slice(0, eq).trim()] = parseHull(entry, entry.slice(eq + 1));
  }
  return out;
}

export function parseLoadoutOverrides(text: string): LoadoutOverrides {
  const out: LoadoutOverrides = {};
  for (const entry of text.split(";")) {
    if (!entry.trim()) continue;
    const eq = entry.indexOf("=");
    if (eq === -1)
      throw new Error(`Loadout override "${entry}" needs preset=forward/side,side,side,side`);
    const preset = entry.slice(0, eq).trim() as BotPresetId;
    if (!(preset in BOT_PRESET_LOADOUTS))
      throw new Error(
        `Unknown preset "${preset}". Known: ${Object.keys(BOT_PRESET_LOADOUTS).join(", ")}`
      );
    out[preset] = parseHull(entry, entry.slice(eq + 1));
  }
  return out;
}

export function applyLoadoutOverrides(overrides?: LoadoutOverrides): void {
  if (!overrides) return;
  for (const [preset, loadout] of Object.entries(overrides) as Array<
    [BotPresetId, ShipLoadout]
  >) {
    BOT_PRESET_LOADOUTS[preset] = loadout;
  }
}

const describeHull = (hull: ShipLoadout) => `${hull.forwardSlots.join(",")}/${hull.sideSlots.join(",")}`;

/** `--loadouts=` as the CLI echoes it: preset=forward/sides, `;` between. */
export function describeLoadoutOverrides(overrides?: LoadoutOverrides): string {
  return Object.entries(overrides ?? {})
    .map(([preset, hull]) => `${preset}=${describeHull(hull!)}`)
    .join("; ");
}

/** `--seats=` as the CLI echoes it. */
export function describeSeatLoadouts(seats?: SeatLoadouts): string {
  return Object.entries(seats ?? {})
    .map(([seat, hull]) => `${seat}=${describeHull(hull)}`)
    .join("; ");
}

/** `--hands=` as the CLI echoes it. */
export function describeSeatHands(hands?: SeatHands): string {
  return Object.entries(hands ?? {})
    .map(([seat, type]) => `${seat}=${type}`)
    .join(", ");
}
