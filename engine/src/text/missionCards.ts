/**
 * The words printed on the mission cards, one card at a time in deck order:
 * the name in its title strip, the title (what the card asks for, in a line)
 * and the rule under it. Only strings live here. A `{name}` is a slot the
 * caller (`game/describe.ts`) fills with a number or the name of a planet or
 * a player: the words around a slot are free to change, and a slot may move
 * or be dropped but keeps its name.
 */
import type { MissionType } from "../models/missions.ts";

export const MISSION_CARDS = {
  destroy_ship: {
    name: "Destroy",
    title: "Destroy {target}",
    rule: "Bring the hull of {target} to 0 with a shot or a missile.",
    /** Under the card on the cheatsheet: what it needs aboard. */
    needs: "Needs a weapon that deals damage.",
  },
  deliver_cargo: {
    name: "Deliver",
    title: "Deliver {pickup} → {delivery}",
    rule: "Load the crate at {pickup}, then dock at {delivery} to deliver it.",
  },
  intercept_transmission: {
    name: "Intercept",
    title: "Intercept {target} → file at {filing}",
    rule: "Scan {target} (same ring, within {scanRange} sectors), then dock at {filing} to file it.",
    /** Under the card on the cheatsheet: what it needs aboard. */
    needs: "Needs a sensor array.",
  },
  survey: {
    name: "Survey",
    title: "Survey the Event Horizon",
    rule: "Survey is an action: on Black Hole ring {ring}, take the data. File it at any station.",
  },
  piracy: {
    name: "Piracy",
    title: "Seize cargo and sell it",
    rule: "Seize is an action: in the sector of an undocked ship carrying cargo, take one item of your choice. Sell it at any station.",
  },
  tanker: {
    name: "Tanker",
    title: "Pump {fuel} fuel into a station",
    rule: "Arrive at a station with {fuel} or more fuel and pump {fuel} in.",
  },
  escort: {
    name: "Escort",
    /** Once the marker is down, the card names the ship it is on. */
    title: "Escort {carrier} to a sale",
    /** Before the marker is down. */
    titleUnmarked: "Escort a carrier to a sale",
    rule: "Mark is an action: on the ring of an undocked carrier, mark it. Done at its next sale with you in its well.",
  },
  salvage: {
    name: "Salvage",
    title: "Salvage a wreck's black box and file it",
    rule: "Salvage is an action: on a wreck's sector, take its black box. File it at any station.",
  },
} as const satisfies Record<
  MissionType,
  { name: string; title: string; rule: string; needs?: string; titleUnmarked?: string }
>;
