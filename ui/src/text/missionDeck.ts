/**
 * Every word on the printed mission decks (`site/missions/`) that the cards
 * themselves do not carry, and the block above them on the cheatsheet page.
 * The fronts are the game's own cards, so their words are the engine's
 * (`engine/src/text/missionCards.ts`); only how a card names a seat lives
 * here, and the backs.
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number: the words around a slot are free to change, and a slot may move or
 * be dropped but keeps its name.
 */
export const MISSION_DECK = {
  /** How a rival card names the seat it counts to, by offset. */
  rivals: {
    1: 'the 1st player to your left',
    2: 'the 2nd player to your left',
    3: 'the 3rd player to your left',
    4: 'the 4th player to your left',
    5: 'the 5th player to your left',
  } as Record<number, string>,

  // -------------------------------------------------------------------------
  // The backs, top to bottom
  // -------------------------------------------------------------------------
  back: {
    game: 'Dangerous Inclinations',
    /** Along the wedge. */
    primary: '{points} points',
    secondary: '{points} point',
  },

  // -------------------------------------------------------------------------
  // The section on the cheatsheet page
  // -------------------------------------------------------------------------
  section: {
    kicker: 'For the table',
    title: 'Mission decks',
    lede: 'The two piles for a table of {players}: {primaries} primaries and {secondaries} secondaries, {width}×{height}mm. With fewer players, take out every Destroy and Intercept that counts to a seat the table does not have.',
    /** Over each pile's cards. */
    rows: {
      primary: 'Primary pile · {cards} cards',
      secondary: 'Secondary pile · {cards} cards',
    },
    print: 'Print',
    flips: { long: 'Long-edge flip', short: 'Short-edge flip' },
    printNote:
      '{pages} A4 pages, nine cards to a page, fronts then backs, each pile on its own pages. Print both sides in colour at actual size, flipping on the {edge} edge, and cut along the marks.',
    edges: { long: 'long', short: 'short' },
  },
} as const
