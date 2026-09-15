/**
 * Mission helpers for the UI: the card's title comes from the engine
 * (`describeMission`); everything here is the little line of progress printed
 * under it, and the family colour of the card.
 *
 * Four kinds of card: Destroy, Deliver, Intercept and Survey.
 */
import type { Cargo, Mission, MissionFamily } from '@dangerous-inclinations/engine'
import {
  DEFAULT_RULES,
  MISSION_FAMILY,
  SURVEY_HOLD_TURNS,
  getWellName,
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

/** One line telling the player how far along a card is, or null if there is no progress to show. */
export function missionProgress(mission: Mission, cargo: ReadonlyArray<Cargo>): string | null {
  switch (mission.type) {
    case 'deliver_cargo': {
      const crate = cargo.find(c => c.missionId === mission.id)
      return crate?.isPickedUp
        ? `Crate aboard — deliver at ${getWellName(mission.deliveryPlanetId)}`
        : `Load the crate at ${getWellName(mission.pickupPlanetId)}`
    }
    case 'intercept_transmission':
      return mission.scanAcquired ? 'Transmission taken — dock anywhere' : 'Scan them first'
    case 'survey':
      if (mission.surveyAcquired)
        return `Data aboard — deliver at ${getWellName(mission.deliveryPlanetId)}`
      if (mission.surveyTurns > 0)
        return `Holding Black Hole R1 (${mission.surveyTurns}/${SURVEY_HOLD_TURNS}) — one more turn, sensors on`
      return `${SURVEY_HOLD_TURNS} turns on Black Hole R1 with sensors powered, then dock at ${getWellName(mission.deliveryPlanetId)}`
    default:
      // Destroy has nothing to track: you either put their hull to 0 or you don't.
      return null
  }
}

/** Points the card scores when completed (Destroy is worth more than one). */
export function missionPoints(
  mission: Mission,
  destroyPoints: number = DEFAULT_RULES.destroyPoints
): number {
  return mission.type === 'destroy_ship' ? destroyPoints : 1
}

/** Short label for the card's family band. */
export function missionFamilyLabel(mission: Mission): string {
  return missionFamily(mission).toUpperCase()
}
