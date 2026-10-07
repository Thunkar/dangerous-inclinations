/**
 * Every word in the orbital windows, the section at the foot of the route
 * planner (`/tools/route`, `site/tools/OrbitalWindows.tsx`), top to bottom:
 * the head, the station clock and the three hints.
 *
 * Only strings live here. A `{name}` is a slot the caller fills with a
 * number or a name, so every number comes from the engine or the route
 * planner: the words around a slot are free to change, and a slot may move
 * or be dropped but keeps its name. A word set differently inside a sentence
 * is marked with a tag, `<b>` for bold and the few others named where they
 * are used (`<nb>` for a range that must not break across lines, `<link>`).
 */

export const WINDOWS = {
  kicker: 'When to travel',
  title: 'Orbital windows',
  lede: 'Stations, lanes and rings all turn at fixed speeds, so how long a trip takes depends on one number: the station clock.',
  /** Where a hint stands while the route planner is still working. */
  working: 'Asking the route planner',
  /** A delivery route, "Alpha → Gamma". */
  route: '{from} → {to}',

  clock: {
    title: 'The station clock',
    steps:
      'Every station starts on sector {sector} of its planet’s ring {ring} and steps <b>{drift} sectors clockwise</b> at the end of every round. All three step together, so <b>every station is always on the same sector</b>.',
    reads:
      'That sector is the clock. It only ever reads <b>{readings}</b>, and it comes round every {rounds} rounds.',
    /** `<nb>` keeps a range on one line. */
    planets:
      'Every planet is laid out the same: you arrive from the black hole on ring {arriveRing} at sectors <nb>{arriveSectors}</nb>, and leave for it from ring {leaveRing} at sectors <nb>{leaveSectors}</nb>. So the same windows hold for {planets}.',
    diagram: {
      label:
        'A planet seen from above. The station rides ring {ring} and steps {drift} sectors clockwise every round, so it only ever sits on sector {readings}. Ships arrive from the black hole on ring {arriveRing} sectors {arriveSectors} and leave from ring {leaveRing} sectors {leaveSectors}.',
      planet: 'PLANET',
      arrive: 'arrive',
      leave: 'leave',
      foot: 'ring {stationRing}: stations · ring {laneRing}: lanes · +{drift} a round',
    },
  },

  /** Over the three numbered hints. */
  hints: 'Three hints',

  approach: {
    title: 'Getting to a station',
    rule: 'Reach the lane mouth when the clock shows {readings}',
    reason: 'Docked {turns} turns later.',
    strip: 'Clock when you reach the lane mouth → turns until docked',
  },

  tanker: {
    title: 'Tanker: arrive with {fuel}',
    rule: 'Leave the black hole with a full tank, reach the mouth on {readings}',
    reason: 'You dock with {fuel} aboard in {turns} turns.',
    others: ' On the other clocks it takes {turns}.',
    /** `<link>` opens the route planner. */
    planner: 'From anywhere else, set <b>Arrive with {fuel}</b> in the <link>route planner</link>.',
    plain: 'Without a compressor',
    compressed: 'With a compressor',
  },

  leg: {
    title: 'Delivery: the second leg',
    rule: 'Ride the circuit, and leave the pickup station on {readings}',
    reason: '{routes}: {turns} turns, station to station, whenever you leave.',
    strip: 'Clock when you leave → turns to the next station',
  },

  /** The strip of turns under each hint, read aloud. */
  strip: {
    reading: 'on {reading}, {turns}',
    noRoute: 'no route',
    label: '{label}: {readings}. Quickest on {best}.',
    working: '{label}: still being worked out.',
    turns: 'TURNS',
    /** Under the reading the route planner is set to, and the same read aloud. */
    nowTab: 'NOW',
    now: 'The clock now reads {reading}.',
  },
} as const
