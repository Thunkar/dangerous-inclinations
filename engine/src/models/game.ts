import { z } from 'zod'
import type { ShipAppearance } from './appearance.ts'
import { BURN_INTENSITIES } from './rings.ts'
import {
  SUBSYSTEM_CONFIGS,
  type Subsystem,
  type SubsystemId,
  type SubsystemType,
  type HeatState,
} from './subsystems.ts'
import type { Mission, Cargo } from './missions.ts'

const SlotSchema = z
  .enum(Object.keys(SUBSYSTEM_CONFIGS) as [SubsystemType, ...SubsystemType[]])
  .nullable()

/**
 * Ship loadout: one forward slot and four side slots.
 * Fixed systems (engines, thrusters, scoop) are always present.
 */
export const ShipLoadoutSchema = z
  .object({
    forwardSlots: z.tuple([SlotSchema]),
    sideSlots: z.tuple([SlotSchema, SlotSchema, SlotSchema, SlotSchema]),
  })
  .strict()
export type ShipLoadout = z.infer<typeof ShipLoadoutSchema>

export interface LoadoutValidation {
  valid: boolean
  errors: string[]
}

export const DEFAULT_LOADOUT: ShipLoadout = {
  forwardSlots: ['railgun'],
  sideSlots: ['laser', 'laser', 'shields', 'missiles'],
}

/**
 * Three seats. Two players is not offered until it has rules of its own: on
 * the balance seeds seat 1 won 55-59% of two-seat games, and the rival cards
 * count seats a table of two cannot fill.
 */
export const MIN_PLAYERS = 3
/**
 * Six seats. The board holds them comfortably (everyone deploys on the black
 * hole's three home rings, 24 sectors each), but the table changes shape as
 * seats are added: each opponent puts another Destroy and another Intercept in
 * every deck, so a six-player game is a fight and a three-player game is a
 * trade route.
 */
export const MAX_PLAYERS = 6

/** The lowest d10 face that is a critical: a 10, unless a powered sensor widens it. */
export const BASE_CRITICAL_FACE = 10

export const MAX_REACTION_MASS = 10
export const STARTING_REACTION_MASS = 10
export const DEFAULT_DISSIPATION_CAPACITY = 5
export const STARTING_HIT_POINTS = 10

/**
 * The top of the heat track, and the reason there is a track at all.
 *
 * Heat used to reset to zero at every check, which made dissipation a spend
 * limit rather than a rate: under it everything was free and over it
 * everything was strictly dominated, so nobody ever crossed the line. Measured
 * on 18 Sept 2026 over 18,418 acting turns, 69% of turns ended with four or
 * more points of dissipation unused and only 1.5% went over at all, which is
 * also why a critical dumping a powered tile's cubes cost 0.21 hull a game
 * across four seats: there was nothing for it to land on.
 *
 * So heat carries. At a check the excess over MAX_HEAT is hull damage and the
 * track stops there; then the ship dissipates and keeps the rest
 * into the next turn. The long run is unchanged (a ship generating more than
 * it dissipates still pays the difference every turn once it saturates), but there
 * is now a buffer to spend, so running hot is a state you choose to enter and
 * have to climb out of. Ten to match the hull track: one cube, one track.
 */
export const MAX_HEAT = 10

/**
 * Rounds at the start of the game in which nothing reaches another ship.
 *
 * Everyone deploys around the same hole, in a sector they picked while the
 * board was still empty, so before anyone has moved the table is a firing
 * line: the first seat opens on a neighbour who never had a turn, and the
 * three sectors that separate them are inside almost every weapon's box.
 *
 * A scan is the same problem without the damage. The sensor's range is a ring
 * and three sectors, which on a deployment ring is most of the table, and
 * the tile it turns up stays turned up: the first seat would read the loadouts of
 * the seats that had not moved yet, and they could not read back. Holding both
 * for one round costs nothing that cannot be got back and gives every seat one
 * turn to choose where it is standing.
 */
