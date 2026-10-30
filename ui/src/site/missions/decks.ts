/**
 * The two printed piles as the game's missions, so the game's own card can
 * draw them.
 *
 * Both piles are the engine's (`buildPrimaryDeck` at the largest table, which
 * smaller tables take cards out of, and `buildSecondaryDeck`), in its order.
 * A card counts seats; `cardForPlayer` turns the count into a player id, so
 * the cards are dealt to seat 0 of a table whose seats are named by their
 * distance to the left, and `nameOf` reads that distance back as words.
 */
import {
  MAX_PLAYERS,
  MISSION_POINTS,
  assignMissionId,
  buildPrimaryDeck,
  buildSecondaryDeck,
  cardForPlayer,
} from '@dangerous-inclinations/engine'
import type { DeckCard, Mission } from '@dangerous-inclinations/engine'
import { MISSION_DECK } from '../../text/missionDeck'

export type Pile = 'primary' | 'secondary'

const SEAT = 'left-'
const SEATS = Array.from({ length: MAX_PLAYERS }, (_, i) => ({ id: `${SEAT}${i}` }))

/** A seat named by its distance to the holder's left, in the card's words. */
export function nameOf(playerId: string): string {
  const offset = Number(playerId.slice(SEAT.length))
  return MISSION_DECK.rivals[offset] ?? playerId
}

const asMissions = (pile: Pile, cards: DeckCard[]): Mission[] =>
  cards.map((card, i) => assignMissionId(cardForPlayer(card, 0, SEATS), `${pile}-${i}`, ''))

export const PILES: Record<Pile, Mission[]> = {
  primary: asMissions('primary', buildPrimaryDeck(MAX_PLAYERS)),
  secondary: asMissions('secondary', buildSecondaryDeck()),
}

/** What a card from the pile is worth: every card in a pile is worth the same. */
export const PILE_POINTS: Record<Pile, number> = {
  primary: MISSION_POINTS[PILES.primary[0].type],
  secondary: MISSION_POINTS[PILES.secondary[0].type],
}
