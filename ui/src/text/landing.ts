/**
 * Every word on the landing page (`site/Landing.tsx`), top to bottom: the
 * hero, the strip of facts and the three doors.
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number from the engine: the words around a slot are free to change, and a
 * slot may move or be dropped but keeps its name.
 */

export const LANDING = {
  hero: {
    kicker: 'A tabletop game for {min}–{max} players',
    /** Two lines, the second in red. */
    title: ['Dangerous', 'Inclinations'],
    motto: 'Burn. Jump. Fire.',
    text: 'Ships orbit a black hole and its three planets. Perform perfectly timed orbital manoeuvres, fight over cargo and secrets and carefully handle your heat levels. The first to score {points} points from their secret mission cards ends the round.',
    play: 'Play it now',
    learn: 'How to play',
    picture:
      'A black hole with three rings pierced by a red wedge, a planet, and a ship drifting on the middle ring',
  },

  /**
   * The black strip under the hero: a figure and what it means at the table,
   * one hook each for someone who has never played.
   */
  facts: {
    players: { value: '{min}–{max}', label: 'players around one black hole' },
    slots: { value: '{slots}', label: 'hidden subsystems on every ship' },
    cards: { value: '{cards}', label: 'secret missions in your hand' },
  },

  doors: {
    play: {
      title: 'Play',
      blurb: 'The video game: a live table against bots or friends.',
      cta: 'Take a seat',
    },
    tools: {
      title: 'Table tools',
      blurb:
        'For a game at a real table: the board as a route planner, a heat check that does the sums, and a fistful of d10s.',
      cta: 'Open the tools',
    },
    card: {
      title: 'Cheatsheet',
      blurb: 'How to play, and the two-sided player card to print and cut for every seat.',
      cta: 'Learn the game',
    },
  },
} as const
