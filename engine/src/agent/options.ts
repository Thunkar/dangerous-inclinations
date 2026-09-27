/**
 * What a seat can legally do right now, computed from its own view with the
 * same pure functions the UI uses for previews. Agents read this instead of
 * guessing, so an illegal move is never their only option.
 */
import type { BurnIntensity, Facing, Position } from "../models/game.ts";
import { DEFAULT_DISSIPATION_CAPACITY, MAX_HEAT, isOpeningRound, isQuietTurn } from "../models/game.ts";
import type { SubsystemId } from "../models/subsystems.ts";
import { energyStepOf, getSubsystemConfig, isPowerableType } from "../models/subsystems.ts";
import {
  BURN_COSTS,
  SECTOR_ADJUSTMENT_COST_PER_SECTOR,
  WELL_TRANSFER_COSTS,
  calculateJumpMassCost,
  getAdjustmentRange,
} from "../models/rings.ts";

const BURN_INTENSITIES: BurnIntensity[] = ["soft", "medium", "hard"];
import { getJumpAdjustmentRange, getJumpOptions } from "../models/gravityWells.ts";
import type { GameView } from "../game/view.ts";
import { positionOf, ringVelocity } from "../game/geometry.ts";
import { inScanRange } from "../game/scan.ts";
import { canBeFiredAt, canBeScanned, canFireFrom, isInWeaponRange } from "../game/targeting.ts";
import { projectPosition, ringAfter, type MovementPreview } from "../game/movement.ts";
import { isMooredAt } from "../game/stations.ts";
import { hasWorkingCompressor } from "../game/ship.ts";
import { escortCandidates, unplacedEscorts } from "../game/escort.ts";

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
  /** Missiles only: rounds left, and so the biggest salvo this subsystem can fire. */
  ammo: number | null;
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
  fuel: number;
  /**
   * Heat the turn may still make before the track redlines. The loadout starts
   * the turn clear, so every cube this turn puts on, powered or used, comes
   * out of this.
   */
  heatBudget: number;
  /** Heat already on the track, carried in from last turn. */
  heatCarried: number;
  /** Dissipated at every check. What is not dissipated carries to the next turn. */
  dissipation: number;
  /**
   * Broken subsystems, and whether a repair could land this turn: only a ship that
   * carries no heat in and makes none can name one (RULES §Heat check).
   */
  repair: { broken: SubsystemId[]; possibleThisTurn: boolean };
  burns: BurnOption[];
  jump: {
    destinationWellId: string;
    destination: Position;
    energy: number;
    /** Fuel for an unphased jump (1 with a working compressor). */
    fuel: number;
    /** Fuel each sector of phasing costs; a compressor does not pay for it. */
    phasingFuel: number;
    /** Sectors the landing may be shifted by, bounded by the arrival arc. */
    adjustment: { min: number; max: number };
  } | null;
  /** Docked at a station: a coast holds the berth, only a burn casts off. */
  moored: boolean;
  /** Fuel a scoop would gain this turn: 0 when the scoop is broken. */
  scoopGain: number;
  weapons: WeaponOption[];
  scanTargets: string[];
  /**
   * Escort markers still in hand, and the carriers one could go on if the
   * turn ends after a plain coast. Placing one is a choice ("you may"),
   * declared with the turn and settled against where it ends, so after any
   * other move the question is asked again of that sector; null when no
   * marker is in hand.
   */
  escort: { markersInHand: number; carriersAfterCoast: string[] } | null;
  /**
   * Subsystems a `power` action may put energy on this turn (unbroken shields,
   * racks and sensors) and the amounts it may put. Each works until your next
   * turn, and a subsystem does one thing a turn: a rack powered cannot fire and a
   * sensor powered cannot scan, while firing or scanning leaves them up anyway.
   */
  power: Array<{ id: SubsystemId; type: string; amounts: number[] }>;
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
  const scoopWorks = working("scoop");

  const burns: BurnOption[] = [];
  for (const facing of enginesWork ? (["prograde", "retrograde"] as Facing[]) : []) {
    const needsRotation = facing !== ship.facing;
    if (needsRotation && !thrustersWork) continue;
    for (const intensity of BURN_INTENSITIES) {
      const cost = BURN_COSTS[intensity];
      const toRing = ringAfter({ ...ship, facing }, cost.rings);
      if (toRing === null) continue;
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

  // A ship recovering from a respawn is untouchable until the turn it plays
  // next is over (RULES §Destruction and Respawn), so it is on nobody's
  // target list while the flag is up.
  const opponents = view.players.filter((p) => !p.isMe && canBeScanned(p));
  const afterCoast = projectPosition(ship, ship.facing, {
    kind: "coast",
    moored,
  } as MovementPreview);
  // A quiet turn reaches nobody: no shot and no scan. The opening round is
  // one (RULES §A Turn), and so is this seat's own turn back from Home, which
  // is a first round of its own (RULES §Destruction and Respawn).
  const quiet = isQuietTurn(view.turn, me);
  const quietReason = isOpeningRound(view.turn)
    ? "no weapon fires in the first round"
    : "back from Home: a first round of your own, so no weapon of yours fires";
  const weapons: WeaponOption[] = ship.subsystems
    .filter((s) => getSubsystemConfig(s.type).weaponStats)
    .map((weapon) => {
      const config = getSubsystemConfig(weapon.type);
      const stats = config.weaponStats!;
      const noAmmo = weapon.type === "missiles" && (weapon.ammo ?? 0) <= 0;
      const cold = quiet;
      // A moored ship neither fires nor is fired at (RULES §Stations): nobody
      // is a target from a berth, and nobody at one is a target.
      const inRange = (from: Position & { facing: Facing }) => {
        if (!canFireFrom(from, view.stations)) return [];
        return opponents
          .filter(
            (o) =>
              canBeFiredAt(o, view.stations) && isInWeaponRange(weapon, from, positionOf(o.ship!))
          )
          .map((o) => o.id);
      };
      return {
        weapon: weapon.id,
        type: weapon.type,
        damage: stats.damage,
        energy: config.minEnergy,
        ammo: weapon.type === "missiles" ? (weapon.ammo ?? 0) : null,
        targetsNow: cold ? [] : inRange(here),
        targetsAfterCoast: cold ? [] : inRange(afterCoast),
        ready: !weapon.isBroken && !noAmmo && !cold,
        reason: weapon.isBroken
          ? "broken"
          : noAmmo
            ? "no ammo"
            : cold
              ? quietReason
              : undefined,
      };
    });

  const sensor = ship.subsystems.find((s) => s.type === "sensor_array" && !s.isBroken);
  const scanTargets =
    sensor && !quiet
      ? opponents.filter((o) => inScanRange(here, positionOf(o.ship!))).map((o) => o.id)
      : [];

  const markersInHand = unplacedEscorts(me.missions).length;
  const escort =
    markersInHand > 0
      ? { markersInHand, carriersAfterCoast: escortCandidates(view, me.id, afterCoast) }
      : null;

  const dissipation = view.myStats?.dissipationCapacity ?? DEFAULT_DISSIPATION_CAPACITY;
  const ceiling = view.myStats?.maxHeat ?? MAX_HEAT;
  const power = ship.subsystems
    .filter((s) => isPowerableType(s.type) && !s.isBroken)
    .map((s) => {
      const c = getSubsystemConfig(s.type);
      const step = energyStepOf(s.type);
      const amounts: number[] = [];
      for (let a = c.minEnergy; a <= c.maxEnergy; a += step) amounts.push(a);
      return { id: s.id, type: s.type, amounts };
    });
  return {
    position: here,
    velocity,
    fuel: ship.reactionMass,
    // Room before the track redlines, not room to the dissipation, which heat
    // no longer resets to. Nothing on the loadout carries into this turn's
    // check: it is cleared when the turn starts.
    heatBudget: Math.max(0, ceiling - ship.heat.currentHeat),
    heatCarried: ship.heat.currentHeat,
    dissipation,
    repair: {
      broken: ship.subsystems.filter((s) => s.isBroken).map((s) => s.id),
      possibleThisTurn: ship.heat.currentHeat === 0 && ship.subsystems.some((s) => s.isBroken),
    },
    burns,
    jump,
    moored,
    scoopGain: scoopWorks ? velocity : 0,
    weapons,
    scanTargets,
    escort,
    power,
  };
}
