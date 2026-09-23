/**
 * A board model with nothing behind it, for the dev harness.
 *
 * The 3D board renders a `BoardModel` and only that, so it can be worked on
 * without a server, a game or a seat: this fixture stands five ships on two
 * wells, hands one of them a long slide so a screenshot can catch it mid-arc,
 * doubles up two of the sectors so the crowd spread has something to spread,
 * and fills in the rest of the contract with the empty values a quiet board
 * has. Positions and stations come from the engine: nothing here is a rule.
 */
import type { Position, Station } from '@dangerous-inclinations/engine'
import {
  createInitialStations,
  createGame,
  getStationForPlanet,
  stationPosition,
  createSubsystemsFromLoadout,
  BOT_LOADOUT_TEMPLATES,
  DEFAULT_SHIP_APPEARANCE,
  samePosition,
  viewFor,
} from '@dangerous-inclinations/engine'
import type { BoardModel, HomeMarker, ShipToken } from '../../model'
import { crowdOffset, radialPoint } from '../../geometry'
import { visualForPlayer } from '../../../../ships/visual'
import { getPlayerColor } from '../../../../utils/playerColors'

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
    BOT_LOADOUT_TEMPLATES['hauler-tanky'],
    BOT_LOADOUT_TEMPLATES['hunter-aggressive'],
    BOT_LOADOUT_TEMPLATES['interceptor-aggressive'],
    BOT_LOADOUT_TEMPLATES['hunter-tanky'],
    BOT_LOADOUT_TEMPLATES['hauler-aggressive'],
  ]
  state.players.forEach((player, index) => {
    player.hasSubmittedLoadout = true
    player.ship.loadout = templates[index]
    player.ship.subsystems = createSubsystemsFromLoadout(templates[index])
    player.appearance = {
      ...DEFAULT_SHIP_APPEARANCE,
      paint: ['#aab4b2', '#344149', '#926b51', '#6d7f8c', '#8a7a4f'][index],
    }
  })
  state.players[1].ship.subsystems.find(s => s.id === 'forward-0')!.isRevealed = true
  state.players[0].intel.p3 = ['side-2']
  const views = viewFor(state, 'p1').players
  const tokens: Omit<ShipToken, 'crowd'>[] = [
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
  ]

  // The same numbering the board model does, so the harness crowds as a real
  // table does.
  const ships: ShipToken[] = tokens.map(token => {
    const sharing = tokens.filter(other => samePosition(other.position, token.position))
    return { ...token, crowd: { index: sharing.indexOf(token), count: sharing.length } }
  })

  const homes: HomeMarker[] = SEATS.map(seat => ({
    playerId: seat.playerId,
    name: seat.name,
    color: colorOf(seat.playerId),
    position: seat.home,
  }))

  const stations: Station[] = createInitialStations()

  return {
    ships,
    homes,
    stations,
    missiles: [],
    missilePreviews: [],
    plannedPoints: [],
    route: null,
    focusWeapon: null,
    rangeCells: [],
    missilePaths: {},
    selectableIds: ['p3'],
    activeLaneIds: ['alpha-b'],
    onPickDestination: null,
    onPickTarget: playerId => console.log('[fixture] picked target', playerId),
    deployment: null,
    animating: false,
    effects: [],
    ping: null,
    myColor: colorOf('p1'),
    colorOf,
    nameOf,
    positionOf: playerId => ships.find(ship => ship.playerId === playerId)?.position ?? null,
    pointOf: playerId => {
      const token = ships.find(ship => ship.playerId === playerId)
      return token ? radialPoint(token.position, crowdOffset(token.crowd)) : null
    },
  }
}