export const OPENING_ROUNDS = 1

/**
 * The round a game starts play on. Deployment hands the board over at this
 * number (`game/deployment.ts`), so it is the first round anyone acts in,
 * not zero, which is the value a game carries while it is still being set up.
 */
export const FIRST_TURN = 1

/** Whether `state.turn` is still inside the opening round: no firing, no scanning. */
export function isOpeningRound(turn: number): boolean {
  return turn < FIRST_TURN + OPENING_ROUNDS
}

/**
 * Whether this seat's turn is a quiet one: it fires at nobody (missile
 * launches included) and it scans nobody. The opening round is quiet for
 * everyone (RULES §A Turn), and so is a ship's first turn back from Home,
 * which is a first round of its own (RULES §Destruction and Respawn).
 */
export function isQuietTurn(turn: number, me: { recovering: boolean }): boolean {
  return isOpeningRound(turn) || me.recovering
}

const FacingSchema = z.enum(['prograde', 'retrograde'])
export type Facing = z.infer<typeof FacingSchema>

/** The facing a rotation turns a ship to. */
export function oppositeFacing(facing: Facing): Facing {
  return facing === 'prograde' ? 'retrograde' : 'prograde'
}
/** A burn's strength: the keys of `BURN_COSTS`. */
export type BurnIntensity = (typeof BURN_INTENSITIES)[number]

export type GravityWellId = string // 'blackhole' | 'planet-alpha' | ...
export type GravityWellType = 'blackhole' | 'planet'

export interface Position {
  wellId: GravityWellId
  ring: number
  sector: number
}

export interface RingConfig {
  ring: number
  velocity: number // sectors per turn
}

export interface GravityWell {
  id: GravityWellId
  name: string
  type: GravityWellType
  rings: RingConfig[]
}

/**
 * A contiguous run of sectors on one ring that belongs to a transfer lane.
 */
export interface TransferArc {
  wellId: GravityWellId
  ring: number
  startSector: number
  length: number
}

/**
 * A one-way lane connecting an arc on the black hole's outer ring with an
 * arc on a planet's outer ring. Jumping keeps the ship's offset inside the arc.
 */
export interface TransferLane {
  id: string
  planetId: GravityWellId
  /**
   * Lanes are one-way: an outbound lane is jumped from its black hole arc to
   * its planet arc, an inbound lane from its planet arc back to the black hole.
   */
  direction: 'outbound' | 'inbound'
  blackHoleArc: TransferArc
  planetArc: TransferArc
}

/**
 * Missile in flight. Missiles are public tokens on the board.
 */
export interface Missile {
  id: string
  ownerId: string
  targetId: string
  wellId: GravityWellId
  ring: number
  sector: number
  /**
   * Times this missile has moved: its launch flight, then once at the end of
   * each of its owner's turns. Expires at maxMoves.
   */
  movesMade: number
  /**
   * Flown already, on its launch flight, this very turn: the end-of-turn
   * move skips it and clears the mark, so no missile carries it between turns.
   */
  launchedThisTurn?: true
  /** Slot the warhead breaks on a critical hit. */
  criticalTarget: SubsystemId
}

export interface ShipState {
  wellId: GravityWellId
  ring: number
  sector: number
  facing: Facing
  /**
   * Fuel aboard. Public (RULES §Hidden Information): the cubes sit on the loadout
   * where anyone can count them. A tank was private and a spent pile public
   * for a day, which fooled nobody: every ship starts with the same ten and
   * every burn is announced, so the arithmetic was there for the doing.
   */
  reactionMass: number
  hitPoints: number
  maxHitPoints: number
  subsystems: Subsystem[]
  heat: HeatState
  loadout: ShipLoadout
}

/**
 * Every action a turn may carry, as the wire schema that checks it and the
 * type the engine reads: one definition, so a new field is one edit. The
 * engine still judges the semantics (range, whose turn it is); anything that
 * is not exactly one of these shapes is refused before it gets there, so a
 * malformed action fails the whole submission and never turns into a coast.
 */
