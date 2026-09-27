/**
 * The words printed on the mission cards, one card at a time in deck order:
 * the name in its title strip, the title (what the card asks for, in a line)
 * and the rule under it. Only strings and templates live here; the callers
 * (`game/describe.ts`, the cheatsheet) pass every number and every name of a
 * planet or a player.
 */
import type { MissionType } from "../models/missions.ts";

export const MISSION_CARDS = {
  destroy_ship: {
    name: "Destroy",
    title: (target: string) => `Destroy ${target}`,
    rule: (target: string) => `Bring the hull of ${target} to 0 with a shot or a missile.`,
    /** Under the card on the cheatsheet: what it needs aboard. */
    needs: "Needs a weapon.",
  },
  deliver_cargo: {
    name: "Deliver",
    title: (pickup: string, delivery: string) => `Deliver ${pickup} → ${delivery}`,
    rule: (pickup: string, delivery: string) =>
      `Load the crate at ${pickup}, then dock at ${delivery} to deliver it.`,
  },
  intercept_transmission: {
    name: "Intercept",
    title: (target: string, filing: string) => `Intercept ${target} → file at ${filing}`,
    rule: (target: string, scanRange: number, filing: string) =>
      `Scan ${target} (same ring, within ${scanRange} sectors), then dock at ${filing} to file it.`,
    /** Under the card on the cheatsheet: what it needs aboard. */
    needs: "Needs a sensor array.",
  },
  survey: {
    name: "Survey",
    title: "Survey the Event Horizon",
    rule: (ring: number) =>
      `End a turn on Black Hole ring ${ring}, then file the data at any station.`,
  },
  piracy: {
    name: "Piracy",
    title: "Seize cargo and sell it",
    rule: "With your hold empty, end a turn on an undocked ship to take its crate or data. Sell it at any station.",
  },
  tanker: {
    name: "Tanker",
    title: (fuel: number) => `Pump ${fuel} fuel into a station`,
    rule: (fuel: number) => `Arrive at a station with ${fuel} or more fuel and pump ${fuel} in.`,
  },
  escort: {
    name: "Escort",
    /** Once the marker is down, the card names the ship it is on. */
    title: (carrier: string) => `Escort ${carrier} until it delivers`,
    /** Before the marker is down. */
    titleUnmarked: "Escort a carrier until it delivers",
    rule: "You may mark an undocked carrier in your sector that has no marker. Done at its next delivery or fuel pump.",
  },
  salvage: {
    name: "Salvage",
    title: "Salvage a wreck's black box and file it",
    rule: "End a turn on a wreck to take its black box, one a turn. File it at any station.",
  },
} satisfies Record<MissionType, { name: string; [text: string]: unknown }>;
