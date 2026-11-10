// The print plates for a table of six: each plate is one colour, laid out
// on a Prusa MK4S bed, so whoever owns a printer can print a set for the
// table. `scripts/plates.mjs` packs them into out/plates/<plate>.3mf for
// PrusaSlicer (one bed a file) and draws the sheet of them.
//
// Every colour is the game's where the game draws the piece (`colours.ts`):
// the seats, the planets (each planet's station, sale chips, sector numbers,
// lane markers and coloured bands), the accretion disc, and hull and fuel
// (each die's inlays: its numbers, its stand's icon, the fuel stand's 0), and
// the energy and heat cubes. The
// ship, its base and its subsystems are grey, for players who paint theirs;
// the dice, their stands and the board are black, the black hole's numbers
// and streaks and the planets' other bands white. A plate is one colour and
// one job: a seat's set, the dice, a planet.
import { PLANETS } from './colours.ts'
import { CUBE } from './spec.ts'

/**
 * The MK4S bed, the margin kept clear round it, the gap between pieces, and
 * the gap between the segments of a ring stacked one inside the next, mm.
 */
export const BED = { x: 250, y: 210, margin: 6, gap: 5, nest: 3 }

/** Seats a table set is printed for. */
export const SEATS = 6

/**
 * The plates. `colour` is the plate's (a key of `COLOUR`), or "player" for a
 * plate printed once in each seat's colour; `parts` are out/<path>.stl and how
 * many, and "loose" for a set of inlays laid out as they go on, packed body
 * by body; or `{ concentric: [paths], n }`, pieces printed one round another
 * as they sit on the board, or `{ nested: [paths], n }`, a ring's segments
 * turned alike and stacked one inside the next (`scripts/plates.mjs`). A
 * plate whose parts do not fit one bed is split over several.
 */
export const PLATES = [
  {
    id: 'player-set',
    title: "A player's set (print one in each player's colour)",
    colour: 'player',
    parts: [
      ['holder/caddy', 1],
      ['tokens/missile-token', 3],
      ['tokens/salvo-2', 3],
      ['tokens/salvo-3', 3],
      ['tokens/salvo-4', 3],
      ['tokens/escort-marker', 2],
      ['tokens/ship-token', 1],
      ['tokens/home-marker', 1],
    ],
  },
  ...['corvette', 'shrike', 'mantis'].map(hull => ({
    id: `ship-${hull}`,
    title: `A player's ${hull} and its base (one a player, the hull they fly)`,
    colour: 'grey',
    parts: [
      ['base/base', 1],
      ['base/base-plugs', 1],
      [`${hull}/${hull}-hull`, 1],
      [`${hull}/${hull}-plugs`, 1],
      [`${hull}/${hull}-stand`, 1],
      ...(hull === 'mantis' ? [['mantis/mantis-fins', 1]] : []),
    ],
  })),
  {
    id: 'subsystems',
    title: "A player's subsystems: enough for every loadout card (one a player)",
    colour: 'grey',
    parts: [
      ['modules/railgun', 1],
      ['modules/sensor_array', 1],
      ['modules/fuel_compressor', 1],
      ['modules/laser', 3],
      ['modules/ballistic_rack', 2],
      ['modules/shields', 2],
      ['modules/plasma_cannon', 2],
      ['modules/missiles', 2],
      ['modules/disruptor', 1],
      ['modules/radiator', 1],
    ],
  },
  ...[
    ['energy', 'The energy cubes'],
    ['heat', 'The heat cubes'],
  ].flatMap(([kind, title]) => [
    {
      id: `${kind}-cubes`,
      title: `${title}, for the table`,
      colour: kind,
      parts: [['tokens/cube', CUBE[kind] * SEATS]],
    },
    {
      id: `${kind}-cubes-player`,
      title: `${title}, for one player`,
      colour: kind,
      parts: [['tokens/cube', CUBE[kind]]],
    },
  ]),
  {
    id: 'dice',
    title: "The hull and fuel dice, their stands and the stands' plugs",
    colour: 'black',
    parts: [
      ['dice/d10-pole-odd', 2 * SEATS],
      ['dice/d10-pole-even', 2 * SEATS],
      ['dice/hull-stand', SEATS],
      ['dice/fuel-stand', SEATS],
      ['dice/stand-plug', 2 * SEATS],
    ],
  },
  {
    id: 'hull-inlays',
    title: "The hull dice's inlays",
    colour: 'hull',
    parts: [['dice/hull-inlays', SEATS]],
  },
  {
    id: 'fuel-inlays',
    title: "The fuel dice's inlays",
    colour: 'fuel',
    parts: [['dice/fuel-inlays', SEATS]],
  },
  {
    id: 'white',
    title: 'The pool tray, crates and data',
    colour: 'white',
    parts: [
      ['holder/pool-tray', 1],
      ['tokens/crate-token', 6],
      ['tokens/data-token', 14],
    ],
  },
  {
    id: 'black',
    title: "Wrecks, and the dice's key rings (the dice plate is full)",
    colour: 'black',
    parts: [
      ['tokens/wreck-token', 12],
      ['dice/d10-key', 2 * SEATS],
    ],
  },
  // The board, once a table: the counts are the ones its part files name.
  {
    id: 'board-black',
    title: "The board's rings, hubs and arms, and the black hole's horizon",
    colour: 'black',
    parts: [
      // A hub with rings 1 and 2 round it, as they sit on the board.
      { concentric: ['board/planet/hub', 'board/shared/ring-1', 'board/shared/ring-2'], n: 3 },
      { concentric: ['board/blackHole/hub', 'board/shared/ring-1', 'board/shared/ring-2'], n: 1 },
      // A ring in segments, each turned to face the same way, stacked one inside the next.
      { nested: [1, 2, 3].map(j => `board/shared/ring-3.${j}`), n: 4 },
      { nested: [1, 2, 3, 4, 5, 6].map(j => `board/planet/ring-4.${j}`), n: 3 },
      { nested: [1, 2, 3, 4, 5, 6].map(j => `board/blackHole/ring-4.${j}`), n: 1 },
      { nested: [1, 2, 3, 4, 5, 6].map(j => `board/blackHole/ring-5.${j}`), n: 1 },
      ['board/planet/arm', 18],
      ['board/blackHole/arm', 6],
      ['board/blackHole/horizon', 1],
      ['board/planet/assembly-peg', 3],
    ],
  },
  {
    id: 'board-white',
    title: "The black hole's sector numbers and streaks, and the planets' light bands",
    colour: 'white',
    parts: [
      ['board/shared/numbers', 5, 'loose'],
      ['board/blackHole/streak-inlay', 1, 'loose'],
      ...[2, 4].flatMap(b => ['lower', 'upper'].map(h => [`board/planet/band-${b}-${h}`, 3])),
    ],
  },
  {
    id: 'accretion-disc',
    title: "The black hole's accretion disc",
    colour: 'disc',
    parts: [['board/blackHole/accretion-disc', 1]],
  },
  ...PLANETS.map(planet => ({
    id: planet,
    title: `${planet[0].toUpperCase()}${planet.slice(1)}: its station, sale chips, sector numbers, lane markers and coloured bands`,
    colour: planet,
    parts: [
      ['tokens/station', 1],
      ['tokens/station-plugs', 1],
      [`tokens/sale-chip-${planet}`, 6],
      ['board/shared/numbers', 4, 'loose'],
      ['board/planet/lane', 2],
      ['board/blackHole/lane', 2],
      ['board/planet/band-1', 1],
      ...['lower', 'upper'].map(h => [`board/planet/band-3-${h}`, 1]),
    ],
  })),
]
