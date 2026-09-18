/**
 * What a seat can legally do right now, computed from its own view with the
 * same pure functions the UI uses for previews. Agents read this instead of
 * guessing, so an illegal move is never their only option.
 */
import type { BurnIntensity, Facing, PlayerAction, Position } from "../models/game.ts";
import { DEFAULT_DISSIPATION_CAPACITY, MAX_HEAT, isOpeningRound } from "../models/game.ts";
import type { SubsystemId } from "../models/subsystems.ts";
import { getSubsystemConfig } from "../models/subsystems.ts";
import {
  BURN_COSTS,
  SECTOR_ADJUSTMENT_COST_PER_SECTOR,
  WELL_TRANSFER_COSTS,
  calculateJumpMassCost,
  getAdjustmentRange,
} from "../models/rings.ts";

const BURN_INTENSITIES: BurnIntensity[] = ["soft", "medium", "hard"];
import { getJumpAdjustmentRange, getJumpOptions, getMaxRing } from "../models/gravityWells.ts";
import { SCAN_SECTOR_RANGE } from "../models/missions.ts";
import type { GameView } from "../game/view.ts";
import { ringVelocity, sectorDistance } from "../game/geometry.ts";
import { isInWeaponRange } from "../game/targeting.ts";
import { projectPosition, type MovementPreview } from "../game/movement.ts";
import { isMooredAt } from "../game/stations.ts";
import { hasWorkingCompressor } from "../game/ship.ts";

export interface BurnOption {
  intensity: BurnIntensity;
  /** Facing the burn needs (prograde burns outward, retrograde inward). */
  facing: Facing;
  toRing: number;
  engineEnergy: number;
  fuel: number;
  /** Phasing allowed on arrival (fuel per sector). */
  adjustment: { min: number; max: number };
  /** Whether the ship must rotate first (one thruster cube, one heat). */
  needsRotation: boolean;
}

export interface WeaponOption {
  weapon: SubsystemId;
  type: string;
  damage: number;
  energy: number;
  /** Opponents in range from where the ship is now (before any move). */
  targetsNow: string[];
  /** Opponents in range after a plain coast. */
  targetsAfterCoast: string[];
  ready: boolean;
  reason?: string;
}

export interface SeatOptions {
  position: Position & { facing: Facing };
  velocity: number;
  reactorFree: number;
  fuel: number;
  /** Heat the turn may still make before the track redlines, shields' standing cost already deducted. */
  heatBudget: number;
  /** Heat already on the track, carried in from last turn. */
  heatCarried: number;
  /** Heat powered shields will add at the check, whether or not they absorb. */
  standingHeat: number;
  /** Dissipated at every check. What is not dissipated carries to the next turn. */
  dissipation: number;
  /**
   * Broken tiles, and whether a repair could land this turn: only a ship that
   * carries no heat in and makes none can name one (RULES §Heat check).
   */
  repair: { broken: SubsystemId[]; possibleThisTurn: boolean };
  burns: BurnOption[];
  jump: {
    destinationWellId: string;
    destination: Position;
    energy: number;
    /** Fuel for an unphased jump (0 with a working compressor). */
    fuel: number;
    /** Fuel each sector of phasing costs; a compressor does not pay for it. */
    phasingFuel: number;
    /** Sectors the landing may be shifted by, bounded by the arrival arc. */
    adjustment: { min: number; max: number };
  } | null;
  /** Docked at a station: a coast holds the berth, only a burn casts off. */
  moored: boolean;
  /** Fuel a scoop would gain this turn. */
  scoopGain: number;
  weapons: WeaponOption[];
  scanTargets: string[];
  /** Minimum cubes each of the ship's tiles needs to work. */
  tileMinimums: Array<{
    id: SubsystemId;
    type: string;
    min: number;
    max: number;
    now: number;
    broken: boolean;
  }>;
}

