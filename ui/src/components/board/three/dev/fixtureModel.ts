/**
 * A board model with nothing behind it, for the dev harness.
 *
 * The 3D board renders a `BoardModel` and only that, so it can be worked on
 * without a server, a game or a seat: this fixture stands six ships on two
 * wells, hands one of them a long slide so a screenshot can catch it mid-arc,
 * doubles up two of the sectors so the crowd spread has something to spread,
 * leaves three wrecks on the doubled black hole sector and one on its own,
 * hangs two Escort markers on the player's own ship, and fills in the rest of
 * the contract with the empty values a quiet board has. Positions and stations come from the engine: nothing here is a rule.
 */
import type { Position, Subsystem } from '@dangerous-inclinations/engine'
import {
  createInitialStations,
  createGame,
  getStationForPlanet,
  stationPosition,
  createSubsystemsFromLoadout,
  BOT_PRESET_LOADOUTS,
  DEFAULT_SHIP_APPEARANCE,
  samePosition,
  viewFor,
} from '@dangerous-inclinations/engine'
import {
  stationMarkers,
  type BoardModel,
  type HomeMarker,
  type ShipToken,
  type WreckToken,
} from '../../model'
import { crowdOffset, radialPoint } from '../../geometry'
import { weaponReach } from '../../reach'
import {
  EFFECT_COLORS,
  PLASMA_GREEN,
  SHIELD_RADIUS,
  type CameraShot,
  type TableEffect,
} from '../../../../animation/beats'
import { visualForPlayer } from '../../../../ships/visual'
import { getPlayerColor } from '../../../../utils/playerColors'
import { TABLE } from '../../../../theme'

interface FixtureSeat {
  playerId: string
  name: string
  position: Position
  home: Position
}

/** Where Alpha's station starts, so a seat can be parked in its berth. */
const ALPHA_BERTH: Position = stationPosition(
  getStationForPlanet(createInitialStations(), 'planet-alpha')!
)

const SEATS: FixtureSeat[] = [
  {
    playerId: 'p1',
    name: 'Aurora',
    position: { wellId: 'blackhole', ring: 4, sector: 5 },
    home: { wellId: 'blackhole', ring: 4, sector: 5 },
  },
  {
    playerId: 'p2',
    name: 'Kestrel',
    position: { wellId: 'blackhole', ring: 2, sector: 16 },
    home: { wellId: 'blackhole', ring: 4, sector: 13 },
  },
  {
    // Moored at Alpha's station, which is the one arrangement the board has to
    // get right that no other fixture shows: a hull parked under the station's
    // deck rather than beside it.
    playerId: 'p3',
    name: 'Vagrant',
    position: ALPHA_BERTH,
    home: { wellId: 'blackhole', ring: 4, sector: 20 },
  },
  {
    // Standing on Aurora's sector: two hulls in one cell, which without the
    // crowd spread are one hull with another inside it.
    playerId: 'p4',
    name: 'Lumen',
    position: { wellId: 'blackhole', ring: 4, sector: 5 },
    home: { wellId: 'blackhole', ring: 4, sector: 8 },
  },
  {
    // A second hull in Alpha's berth: the spread must not push either of them
    // out from under the deck.
    playerId: 'p5',
    name: 'Tender',
    position: ALPHA_BERTH,
    home: { wellId: 'blackhole', ring: 4, sector: 2 },
  },
  {
    // A ring in from Aurora and Lumen and a sector on: inside the box a
    // disruptor fires into, and close enough for a plasma cannon.
    playerId: 'p6',
    name: 'Warden',
    position: { wellId: 'blackhole', ring: 3, sector: 6 },
    home: { wellId: 'blackhole', ring: 4, sector: 16 },
  },
]

/** Long enough that a screenshot taken seconds after load still catches the slide. */
const SLIDE_DURATION = 40000
const SLIDE_HEAD_START = 16000

function colorOf(playerId: string): string {
  return getPlayerColor(SEATS.findIndex(seat => seat.playerId === playerId))
}

function nameOf(playerId: string): string {
  return SEATS.find(seat => seat.playerId === playerId)?.name ?? playerId
}

