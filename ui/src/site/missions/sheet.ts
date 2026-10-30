/**
 * Where the mission cards sit on printed A4 pages, in millimetres.
 *
 * The loadout cards' grid (`loadouts/sheet.ts`): nine cards to a page, the
 * same stock. The decks are drawn face-down, so every page of fronts is
 * followed by its page of backs, each back where the printer's flip puts it
 * behind its front (`card/sheet.ts`: mirrored left to right for the long
 * edge, top to bottom and turned over for the short edge).
 */
import { behindLongEdge, behindShortEdge, type PlacedFace } from '../card/sheet'
import { loadoutPages } from '../loadouts/sheet'

export {
  LOADOUT_HEIGHT_MM as MISSION_HEIGHT_MM,
  LOADOUT_WIDTH_MM as MISSION_WIDTH_MM,
} from '../loadouts/sheet'

export type Flip = 'long' | 'short'

export type PlacedCard<T> = { card: T } & PlacedFace

/** The pages one pile prints: a page of fronts, then its backs, and so on. */
export function deckPages<T>(cards: readonly T[], flip: Flip): PlacedCard<T>[][] {
  const behind = flip === 'long' ? behindLongEdge : behindShortEdge
  return loadoutPages(cards).flatMap(page => {
    const fronts = page.map(slot => ({ ...slot, face: 'front' as const, rotated: false }))
    return [fronts, fronts.map(front => ({ card: front.card, ...behind(front) }))]
  })
}
