/**
 * A board model with every plan overlay on it, for the dev harness.
 *
 * The quiet fixture next door (`three/dev/fixtureModel.ts`) stands three ships
 * on a still board; this one gives the same table a turn in progress, because
 * missiles, ranges, routes and deployment sectors cannot be looked at when
 * nobody is playing. Everything that could be asked of the engine is: the
 * missile paths come from `projectMissilePath`, the shaded sectors from
 * `canEngage`, the jump from `getJumpOptions`, the deployment ring from
 * `deploymentPositions`. Only the seats and the shape of the turn are invented,
 * and this file is test data, never a renderer.
 */
import type {
  Missile,
  MovementPlan,
  Position,
  Station,
  Subsystem,
} from '@dangerous-inclinations/engine'
import {
  SECTORS_PER_RING,
  createInitialStations,
  deploymentPositions,
  getJumpOptions,
  canEngage,
  projectMissilePath,
} from '@dangerous-inclinations/engine'
import { getPlayerColor } from '../../../../../utils/playerColors'
import { ringsOf } from '../../../geometry'
import type { BoardModel, HomeMarker, MissilePreview, ShipToken } from '../../../model'

interface FixtureSeat {
  playerId: string
  name: string
  position: Position
  home: Position
}

const SEATS: FixtureSeat[] = [
  {
    playerId: 'p1',
    name: 'Aurora',
    position: { wellId: 'blackhole', ring: 3, sector: 5 },
    home: { wellId: 'blackhole', ring: 4, sector: 5 },
  },
  {
    playerId: 'p2',
    name: 'Kestrel',
    position: { wellId: 'blackhole', ring: 2, sector: 16 },
    home: { wellId: 'blackhole', ring: 4, sector: 13 },
  },
  {
    playerId: 'p3',
    name: 'Vagrant',
    position: { wellId: 'planet-alpha', ring: 3, sector: 6 },
    home: { wellId: 'blackhole', ring: 4, sector: 20 },
  },
]

/** The turret whose reach is shaded: a real loadout tile, powered. */
const FOCUS_WEAPON: Subsystem = {
  id: 'side-0',
  type: 'missiles',
  allocatedEnergy: 2,
  isPowered: true,
  usedThisTurn: false,
  isBroken: false,
  isRevealed: true,
  ammo: 3,
  slotGroup: 'side',
  slotIndex: 0,
}

/** A handful of the deployment ring is still free; the rest is taken. */
const FREE_DEPLOYMENT_SECTORS = [0, 1, 10, 11, 15, 16, 22, 23]

/** Where the route starts, out on the slow ring with a lane ahead of it. */
const ROUTE_ORIGIN: Position = { wellId: 'blackhole', ring: 5, sector: 14 }
const ROUTE_RAMP: Position = { wellId: 'blackhole', ring: 5, sector: 17 }

function seatOf(playerId: string): FixtureSeat | undefined {
  return SEATS.find(seat => seat.playerId === playerId)
}

function colorOf(playerId: string): string {
  return getPlayerColor(SEATS.findIndex(seat => seat.playerId === playerId))
}

function nameOf(playerId: string): string {
  return seatOf(playerId)?.name ?? 'Derelict'
}

/** The engine's own answer, sector by sector, exactly as the board model asks it. */
function rangeCellsFrom(from: Position): Position[] {
  const attacker = { ...from, facing: 'prograde' as const }
  const cells: Position[] = []
  for (const ring of ringsOf(from.wellId)) {
    for (let sector = 0; sector < SECTORS_PER_RING; sector++) {
      const cell: Position = { wellId: from.wellId, ring: ring.ring, sector }
      if (canEngage(FOCUS_WEAPON, attacker, cell)) cells.push(cell)
    }
  }
  return cells
}

const MISSILES: Missile[] = [
  // Riding its ring before it turns in: drift arc, then three flight steps.
  {
    id: 'missile-p1-1',
    ownerId: 'p1',
    targetId: 'p2',
    wellId: 'blackhole',
    ring: 3,
    sector: 10,
    turnFired: 4,
    movesMade: 1,
    criticalTarget: 'engines',
    launchedAfterMove: false,
  },
  // Launched after its ship had moved: it rode along, so there is no drift.
  {
    id: 'missile-p2-1',
    ownerId: 'p2',
    targetId: 'p1',
    wellId: 'blackhole',
    ring: 5,
    sector: 20,
    turnFired: 5,
    movesMade: 0,
    criticalTarget: 'rotation',
    launchedAfterMove: true,
  },
  // Its target has left the board: no path at all, just a dart.
  {
    id: 'missile-p3-1',
    ownerId: 'p3',
    targetId: 'ghost',
    wellId: 'planet-beta',
    ring: 2,
    sector: 3,
    turnFired: 3,
    movesMade: 2,
    criticalTarget: 'scoop',
    launchedAfterMove: false,
  },
]