const actionId = z.string().min(1)
const actionInt = z.number().int().finite()
const actionBase = {
  playerId: actionId,
  /** Tactical actions (power/rotate/move/fire/scan/jump/seize/survey/salvage/escort_mark) execute in sequence order; clients number them from 1. */
  sequence: z.number().int().finite().positive().optional(),
}

const CoastActionSchema = z
  .object({
    ...actionBase,
    type: z.literal('coast'),
    data: z.object({ activateScoop: z.boolean() }).strict(),
  })
  .strict()

const BurnActionSchema = z
  .object({
    ...actionBase,
    type: z.literal('burn'),
    data: z
      .object({
        burnIntensity: z.enum(BURN_INTENSITIES as [BurnIntensity, ...BurnIntensity[]]),
        sectorAdjustment: actionInt,
      })
      .strict(),
  })
  .strict()

const RotateActionSchema = z
  .object({
    ...actionBase,
    type: z.literal('rotate'),
    data: z.object({ targetFacing: FacingSchema }).strict(),
  })
  .strict()

/** Power one of the tiles that work on other players' turns (POWERABLE_TYPES). `amount` is shields' 1 or 2; absent means the tile's minimum. */
const PowerActionSchema = z
  .object({
    ...actionBase,
    type: z.literal('power'),
    data: z.object({ subsystemId: actionId, amount: actionInt.optional() }).strict(),
  })
  .strict()

const FireWeaponActionSchema = z
  .object({
    ...actionBase,
    type: z.literal('fire_weapon'),
    data: z
      .object({
        /** Which weapon fires. */
        subsystemId: actionId,
        targetPlayerId: actionId,
        /** Slot to break if the shot is a critical hit. */
        criticalTarget: actionId,
        /** Railgun only: engines cancel the recoil (1 mass, engine heat). */
        compensateRecoil: z.boolean().optional(),
        /**
         * Missiles only: how many of the tile's remaining rounds this launch puts
         * in the air, all at the same ship and the same critical slot. Absent is
         * one. The whole salvo is one use of the tile, so it costs the tile's
         * cubes in heat once whatever its size: the magazine is what limits
         * missiles, not the heat. The validator bounds it against the rounds aboard.
         */
        count: z.number().int().min(1).optional(),
      })
      .strict(),
  })
  .strict()

const ScanActionSchema = z
  .object({
    ...actionBase,
    type: z.literal('scan'),
    data: z
      .object({
        targetPlayerId: actionId,
        /** Face-down slot of the target to look at. */
        peekSlot: actionId,
      })
      .strict(),
  })
  .strict()

const WellTransferActionSchema = z
  .object({
    ...actionBase,
    type: z.literal('well_transfer'),
    data: z
      .object({
        destinationWellId: actionId,
        /**
         * Phasing, as on a burn: sectors to shift the arrival for 1 fuel each,
         * bounded by the arrival arc. 0 lands on the matching sector.
         */
        sectorAdjustment: actionInt,
      })
      .strict(),
  })
  .strict()

/**
 * A standing order for the turn, not a tactical action: name the tile the crew
 * will get to if the ship is cold at its heat check. It has no sequence because
 * it does not happen at a point in the turn: it happens at the end of it, and
 * only if nothing on the loadout made heat.
 */
const RepairActionSchema = z
  .object({
    ...actionBase,
    type: z.literal('repair'),
    data: z.object({ subsystemId: actionId }).strict(),
  })
  .strict()

/**
 * A standing order for the turn, like a repair: what the visit does if the
 * turn ends by arriving at a station (RULES §Stations). No sequence, because
 * docking happens after every action. A choice the visit cannot make is not
 * refused: the visit makes the default instead (`salesOnArrival`).
 */
