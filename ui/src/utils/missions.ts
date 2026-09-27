/**
 * Mission helpers for the UI: the card's title comes from the engine
 * (`describeMission`); everything here is the little line of progress printed
 * under it (its words are in `text/missionProgress.ts`), and the family
 * colour of the card.
 *
 * Eight kinds of card: the primaries Destroy, Deliver and Intercept, and the
 * secondaries Survey, Piracy, Tanker, Escort and Salvage.
 */
import type { Cargo, Mission, MissionFamily } from '@dangerous-inclinations/engine'
import {
  CARGO_HOLD_CRATES,
  MAX_REACTION_MASS,
  MISSION_CARDS,
  MISSION_FAMILY,
  dataAboard,
  fill,
  missionPoints as pointsForType,
} from '@dangerous-inclinations/engine'
import { TABLE } from '../theme'
import { MISSION_PROGRESS as P } from '../text/missionProgress'

const FAMILY_COLOR: Record<MissionFamily, string> = {
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
 * What the holder has done so far on a card, or null when nothing yet: the
 * card's own text already says what to do. `fuel` is the ship's tank where the
 * card is drawn next to it (the hand at the table).
 */
export function missionProgress(
  mission: Mission,
  cargo: ReadonlyArray<Cargo>,
  fuel?: number
): string | null {
  const aboard = (id: string) => cargo.some(c => c.missionId === id && c.isPickedUp)
  switch (mission.type) {
    case 'deliver_cargo': {
      if (aboard(mission.id)) return P.deliver_cargo.aboard
      // The hold takes one crate (RULES §Missions): another route's crate
      // aboard means this one waits.
      const holdFull =
        cargo.filter(c => c.kind === 'crate' && c.isPickedUp).length >= CARGO_HOLD_CRATES
      return holdFull ? P.deliver_cargo.holdFull : null
    }
    case 'intercept_transmission':
      return dataAboard({ cargo }, mission) ? P.intercept_transmission : null
    case 'survey':
      return dataAboard({ cargo }, mission) ? P.survey : null
    case 'piracy':
      // The loot rides as the card's own crate (engine `seizeLoot`).
      return aboard(mission.id) ? P.piracy : null
    case 'tanker':
      return fuel === undefined ? null : fill(P.tanker, { fuel, max: MAX_REACTION_MASS })
    case 'escort':
      return mission.markedPlayerId ? P.escort : null
    case 'salvage':
      return aboard(mission.id) ? P.salvage : null
    default:
      // Destroy has nothing to track: their hull reaches 0 or it does not.
      return null
  }
}

/** Points the card scores when completed. */
export function missionPoints(mission: Mission): number {
  return pointsForType(mission.type)
}

/** The card's name, printed in its title strip (`text/missionCards.ts` in the engine). */
export function missionName(mission: Mission): string {
  return MISSION_CARDS[mission.type].name
}

/** Short label for the card's family band. */
export function missionFamilyLabel(mission: Mission): string {
  return missionFamily(mission).toUpperCase()
}