/** Everything the active seat may legally do this turn. */
export function seatOptions(view: GameView): SeatOptions {
  const me = view.me;
  if (!me) throw new Error("A spectator has no options");
  const ship = me.ship;
  const here = { wellId: ship.wellId, ring: ship.ring, sector: ship.sector, facing: ship.facing };
  const velocity = ringVelocity(ship.wellId, ship.ring);
  const compressor = hasWorkingCompressor(ship);

  /**
   * A move needs working hardware and fuel, not just room on the board. These
   * were geometry-only and listed every burn the rings allowed, so a ship with
   * broken engines was told it could burn, the dry run refused it, and the
   * agent went round the loop with nothing in the options to tell it why.
   */
  const working = (id: SubsystemId) => {
    const sub = ship.subsystems.find((x) => x.id === id);
    return sub !== undefined && !sub.isBroken;
  };
  const enginesWork = working("engines");
  const thrustersWork = working("rotation");

  const burns: BurnOption[] = [];
  for (const facing of enginesWork ? (["prograde", "retrograde"] as Facing[]) : []) {
    const needsRotation = facing !== ship.facing;
    if (needsRotation && !thrustersWork) continue;
    for (const intensity of BURN_INTENSITIES) {
      const cost = BURN_COSTS[intensity];
      const toRing = ship.ring + (facing === "prograde" ? 1 : -1) * cost.rings;
      if (toRing < 1 || toRing > getMaxRing(ship.wellId)) continue;
      if (cost.mass > ship.reactionMass) continue;
      burns.push({
        intensity,
        facing,
        toRing,
        engineEnergy: cost.energy,
        fuel: cost.mass,
        adjustment: getAdjustmentRange(velocity),
        needsRotation,
      });
    }
  }

  const jumpOption = enginesWork ? getJumpOptions(here)[0] : undefined;
  const jump =
    jumpOption && calculateJumpMassCost(0, compressor) <= ship.reactionMass
    ? {
        destinationWellId: jumpOption.destination.wellId,
        destination: jumpOption.destination,
        energy: WELL_TRANSFER_COSTS.energy,
        fuel: calculateJumpMassCost(0, compressor),
        phasingFuel: SECTOR_ADJUSTMENT_COST_PER_SECTOR,
        adjustment: getJumpAdjustmentRange(jumpOption),
      }
    : null;
  const moored = isMooredAt(view.stations, here);

  const opponents = view.players.filter((p) => !p.isMe && p.ship && !p.ship.isDestroyed);
  const afterCoast = projectPosition(ship, ship.facing, {
    kind: "coast",
    moored,
  } as MovementPreview);
  // The opening round reaches nobody: no shot and no scan (RULES §Firing).
  const opening = isOpeningRound(view.turn);
  const weapons: WeaponOption[] = ship.subsystems
    .filter((s) => getSubsystemConfig(s.type).weaponStats)
    .map((weapon) => {
      const config = getSubsystemConfig(weapon.type);
      const stats = config.weaponStats!;
      const noAmmo = weapon.type === "missiles" && (weapon.ammo ?? 0) <= 0;
      const cold = opening;
      const inRange = (from: Position & { facing: Facing }) =>
        opponents
          .filter((o) => {
            const s = o.ship!;
            return isInWeaponRange(weapon, from, {
              wellId: s.wellId,
              ring: s.ring,
              sector: s.sector,
            });
          })
          .map((o) => o.id);
      return {
        weapon: weapon.id,
        type: weapon.type,
        damage: stats.damage,
        energy: config.minEnergy,
        targetsNow: cold ? [] : inRange(here),
        targetsAfterCoast: cold ? [] : inRange(afterCoast),
        ready: !weapon.isBroken && !noAmmo && !cold,
        reason: weapon.isBroken
          ? "broken"
          : noAmmo
            ? "no ammo"
            : cold
              ? "no weapon fires in the first round"
              : undefined,
      };
    });

  const sensor = ship.subsystems.find((s) => s.type === "sensor_array" && !s.isBroken);
  const scanTargets =
    sensor && !opening
      ? opponents
          .filter((o) => {
            const s = o.ship!;
            return (
              s.wellId === ship.wellId &&
              s.ring === ship.ring &&
              sectorDistance(s.sector, ship.sector) <= SCAN_SECTOR_RANGE
            );
          })
          .map((o) => o.id)
      : [];

  const dissipation = view.myStats?.dissipationCapacity ?? DEFAULT_DISSIPATION_CAPACITY;
  const standingHeat = view.myStats?.standingHeat ?? 0;
  const ceiling = view.myStats?.maxHeat ?? MAX_HEAT;
  return {
    position: here,
    velocity,
    reactorFree: ship.reactor.availableEnergy,
    fuel: ship.reactionMass,
    // Room before the track redlines, with the shields' standing cost already
    // taken off — not room to the dissipation, which heat no longer resets to.
    heatBudget: Math.max(0, ceiling - ship.heat.currentHeat - standingHeat),
    heatCarried: ship.heat.currentHeat,
    standingHeat,
    dissipation,
    repair: {
      broken: ship.subsystems.filter((s) => s.isBroken).map((s) => s.id),
      possibleThisTurn:
        ship.heat.currentHeat === 0 &&
        standingHeat === 0 &&
        ship.subsystems.some((s) => s.isBroken),
    },
    burns,
    jump,
    moored,
    scoopGain: velocity,
    weapons,
    scanTargets,
    tileMinimums: ship.subsystems.map((s) => {
      const c = getSubsystemConfig(s.type);
      return {
        id: s.id,
        type: s.type,
        min: c.minEnergy,
        max: c.maxEnergy,
        now: s.allocatedEnergy,
        broken: s.isBroken,
      };
    }),
  };
}

/** The engine's own bot decides: always a legal turn from the same view. */
export type FallbackActions = PlayerAction[];
