/**
 * Mission helpers for the UI: the card's title comes from the engine
 * (`describeMission`); everything here is the little line of progress printed
 * under it, and the family colour of the card.
 *
 * Six kinds of card: the primaries Destroy, Deliver and Intercept, and the
 * secondaries Survey, Piracy and Tanker.
 */
import type { Cargo, Mission, MissionFamily } from '@dangerous-inclinations/engine'
import {
  CARGO_HOLD_CRATES,
  MAX_REACTION_MASS,
  MISSION_FAMILY,
  TANKER_FUEL,
  getWellName,
  missionPoints as pointsForType,
} from '@dangerous-inclinations/engine'
import { TABLE } from '../theme'

export const FAMILY_COLOR: Record<MissionFamily, string> = {
  combat: TABLE.danger,
  trade: TABLE.teal,
  intel: TABLE.violet,
  secondary: TABLE.ochre,
}

export function missionFamily(mission: Mission): MissionFamily {
  return MISSION_FAMILY[mission.type]
}

export function missionFamilyColor(mission: Mission): string {
  return FAMILY_COLOR[missionFamily(mission)]
}

/**
 * One line telling the player how far along a card is, or null if there is
 * none. `fuel` is the ship's tank where the card is drawn next to it (the
 * hand at the table); a Tanker read off the board prints the rule instead.
 */
export function missionProgress(
  mission: Mission,
  cargo: ReadonlyArray<Cargo>,
  fuel?: number
): string | null {
  switch (mission.type) {
    case 'deliver_cargo': {
      const crate = cargo.find(c => c.missionId === mission.id)
      if (crate?.isPickedUp) {
        return `Crate aboard · deliver at ${getWellName(mission.deliveryPlanetId)}`
      }
      // The hold takes one crate (RULES §Missions): a route whose turn has not
      // come yet is waiting on the one in the hold, not on a trip to its
      // station, and saying "load the crate" would send you there for nothing.
      const holdFull =
        cargo.filter(c => c.kind === 'crate' && c.isPickedUp).length >= CARGO_HOLD_CRATES
      return holdFull
        ? `Hold full · deliver first, then load at ${getWellName(mission.pickupPlanetId)}`
        : `Load the crate at ${getWellName(mission.pickupPlanetId)}`
    }
    case 'intercept_transmission':
      return mission.scanAcquired
        ? `Transmission taken · file it at ${getWellName(mission.deliveryPlanetId)}`
        : `Scan them first, then file at ${getWellName(mission.deliveryPlanetId)}`
    case 'survey':
      return mission.acquired
        ? 'Data aboard · dock anywhere to file it'
        : 'End a turn on Black Hole R1'
    case 'piracy': {
      // The loot rides as the card's own crate (engine `seizeLoot`), so the
      // hold answers whether the job is still to find a mark or to sell.
      const loot = cargo.find(c => c.missionId === mission.id)
      return loot?.isPickedUp
        ? 'Sell the loot at any station'
        : 'Find an undocked ship carrying a crate or data'
    }
    case 'tanker':
      return fuel === undefined
        ? `Arrive at a station with ${TANKER_FUEL} fuel`
        : `Arrive at a station with ${TANKER_FUEL} fuel (tank ${fuel}/${MAX_REACTION_MASS})`
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