export function createFixtureModel(now = performance.now()): BoardModel {
  const state = createGame(
    SEATS.map(s => ({ id: s.playerId, name: s.name })),
    42
  )
  const templates = [
    BOT_PRESET_LOADOUTS.freighter,
    BOT_PRESET_LOADOUTS.gunship,
    BOT_PRESET_LOADOUTS.raider,
    BOT_PRESET_LOADOUTS.striker,
    BOT_PRESET_LOADOUTS.runner,
    BOT_PRESET_LOADOUTS.brawler,
  ]
  state.players.forEach((player, index) => {
    player.hasSubmittedLoadout = true
    player.ship.loadout = templates[index]
    player.ship.subsystems = createSubsystemsFromLoadout(templates[index])
    player.appearance = {
      ...DEFAULT_SHIP_APPEARANCE,
      paint: ['#aab4b2', '#344149', '#926b51', '#6d7f8c', '#8a7a4f', '#5c4b63'][index],
    }
  })
  state.players[1].ship.subsystems.find(s => s.id === 'forward-0')!.isRevealed = true
  state.players[0].intel.p3 = ['side-2']
  const views = viewFor(state, 'p1').players
  /** Two markers on Aurora: Kestrel's and Tender's. */
  const escortsOn = (playerId: string): ShipToken['escorts'] =>
    playerId === 'p1'
      ? ['p2', 'p5'].map(id => ({ playerId: id, name: nameOf(id), color: colorOf(id) }))
      : []
  const tokens: Omit<ShipToken, 'crowd' | 'escorts'>[] = [
    {
      playerId: 'p1',
      name: 'Aurora',
      color: colorOf('p1'),
      visual: visualForPlayer(views[0]),
      position: SEATS[0].position,
      facing: 'prograde',
      isActive: false,
      isMe: true,
      hitPoints: 8,
      maxHitPoints: 10,
      heat: 2,
    },
    {
      playerId: 'p2',
      name: 'Kestrel',
      color: colorOf('p2'),
      visual: visualForPlayer(views[1]),
      position: SEATS[1].position,
      facing: 'prograde',
      // Caught between sectors: the slide started before the page did. A burn,
      // so the harness shows a lit engine as well as a moving hull.
      motion: {
        from: { wellId: 'blackhole', ring: 2, sector: 11 },
        kind: 'burn',
        start: now - SLIDE_HEAD_START,
        duration: SLIDE_DURATION,
      },
      isActive: true,
      isMe: false,
      hitPoints: 10,
      maxHitPoints: 10,
      heat: 0,
    },
    {
      playerId: 'p3',
      name: 'Vagrant',
      color: colorOf('p3'),
      visual: visualForPlayer(views[2]),
      position: SEATS[2].position,
      facing: 'retrograde',
      isActive: false,
      isMe: false,
      hitPoints: 5,
      maxHitPoints: 10,
      heat: 4,
    },
    {
      playerId: 'p4',
      name: 'Lumen',
      color: colorOf('p4'),
      visual: visualForPlayer(views[3]),
      position: SEATS[3].position,
      facing: 'prograde',
      isActive: false,
      isMe: false,
      hitPoints: 7,
      maxHitPoints: 10,
      heat: 1,
    },
    {
      playerId: 'p5',
      name: 'Tender',
      color: colorOf('p5'),
      visual: visualForPlayer(views[4]),
      position: SEATS[4].position,
      facing: 'retrograde',
      isActive: false,
      isMe: false,
      hitPoints: 9,
      maxHitPoints: 10,
      heat: 0,
    },
    {
      playerId: 'p6',
      name: 'Warden',
      color: colorOf('p6'),
      visual: visualForPlayer(views[5]),
      position: SEATS[5].position,
      facing: 'prograde',
      isActive: false,
      isMe: false,
      hitPoints: 6,
      maxHitPoints: 10,
      heat: 3,
    },
  ]

  // The same numbering the board model does, so the harness crowds as a real
  // table does.
  const ships: ShipToken[] = tokens.map(token => {
    const sharing = tokens.filter(other => samePosition(other.position, token.position))
    return {
      ...token,
      escorts: escortsOn(token.playerId),
      crowd: { index: sharing.indexOf(token), count: sharing.length },
    }
  })

  // Three wrecks under Aurora and Lumen, which must part from each other and
  // stand clear of both hulls, and one alone on a quiet sector.
  const wreckSites: { id: string; position: Position }[] = [
    { id: 'wreck-1', position: SEATS[0].position },
    { id: 'wreck-2', position: SEATS[0].position },
    { id: 'wreck-3', position: SEATS[0].position },
    { id: 'wreck-4', position: { wellId: 'blackhole', ring: 3, sector: 2 } },
  ]
  const wrecks: WreckToken[] = wreckSites.map(wreck => {
    const sharing = wreckSites.filter(other => samePosition(other.position, wreck.position))
    return {
      ...wreck,
      crowd: {
        index: sharing.indexOf(wreck),
        count: sharing.length,
        ships: ships.filter(ship => samePosition(ship.position, wreck.position)).length,
      },
    }
  })

  const homes: HomeMarker[] = SEATS.map(seat => ({
    playerId: seat.playerId,
    name: seat.name,
    color: colorOf(seat.playerId),
    position: seat.home,
  }))

  const stations = stationMarkers(createInitialStations())

  return {
    ships,
    wrecks,
    homes,
    stations,
    missiles: [],
    missilePreviews: [],
    plannedPoints: [],
    route: null,
    rangeCells: [],
    selectableIds: ['p3'],
    activeLaneIds: ['alpha-b'],
    onPickDestination: null,
    onPickTarget: playerId => console.log('[fixture] picked target', playerId),
    deployment: null,
    animating: false,
    effects: [],
    ping: null,
    shot: null,
    planColor: TABLE.ink,
    colorOf,
    nameOf,
    pointOf: playerId => {
      const token = ships.find(ship => ship.playerId === playerId)
      return token ? radialPoint(token.position, crowdOffset(token.crowd)) : null
    },
  }
}