export interface OverlayFixtureOptions {
  /** Add the destination picker over every sector of every ring. */
  picker?: boolean
  /** Offer the free deployment sectors. */
  deployment?: boolean
  /** Where a click ends up; the harness logs it. */
  onEvent?: (what: string, position: Position | string) => void
}

export function createOverlayFixtureModel(options: OverlayFixtureOptions = {}): BoardModel {
  const { picker = false, deployment = true, onEvent = () => {} } = options

  const ships: ShipToken[] = SEATS.map((seat, index) => ({
    playerId: seat.playerId,
    name: seat.name,
    color: getPlayerColor(index),
    position: seat.position,
    facing: index === 2 ? 'retrograde' : 'prograde',
    isActive: index === 0,
    isMe: index === 0,
    hitPoints: [8, 10, 5][index],
    maxHitPoints: 10,
    heat: [2, 0, 4][index],
  }))

  const homes: HomeMarker[] = SEATS.map((seat, index) => ({
    playerId: seat.playerId,
    name: seat.name,
    color: getPlayerColor(index),
    position: seat.home,
  }))

  const stations: Station[] = createInitialStations()

  const positionOf = (playerId: string): Position | null =>
    ships.find(ship => ship.playerId === playerId)?.position ?? null

  const me = SEATS[0]
  const target = SEATS[1]

  const missilePreviews: MissilePreview[] = [
    {
      id: 'plan-fire-0',
      from: me.position,
      target: target.position,
      launchedAfterMove: false,
      color: colorOf(me.playerId),
      label: `Planned missile at ${target.name} — rides its orbit, then flies up to 3 steps`,
    },
  ]

  const missilePaths: Record<string, Position[]> = {}
  for (const missile of MISSILES) {
    const at = positionOf(missile.targetId)
    if (at) missilePaths[missile.id] = projectMissilePath(missile, at)
  }
  for (const preview of missilePreviews) {
    missilePaths[preview.id] = projectMissilePath(
      { ...preview.from, launchedAfterMove: preview.launchedAfterMove },
      preview.target
    )
  }

  // A real jump out of the lane the route ends on, so the transfer step lands
  // where the engine says it lands.
  const jump = getJumpOptions(ROUTE_RAMP)[0]
  const route: MovementPlan | null = jump
    ? {
        origin: { ...ROUTE_ORIGIN, facing: 'prograde' },
        destination: jump.destination,
        steps: [
          {
            from: { ...ROUTE_ORIGIN, facing: 'prograde' },
            to: ROUTE_RAMP,
            actionType: 'burn_prograde',
            sectorAdjustment: 3,
            requiresRotation: false,
            massCost: 2,
          },
          {
            from: { ...ROUTE_RAMP, facing: 'prograde' },
            to: jump.destination,
            actionType: 'well_transfer',
            sectorAdjustment: 0,
            requiresRotation: false,
            massCost: 3,
          },
        ],
        totalMassCost: 5,
        totalTurns: 2,
        crossesWells: true,
        mode: 'fastest',
        label: 'Fastest',
      }
    : null

  const plannedPoints: Position[] = [
    me.position,
    { wellId: 'blackhole', ring: 3, sector: 9 },
    { wellId: 'blackhole', ring: 2, sector: 9 },
    { wellId: 'blackhole', ring: 2, sector: 11 },
  ]

  const free = deploymentPositions().filter(position =>
    FREE_DEPLOYMENT_SECTORS.includes(position.sector)
  )

  return {
    ships,
    homes,
    stations,
    missiles: MISSILES,
    missilePreviews,
    plannedPoints,
    route,
    focusWeapon: { weapon: FOCUS_WEAPON, from: me.position, facing: 'prograde', afterMoving: false },
    rangeCells: rangeCellsFrom(me.position),
    missilePaths,
    selectableIds: [target.playerId],
    activeLaneIds: ['alpha-b'],
    onPickDestination: picker ? position => onEvent('route destination', position) : null,
    onPickTarget: playerId => onEvent('target', playerId),
    deployment: deployment
      ? { positions: free, onPick: position => onEvent('deploy', position) }
      : null,
    animating: false,
    effects: [],
    ping: null,
    myColor: colorOf(me.playerId),
    colorOf,
    nameOf,
    positionOf,
  }
}
