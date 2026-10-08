/**
 * What a seat can legally do right now, computed from its own view with the
 * same pure functions the UI uses for previews. Agents read this instead of
 * guessing, so an illegal move is never their only option.
 */
import type { Facing, Position } from "../models/game.ts";
import { DEFAULT_DISSIPATION_CAPACITY, MAX_HEAT, isOpeningRound, isQuietTurn } from "../models/game.ts";
import type { SubsystemId } from "../models/subsystems.ts";
import { getSubsystemConfig, isPowerableType } from "../models/subsystems.ts";
import type { GameView } from "../game/view.ts";
import { positionOf, ringVelocity } from "../game/geometry.ts";
import { inScanRange } from "../game/scan.ts";
import { canBeFiredAt, canBeScanned, canFireFrom, isInWeaponRange } from "../game/targeting.ts";
import {
  legalMoves,
  projectPosition,
  type LegalBurn,
  type LegalJump,
  type MovementPreview,
} from "../game/movement.ts";
import { isMooredAt } from "../game/stations.ts";
import { escortCandidates, unplacedEscorts } from "../game/escort.ts";
import { freePiracyCards, seizableItems, type SeizableItem } from "../game/piracy.ts";
import { onSurveyRing, surveyToTake } from "../game/survey.ts";
import { salvageToTake, salvageableWrecks } from "../game/salvage.ts";

export type BurnOption = LegalBurn;

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
   * carries no heat in and makes none can name one (RULES §Energy and Heat).
   */
  repair: { broken: SubsystemId[]; possibleThisTurn: boolean };
  /** Every burn the engines, the thrusters and the tank allow, phasing included (`legalMoves`). */
  burns: BurnOption[];
  /** The jump from the departure arc the ship is in, if the tank covers it (`legalMoves`). */
  jump: LegalJump | null;
  /** Docked at a station: a coast holds the berth, only a burn casts off. */
  moored: boolean;
  /** Fuel a scoop would gain this turn: 0 when the scoop is broken. */
  scoopGain: number;
  weapons: WeaponOption[];
  scanTargets: string[];
  /**
   * Escort markers still in hand, and the carriers one could go on where the
   * ship is now (before the move) and after a plain coast. Marking is a
   * choice ("you may") and an action in the sequence, taken from where the
   * ship is at that point; null when no marker is in hand.
   */
  escort: { markersInHand: number; carriersNow: string[]; carriersAfterCoast: string[] } | null;
  /**
   * A Survey that wants data, and whether a `survey` takes it where the ship
   * is now and after a plain coast (on Black Hole Ring 1); null when no card
   * wants data.
   */
  survey: { now: boolean; afterCoast: boolean } | null;
  /**
   * A Salvage that wants a black box, and the wrecks a `salvage` could name
   * where the ship is now and after a plain coast; null when no card wants one.
   */
  salvage: { wrecksNow: string[]; wrecksAfterCoast: string[] } | null;
  /**
   * Piracy cards free to seize (undone, no loot of their own aboard), and the
   * items one could take where the ship is now (before the move) and after a
   * plain coast. A seizure is an action in the sequence, taken from where the
   * ship is at that point; null with no card free.
   */
  seize: { freeCards: number; itemsNow: SeizableItem[]; itemsAfterCoast: SeizableItem[] } | null;
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

  const scoop = ship.subsystems.find((x) => x.id === "scoop");
  const scoopWorks = scoop !== undefined && !scoop.isBroken;

  // A move needs working hardware and fuel, not just room on the board, and
  // phasing is fuel too: the engine's own list, so a ship with broken engines
  // or a dry tank is never offered a move the dry run then refuses.
  const moves = legalMoves(ship);
  const burns: BurnOption[] = moves.burns;
  const jump = moves.jumps[0] ?? null;
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
      // is a target from a berth held since the turn began, and nobody at one
      // is a target.
      const inRange = (from: Position & { facing: Facing }) => {
        if (!canFireFrom(here, from, view.stations)) return [];
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
      ? {
          markersInHand,
          carriersNow: escortCandidates(view, me.id, here, here),
          carriersAfterCoast: escortCandidates(view, me.id, afterCoast, here),
        }
      : null;
  const survey = surveyToTake(me)
    ? { now: onSurveyRing(here), afterCoast: onSurveyRing(afterCoast) }
    : null;
  const wrecksAt = (at: Position) => salvageableWrecks(me, view.wrecks, at).map((w) => w.id);
  const salvage = salvageToTake(me)
    ? { wrecksNow: wrecksAt(here), wrecksAfterCoast: wrecksAt(afterCoast) }
    : null;

  const freeCards = freePiracyCards(me.missions, me.cargo).length;
  const seize =
    freeCards > 0
      ? {
          freeCards,
          itemsNow: seizableItems(view, me.id, here),
          itemsAfterCoast: seizableItems(view, me.id, afterCoast),
        }
      : null;

  const dissipation = view.myStats?.dissipationCapacity ?? DEFAULT_DISSIPATION_CAPACITY;
  const ceiling = view.myStats?.maxHeat ?? MAX_HEAT;
  const power = ship.subsystems
    .filter((s) => isPowerableType(s.type) && !s.isBroken)
    .map((s) => {
      const c = getSubsystemConfig(s.type);
      const amounts: number[] = [];
      for (let a = c.minEnergy; a <= c.maxEnergy; a += 1) amounts.push(a);
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
    seize,
    survey,
    salvage,
    power,
  };
}
