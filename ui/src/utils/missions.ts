/**
 * Mission helpers for the UI: the card's title comes from the engine
 * (`describeMission`); everything here is the little line of progress printed
 * under it, and the family colour of the card.
 *
 * Four kinds of card: Destroy, Deliver, Intercept and Survey.
 */
import type { Cargo, Mission, MissionFamily } from '@dangerous-inclinations/engine'
import {
  CARGO_HOLD_CRATES,
  MISSION_FAMILY,
  getWellName,
  missionPoints as pointsForType,
} from '@dangerous-inclinations/engine'
import { TABLE } from '../theme'

export const FAMILY_COLOR: Partial<Record<MissionFamily, string>> = {
  combat: TABLE.danger,
  trade: TABLE.teal,
  daring: TABLE.accent,
}

export function missionFamily(mission: Mission): MissionFamily {
  return MISSION_FAMILY[mission.type]
}

export function missionFamilyColor(mission: Mission): string {
  return FAMILY_COLOR[missionFamily(mission)] ?? TABLE.inkSoft
}

/** One line telling the player how far along a card is, or null if there is none. */
export function missionProgress(mission: Mission, cargo: ReadonlyArray<Cargo>): string | null {
  switch (mission.type) {
    case 'deliver_cargo': {
      const crate = cargo.find(c => c.missionId === mission.id)
      if (crate?.isPickedUp) {
        return `Crate aboard — deliver at ${getWellName(mission.deliveryPlanetId)}`
      }
      // The hold takes one crate (RULES §Missions): a route whose turn has not
      // come yet is waiting on the one in the hold, not on a trip to its
      // station, and saying "load the crate" would send you there for nothing.
      const holdFull =
        cargo.filter(c => c.kind === 'crate' && c.isPickedUp).length >= CARGO_HOLD_CRATES
      return holdFull
        ? `Hold full — deliver first, then load at ${getWellName(mission.pickupPlanetId)}`
        : `Load the crate at ${getWellName(mission.pickupPlanetId)}`
    }
    case 'intercept_transmission':
      return mission.scanAcquired
        ? `Transmission taken — file it at ${getWellName(mission.deliveryPlanetId)}`
        : `Scan them first, then file at ${getWellName(mission.deliveryPlanetId)}`
    case 'survey':
    case 'board':
      if (mission.acquired) return 'Chit aboard — dock anywhere to file it'
      return mission.type === 'survey'
        ? 'End a turn on Black Hole R1'
        : "End a turn in another ship's sector"
    case 'garbage_disposal': {
      const load = cargo.find(c => c.missionId === mission.id)
      return load?.isPickedUp
        ? 'Load aboard — end a turn on Black Hole R1 to drop it'
        : 'Collect a load at any station (it fills your hold)'
    }
    default:
      // Destroy has nothing to track: you either put their hull to 0 or you don't.
      return null
  }
}

/** Points the card scores when completed. */
export function missionPoints(mission: Mission): number {
  return pointsForType(mission.type)
}

/** Short label for the card's family band. */
export function missionFamilyLabel(mission: Mission): string {
  return missionFamily(mission).toUpperCase()
}
