/**
 * Mission helpers for the UI: the card's title comes from the engine
 * (`describeMission`); everything here is the little line of progress printed
 * under it, and the family colour of the card.
 *
 * Four kinds of card: Destroy, Deliver, Intercept and Survey.
 */
import type { Cargo, Mission, MissionFamily } from '@dangerous-inclinations/engine'
import { MISSION_FAMILY, getWellName } from '@dangerous-inclinations/engine'
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

/** One line telling the player how far along a card is, or null if there is no progress to show. */
export function missionProgress(mission: Mission, cargo: ReadonlyArray<Cargo>): string | null {
  switch (mission.type) {
    case 'deliver_cargo': {
      const crate = cargo.find((c) => c.missionId === mission.id)
      return crate?.isPickedUp
        ? `Crate aboard — deliver at ${getWellName(mission.deliveryPlanetId)}`
        : `Load the crate at ${getWellName(mission.pickupPlanetId)}`
    }
    case 'intercept_transmission':
      return mission.scanAcquired ? 'Transmission taken — dock anywhere' : 'Scan them first'
    case 'survey':
      return mission.surveyAcquired ? 'Data aboard — dock anywhere' : 'End a turn on Black Hole R1'
    default:
      // Destroy has nothing to track: you either put their hull to 0 or you don't.
      return null
  }
}

/** Short label for the card's family band. */
export function missionFamilyLabel(mission: Mission): string {
  return missionFamily(mission).toUpperCase()
}