/** How long one round of {@link fixtureShots} takes, in ms; the harness fires it again on this beat. */
export const SHOTS_CYCLE = 10000

/**
 * A round of fire over the fixture, starting at `t0`, so both boards can be
 * watched (and photographed mid-shot) drawing the guns that have shapes of
 * their own: Warden's plasma cannon hits Aurora and bursts on the hull,
 * Lumen's disruptor is stopped by Warden's shield and fires again and gets
 * through, and Warden fires plasma and then a railgun into Aurora's shield,
 * which soaks both, before a missile half gets through it.
 * The durations and the gaps between them are the animator's at 1x, or
 * `slow` times longer for a camera that takes its time over a frame; the box
 * the disruptor floods is the engine's, asked the way the animator asks it.
 */
export function fixtureShots(t0: number, slow = 1): TableEffect[] {
  const at = (playerId: string) => SEATS.find(seat => seat.playerId === playerId)!.position
  const disruptor: Subsystem = {
    id: 'side-0',
    type: 'disruptor',
    allocatedEnergy: 3,
    usedThisTurn: true,
    rollsThisTurn: 0,
    isBroken: false,
    isRevealed: true,
    slotGroup: 'side',
    slotIndex: 0,
  }
  const ray = (start: number): TableEffect => ({
    id: `ray-${start}`,
    kind: 'ray',
    from: at('p4'),
    to: at('p6'),
    fromId: 'p4',
    toId: 'p6',
    cells: weaponReach(disruptor, at('p4'), 'prograde'),
    stopAt: SHIELD_RADIUS,
    color: EFFECT_COLORS.disruptor,
    start: t0 + start * slow,
    duration: 1150 * slow,
  })
  const flare = (start: number, flare: 'shield' | 'emp'): TableEffect => ({
    id: `flare-${start}`,
    kind: 'flare',
    flare,
    at: at('p6'),
    playerId: 'p6',
    fromId: 'p4',
    color: flare === 'shield' ? TABLE.teal : EFFECT_COLORS.disruptor,
    radius: flare === 'shield' ? SHIELD_RADIUS : 30,
    start: t0 + start * slow,
    duration: 900 * slow,
  })
  const soaked = (
    start: number,
    weapon: 'railgun' | 'missiles',
    strength: number,
    from: Position | undefined
  ): TableEffect => ({
    id: `soaked-${weapon}`,
    kind: 'flare',
    flare: 'shield',
    at: at('p1'),
    playerId: 'p1',
    fromId: 'p6',
    ...(from ? { from } : {}),
    color: TABLE.teal,
    accent: EFFECT_COLORS[weapon],
    strength,
    radius: SHIELD_RADIUS,
    start: t0 + start * slow,
    duration: 900 * slow,
  })
  const plasma = (start: number): TableEffect => ({
    id: `plasma-${start}`,
    kind: 'plasma',
    from: at('p6'),
    to: at('p1'),
    fromId: 'p6',
    toId: 'p1',
    color: EFFECT_COLORS.plasma_cannon,
    start: t0 + start * slow,
    duration: 820 * slow,
  })
  return [
    plasma(0),
    {
      id: 'fireball',
      kind: 'flare',
      flare: 'plasma',
      at: at('p1'),
      playerId: 'p1',
      fromId: 'p6',
      color: PLASMA_GREEN,
      radius: 40,
      start: t0 + 560 * slow,
      duration: 1300 * slow,
    },
    ray(1700),
    flare(2340, 'shield'),
    ray(3500),
    flare(4140, 'emp'),
    plasma(5300),
    {
      id: 'soaked',
      kind: 'flare',
      flare: 'shield',
      at: at('p1'),
      playerId: 'p1',
      fromId: 'p6',
      color: TABLE.teal,
      accent: PLASMA_GREEN,
      radius: SHIELD_RADIUS,
      start: t0 + 5860 * slow,
      duration: 900 * slow,
    },
    {
      id: 'railgun',
      kind: 'beam',
      weapon: 'railgun',
      from: at('p6'),
      to: at('p1'),
      fromId: 'p6',
      toId: 'p1',
      color: EFFECT_COLORS.railgun,
      start: t0 + 7300 * slow,
      duration: 520 * slow,
    },
    soaked(7680, 'railgun', 1, undefined),
    // A missile that came in along Aurora's ring and got half through.
    soaked(8800, 'missiles', 0.5, { wellId: 'blackhole', ring: 4, sector: 4 }),
  ]
}

/** The auto camera's shot for that round of fire: Lumen and Warden, close up. */
export function fixtureDuel(t0: number): CameraShot {
  const at = (playerId: string) => SEATS.find(seat => seat.playerId === playerId)!.position
  return {
    id: 'duel',
    start: t0,
    kind: 'duel',
    attackerId: 'p4',
    targetId: 'p6',
    from: at('p4'),
    to: at('p6'),
  }
}
