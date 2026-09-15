/**
 * Experiment-only bot hull overrides for the simulator:
 * `--loadouts=hunter=railgun/missiles,radiator,laser,shields;scout=sensor_array/shields,radiator,laser,missiles`
 * (archetype = forward tile / four side tiles). They mutate the bot templates
 * of the process or worker that runs the games. Never used by the server.
 */
import { BOT_LOADOUT_TEMPLATES } from "../ai/behaviors/loadout.ts";
import type { BotArchetype } from "../ai/behaviors/loadout.ts";
import type { ShipLoadout } from "../models/game.ts";
import type { SubsystemType } from "../models/subsystems.ts";

export type LoadoutOverrides = Partial<Record<BotArchetype, ShipLoadout>>;

export function parseLoadoutOverrides(text: string): LoadoutOverrides {
  const out: LoadoutOverrides = {};
  for (const entry of text.split(";")) {
    if (!entry.trim()) continue;
    const eq = entry.indexOf("=");
    if (eq === -1)
      throw new Error(`Loadout override "${entry}" needs archetype=forward/side,side,side,side`);
    const archetype = entry.slice(0, eq).trim() as BotArchetype;
    if (!(archetype in BOT_LOADOUT_TEMPLATES))
      throw new Error(
        `Unknown archetype "${archetype}". Known: ${Object.keys(BOT_LOADOUT_TEMPLATES).join(", ")}`
      );
    const [forward, sides] = entry.slice(eq + 1).split("/");
    const sideSlots = (sides ?? "").split(",").map((s) => s.trim()) as SubsystemType[];
    if (!forward || sideSlots.length !== 4)
      throw new Error(`Loadout override "${entry}" needs one forward tile and four side tiles`);
    out[archetype] = {
      forwardSlots: [forward.trim() as SubsystemType],
      sideSlots: sideSlots as ShipLoadout["sideSlots"],
    };
  }
  return out;
}

export function applyLoadoutOverrides(overrides?: LoadoutOverrides): void {
  if (!overrides) return;
  for (const [archetype, loadout] of Object.entries(overrides) as Array<
    [BotArchetype, ShipLoadout]
  >) {
    BOT_LOADOUT_TEMPLATES[archetype] = loadout;
  }
}