const DockSaleActionSchema = z
  .object({
    ...actionBase,
    type: z.literal('dock_sale'),
    data: z
      .object({
        /**
         * The item sold, by its cargo id; `SELL_FUEL` for a Tanker's pump;
         * `LOAD_CRATES` to load the crates waiting instead of selling; or
         * `SELL_NOTHING` to do nothing and keep the station for later.
         */
        sale: actionId,
      })
      .strict(),
  })
  .strict()

/**
 * Escort (RULES §Missions, Escort): put a marker on this carrier, at this
 * point in the sequence. The escort is on the carrier's ring there, neither
 * ship is moored (the escort by the berth it began the turn on, as for
 * firing), the carrier carries cargo, takes no marker yet and is not just
 * back from Home, and an undone Escort's marker is in hand. A carrier
 * destroyed earlier in the turn is skipped, like a shot at it; anything else
 * that does not hold is refused. One per marker in hand, each naming a
 * different ship. Not a use of any subsystem: it puts no energy anywhere.
 */
const EscortMarkActionSchema = z
  .object({
    ...actionBase,
    type: z.literal('escort_mark'),
    data: z.object({ carrierId: actionId }).strict(),
  })
  .strict()

/**
 * Survey (RULES §Missions, Survey): take the data, at this point in the
 * sequence. The ship is on Black Hole Ring 1 there and an undone Survey has
 * no data aboard; the first such card in hand takes it. One dive a turn, and
 * no subsystem used.
 */
const SurveyActionSchema = z
  .object({
    ...actionBase,
    type: z.literal('survey'),
    data: z.object({}).strict(),
  })
  .strict()

/**
 * Salvage (RULES §Missions, Salvage): take a wreck's black box, at this
 * point in the sequence. The ship is on the wreck's sector there, moored or
 * not, and an undone Salvage has no black box aboard; the first such card in
 * hand takes it. One wreck a turn, and no subsystem used. With no `wreckId`
 * it takes the first wreck in the sector at that point (a kill earlier in the
 * turn leaves one there), and is skipped if there is none.
 */
const SalvageActionSchema = z
  .object({
    ...actionBase,
    type: z.literal('salvage'),
    data: z.object({ wreckId: actionId.optional() }).strict(),
  })
  .strict()

/**
 * Piracy (RULES §Missions, Piracy): take this item off this ship, at this
 * point in the sequence. The pirate shares the ship's sector there, neither
 * ship is moored, the ship is not just back from Home, the item is aboard and
 * a Piracy card is free to take it (undone, no loot of its own aboard). A
 * ship destroyed earlier in the turn is skipped, like a shot at it; anything
 * else that does not hold is refused. Not a use of any subsystem: it puts no
 * energy anywhere.
 */
const SeizeActionSchema = z
  .object({
    ...actionBase,
    type: z.literal('seize'),
    data: z.object({ victimId: actionId, cargoId: z.string() }).strict(),
  })
  .strict()

/** Every action a turn may submit, as the wire checks it. Deployment is not one: it has its own route. */
export const PlayerActionSchema = z.discriminatedUnion('type', [
  CoastActionSchema,
  BurnActionSchema,
  RotateActionSchema,
  PowerActionSchema,
  FireWeaponActionSchema,
  ScanActionSchema,
  WellTransferActionSchema,
  RepairActionSchema,
  DockSaleActionSchema,
  EscortMarkActionSchema,
  SeizeActionSchema,
  SurveyActionSchema,
  SalvageActionSchema,
])

export type CoastAction = z.infer<typeof CoastActionSchema>
export type BurnAction = z.infer<typeof BurnActionSchema>
export type RotateAction = z.infer<typeof RotateActionSchema>
export type PowerAction = z.infer<typeof PowerActionSchema>
export type FireWeaponAction = z.infer<typeof FireWeaponActionSchema>
export type ScanAction = z.infer<typeof ScanActionSchema>
export type WellTransferAction = z.infer<typeof WellTransferActionSchema>
export type RepairAction = z.infer<typeof RepairActionSchema>
export type DockSaleAction = z.infer<typeof DockSaleActionSchema>
export type EscortMarkAction = z.infer<typeof EscortMarkActionSchema>
export type SurveyAction = z.infer<typeof SurveyActionSchema>
export type SalvageAction = z.infer<typeof SalvageActionSchema>
export type SeizeAction = z.infer<typeof SeizeActionSchema>

