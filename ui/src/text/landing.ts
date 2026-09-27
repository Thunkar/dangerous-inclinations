/**
 * Every word on the landing page (`site/Landing.tsx`), top to bottom: the
 * hero, the strip of facts, the three doors and the game in four lines.
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
    motto: 'Drift. Burn. Jump. Fire.',
    text: 'Ships orbit a black hole and its three planets. You ride the drift, burn between rings, jump the one-way lanes and fight over cargo and secrets, on the heat you can afford. The first to {points} points from their secret mission cards ends the round.',
    play: 'Play it now',
    learn: 'How to play',
    picture:
      'A black hole with three rings pierced by a red wedge, a planet, and a ship drifting on the middle ring',
  },

  /** The black strip under the hero: a figure and what it counts. */
  facts: {
    players: { value: '{min}–{max}', label: 'players' },
    points: { value: '{points}', label: 'points win' },
    cards: { value: '{cards}', label: 'secret cards' },
    sectors: { value: '{sectors}', label: 'sectors a ring' },
    die: { value: 'd10', label: 'one die' },
  },

  doors: {
    play: {
      title: 'Play',
      blurb:
        'The video game: a live table against bots or friends, on a flat board or in 3D. It is where the rules are playtested, so it always plays them as they stand.',
      cta: 'Take a seat',
    },
    tools: {
      title: 'Table tools',
      blurb:
        'For a game at a real table: the board as a route planner, a heat check that does the sums, and a fistful of d10s for a salvo.',
      cta: 'Open the tools',
    },
    card: {
      title: 'Cheatsheet',
      blurb:
        'How to play, in the order a first game meets it, and the two-sided player card to print and cut for every seat.',
      cta: 'Learn the game',
    },
  },

  lines: {
    kicker: 'The game in four lines',
    title: 'Orbit, heat, dice, cards',
    orbit: {
      title: 'Ride the drift',
      text: 'Every ship drifts by its ring’s speed every turn. Burn to change ring, jump a one-way lane to change planet.',
    },
    heat: {
      title: 'Pay in heat',
      text: 'Every action costs energy, and every point of energy is heat at your check. Past {maxHeat}, the hull pays.',
    },
    fight: {
      title: 'Roll one d10',
      text: 'A 1 misses and a 10 breaks the slot you named. Subsystems stay face-down until they do their job.',
    },
    score: {
      title: '{points} points end it',
      text: 'Hold {cards} secret cards: a primary worth 2 and two worth 1. Reach {points} and the round plays out.',
    },
    more: 'Read the cheatsheet →',
  },
} as const