export type PlayerAction = z.infer<typeof PlayerActionSchema>
/** Every action but the two standing orders, which carry no sequence. */
export type TacticalAction = Exclude<PlayerAction, RepairAction | DockSaleAction>

/** Every action a turn may submit: the schema's own list. */
export const PLAYER_ACTION_TYPES: ReadonlySet<PlayerAction['type']> = new Set(
  PlayerActionSchema.options.map(option => option.shape.type.value)
)

/** The three moves; a turn takes at most one. */
export const MOVE_ACTION_TYPES: ReadonlySet<PlayerAction['type']> = new Set([
  'coast',
  'burn',
  'well_transfer',
])

/** Standing orders: named with the turn and settled at its end, so they carry no sequence. */
const STANDING_ORDER_TYPES: ReadonlySet<PlayerAction['type']> = new Set<
  (RepairAction | DockSaleAction)['type']
>(['repair', 'dock_sale'])

export function isTacticalAction(action: PlayerAction): action is TacticalAction {
  return !STANDING_ORDER_TYPES.has(action.type)
}

export interface Player {
  /**
   * Set by a loadout submission that paints the ship. Bots and seat agents
   * submit none, and a ship nobody painted flies the reference corvette.
   */
  appearance?: ShipAppearance
  id: string
  name: string
  ship: ShipState
  /** Offered during loadout; the player keeps MISSIONS_PER_PLAYER of them. */
  missionOffers: Mission[]
  missions: Mission[]
  points: number
  cargo: Cargo[]
  hasDeployed: boolean
  hasSubmittedLoadout: boolean
  /** Where the ship deployed; destroyed ships return here. */
  home: Position | null
  /**
   * Back from the dead and untouchable: set when the ship is placed at Home
   * on its respawn turn, cleared at the end of the turn its owner plays next.
   * While it is set nobody may fire at, scan or missile this ship, and the
   * ship itself fires at nobody and scans nobody on that turn: coming back is
   * deploying again, so it is a first round of its own (RULES §Destruction
   * and Respawn).
   */
  recovering: boolean
  /**
   * Planets whose station this player has sold at: each buys one item from
   * them, once, and nothing more after it. Public: a marker on the station.
   */
  soldAt: string[]
  /**
   * Face-down slots of other players this player has seen through scans.
   * Private knowledge; the table only sees face-up tiles.
   */
  intel: Record<string, SubsystemId[]>
}

export type GamePhase = 'loadout' | 'deployment' | 'active' | 'ended'

export interface Station {
  id: string
  planetId: GravityWellId
  ring: number
  sector: number
}

/**
 * What a destroyed ship leaves behind (RULES §Missions, Salvage). Public. It
 * stays until a Salvage holder takes it, and drifts once a round with the
 * stations by its ring's speed.
 */
export interface Wreck {
  id: string
  wellId: GravityWellId
  ring: number
  sector: number
}

/**
 * Dynamic game state. Static data (wells, lanes, configs) lives in constants.
 * The state carries no log: `executeTurn` returns the events of each turn and
 * callers (server, sim, recording) keep the history.
 */
export interface GameState {
  turn: number
  activePlayerIndex: number
  players: Player[]
  missiles: Missile[]
  stations: Station[]
  wrecks: Wreck[]
  phase: GamePhase
  winnerId?: string
  /**
   * Someone has reached {@link GameState.pointsToWin}: the round is played out
   * so every seat gets the same number of turns, then the standings decide.
   */
  finalRound?: boolean
  /**
   * Points that trigger the final round: three at a table. Fixed for the game;
   * the simulator may set another number to measure it.
   */
  pointsToWin: number
  // Determinism
  rngSeed: number
  rngState: number
  nextEntityId: number
}
