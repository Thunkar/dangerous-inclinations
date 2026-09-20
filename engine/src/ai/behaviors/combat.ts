/**
 * Weapons. Every shot the bot proposes is checked with the engine's own
 * range function from the position the ship will occupy when the shot
 * executes (before or after this turn's movement), so the engine never
 * rejects a bot's fire action for range.
 */
import type { Facing, Player, Position } from "../../models/game.ts";
import { isOpeningRound } from "../../models/game.ts";
import type { Subsystem, SubsystemId } from "../../models/subsystems.ts";
import { getSubsystemConfig, isCriticalTarget } from "../../models/subsystems.ts";
import { BURN_COSTS } from "../../models/rings.ts";
import { getMaxRing } from "../../models/gravityWells.ts";
import { ringVelocity } from "../../game/geometry.ts";
import { canEngage } from "../../game/targeting.ts";
import type { BotParameters, Opponent, SuspectedSlot, TacticalSituation } from "../types.ts";
import { INTERDICT_DANGER } from "../types.ts";
import type { PlannerTarget } from "../movementPlanner/index.ts";
import { driftPeriod, orbitSectorAt } from "../movementPlanner/index.ts";

export type FiringPhase = "pre" | "post";

/** Players a Destroy card in hand names: the ships worth spending a turn on. */
export function destroyTargetIds(me: Player): Set<string> {
  return new Set(
    me.missions.flatMap((m) =>
      !m.isCompleted && m.type === "destroy_ship" ? [m.targetPlayerId] : []
    )
  );
}

export interface FirePosition extends Position {
  facing: Facing;
}

/**
 * One feasible shot: which weapon, when in the turn, at whom.
 */
export interface FireIntent {
  /** False for lasers: shields do not absorb the damage. */
  shielded: boolean;
  weapon: Subsystem;
  targetId: string;
  phase: FiringPhase;
  /** Damage of the whole action: for a salvo, one missile's damage times `count`. */
  damage: number;
  /**
   * Heat the action adds: the tile's cubes once, whatever the size of a salvo,
   * plus engine energy when compensating recoil.
   */
  heat: number;
  /** Reactor energy the weapon needs. A salvo needs no more cubes than one shot. */
  energy: number;
  /** Rounds this action puts in the air. 1 for everything but a missiles salvo. */
  count: number;
  /** Railgun only. */
  compensateRecoil?: boolean;
}

export function weaponDamage(weapon: Subsystem): number {
  return getSubsystemConfig(weapon.type).weaponStats?.damage ?? 0;
}

export function weaponEnergy(weapon: Subsystem): number {
  return getSubsystemConfig(weapon.type).minEnergy;
}

/**
 * Heat a salvo of `count` rounds off `weapon` costs: the tile's cubes once for
 * the whole launch, however many rounds leave the rail (RULES §Weapons).
 */
export function salvoHeat(weapon: Subsystem): number {
  return weaponEnergy(weapon);
}

/**
 * Everything one tile could put on a ship in a single action. A missiles tile
 * may empty its magazine at one target in one launch, so its potential is the
 * whole magazine — a bot that priced it at one round would never see that its
 * launcher can finish a ship.
 */
export function weaponPotential(weapon: Subsystem): number {
  const damage = weaponDamage(weapon);
  return weapon.type === "missiles" ? damage * Math.max(0, weapon.ammo ?? 0) : damage;
}

/**
 * Damage the bot could put on one ship in a single turn if every weapon
 * bore, before shields.
 */
export function volleyPotential(weapons: Subsystem[]): number {
  return weapons.reduce((sum, w) => sum + weaponPotential(w), 0);
}

/** Whether shields can soak this weapon's damage (lasers go straight through). */
export function shieldsStop(weapon: Subsystem): boolean {
  return getSubsystemConfig(weapon.type).weaponStats?.ignoresShields !== true;
}

/**
 * Hull damage a volley puts through `shieldAbsorption` visible cubes: laser
 * damage skips the shields, everything else has to beat them first. A
 * shield tile is refilled for free, so shielded damage short of the cubes
 * never reaches a hull.
 */
export function hullThrough(
  shots: Array<{ damage: number; shielded: boolean }>,
  shieldAbsorption: number
): number {
  let shielded = 0;
  let direct = 0;
  for (const s of shots) {
    if (s.shielded) shielded += s.damage;
    else direct += s.damage;
  }
  return direct + Math.max(0, shielded - shieldAbsorption);
}

/** {@link hullThrough} for weapons the bot could fire this turn. */
export function hullPotential(weapons: Subsystem[], shieldAbsorption: number): number {
  return hullThrough(
    weapons.map((w) => ({ damage: weaponPotential(w), shielded: shieldsStop(w) })),
    shieldAbsorption
  );
}

/** A weapon the bot could fire this turn (unbroken, unused, loaded). */
export function isWeaponReady(weapon: Subsystem): boolean {
  if (weapon.isBroken || weapon.usedThisTurn) return false;
  if (weapon.type === "missiles" && (weapon.ammo ?? 0) <= 0) return false;
  return true;
}

/**
 * Planner target: any position from which one of `weapons` could hit a
 * ship that drifts on its ring from `start`. Either facing is accepted
 * because the bot can rotate on the firing turn.
 *
 * "Could hit", not "may fire at": a missile may legally be launched at
 * anything in the well, so a launcher that asked the range rule alone would
 * count every sector as a firing position and never close (measured: bots
 * stopped moving and 58% of games ran to the turn cap). {@link canEngage}
 * asks whether the missile would actually run the target down.
 */
export function weaponRangeTarget(weapons: Subsystem[], start: Position): PlannerTarget {
  const velocity = ringVelocity(start.wellId, start.ring);
  const positionAt = (turn: number): Position => ({
    ...start,
    sector: orbitSectorAt(start, velocity, turn),
  });
  return {
    positionAt,
    isMatch: (pos, turn) => {
      const target = positionAt(turn);
      if (pos.wellId !== target.wellId) return false;
      for (const facing of ["prograde", "retrograde"] as const) {
        const attacker = { ...pos, facing };
        // The bot moves to this position and fires from it: a missile launched
        // there rode along with the ship.
        if (weapons.some((w) => canEngage(w, attacker, target, true))) return true;
      }
      return false;
    },
    period: driftPeriod(velocity),
    describe: () => `weapon range of ${start.wellId} R${start.ring} S${start.sector}`,
  };
}

/**
 * Last resort for a critical: a system every ship carries and that we can
 * see is not broken already (broken fixed systems are public). Naming a
 * tile that is already broken wastes the critical entirely.
 */
function fallbackCriticalTarget(target: Opponent): SubsystemId {
  const engines = target.player.fixed.find((f) => f.type === "engines" && !f.isBroken);
  if (engines) return engines.id;
  const fixed = target.player.fixed.find((f) => !f.isBroken && isCriticalTarget(f.id));
  if (fixed) return fixed.id;
  const slot = target.player.slots.find((s) => s.isBroken !== true);
  return slot?.id ?? "engines";
}

/**
 * What a slot's cubes say about it being a shield tile: a side slot holding
 * one to four cubes that no weapon's cube count explains. Bigger is better
 * to break — those are the cubes soaking our volley.
 */
function suspectedShieldCubes(slot: SuspectedSlot): number {
  if (slot.suspected !== null) return 0;
  if (slot.slot.group !== "side") return 0;
  const cubes = slot.slot.allocatedEnergy;
  return cubes >= 1 && cubes <= getSubsystemConfig("shields").maxEnergy ? cubes : 0;
}

/**
 * Slot to break on a critical. Every candidate must be a tile that is still
 * intact — breaking a broken tile does nothing — and cubes are the evidence:
 * energy allocation is public, and a broken tile is turned face-up with its
 * cubes returned to the reactor, so any slot carrying cubes is certainly
 * still working.
 *
 * `intent` decides what "best" means:
 *
 * - **suppress** (the default): stop them shooting us. A weapon we have seen
 *   and that is powered right now, then a face-down slot whose cube count
 *   reads dangerous, then anything revealed and powered, then an idle gun,
 *   then the engines.
 * - **kill**: get through to the hull. A shield tile holds up to four cubes and
 *   absorbs a point per two of them, and the cubes it spends come straight back
 *   to their reactor, so it is refilled for free on their next turn and is the
 *   single tile standing between us and their hull. Break it and every later
 *   shot lands in full until they reach a station.
 *
 *   Naming it is a gamble the other way, though: a critical only breaks
 *   anything if the shot reaches the hull (`game/damage.ts`), so shields that
 *   still hold eat the very critical meant to bring them down. Against a full
 *   tile the shot has to be big enough to get through first.
 */
export function chooseCriticalTarget(
  target: Opponent,
  intent: "suppress" | "kill" = "suppress"
): SubsystemId {
  const working = target.knownWeapons.filter((w) => !w.isBroken);

  if (intent === "kill") {
    const shield = target.player.slots
      .filter((s) => s.type === "shields" && s.isBroken === false && s.allocatedEnergy > 0)
      .sort((a, b) => b.allocatedEnergy - a.allocatedEnergy)[0];
    if (shield) return shield.id;
    const suspected = [...target.unknownSlots]
      .map((s) => ({ slot: s, cubes: suspectedShieldCubes(s) }))
      .filter((s) => s.cubes > 0)
      .sort((a, b) => b.cubes - a.cubes)[0];
    if (suspected) return suspected.slot.slot.id;
  }

  const firing = working.find((w) => w.isPowered);
  if (firing) return firing.slotId;

  const loaded = [...target.unknownSlots]
    .filter((s) => s.slot.allocatedEnergy > 0)
    .sort(
      (a, b) =>
        (b.suspected?.damage ?? 0) * (b.suspected?.confidence ?? 0) -
          (a.suspected?.damage ?? 0) * (a.suspected?.confidence ?? 0) ||
        b.slot.allocatedEnergy - a.slot.allocatedEnergy
    )[0];
  if (loaded) return loaded.slot.id;

  const powered = target.player.slots.find(
    (s) => s.type !== null && s.isBroken === false && s.allocatedEnergy > 0
  );
  if (powered) return powered.id;

  if (working[0]) return working[0].slotId;
  return fallbackCriticalTarget(target);
}

export interface FiringContext {
  /** Position and facing when pre-movement shots execute. */
  pre: FirePosition;
  /** Position and facing when post-movement shots execute. */
  post: FirePosition;
  /** A burn or jump this turn already uses the engines (no recoil compensation). */
  enginesUsedByMovement: boolean;
  /** Reaction mass left after the movement. */
  massAfterMovement: number;
  /** The movement lands somewhere that must not be disturbed (a dock, the survey ring). */
  postPositionMatters: boolean;
}

/**
 * Every shot the bot could take at `target` this turn. The caller picks a
 * subset that fits the energy and heat budgets.
 */
export function firingOptions(
  situation: TacticalSituation,
  target: Opponent,
  ctx: FiringContext,
  parameters: BotParameters
): FireIntent[] {
  const intents: FireIntent[] = [];
  const { status } = situation;
  const targetPos = target.position;

  // Nothing reaches another ship in the opening round (RULES §Firing), so
  // there is nothing to plan: the engine would refuse every one of these.
  if (isOpeningRound(situation.view.turn)) return intents;
  // Nor does anything reach a ship that just came back: it is untouchable
  // until it acts (RULES §Destruction and Respawn).
  if (target.recovering) return intents;

  for (const weapon of status.weapons) {
    if (!isWeaponReady(weapon)) continue;
    const damage = weaponDamage(weapon);
    const energy = weaponEnergy(weapon);
    const shielded = shieldsStop(weapon);
    const inPre = canEngage(weapon, ctx.pre, targetPos, false);
    const inPost = canEngage(weapon, ctx.post, targetPos, true);

    if (weapon.type === "railgun") {
      // Recoil moves the ship a ring, which would derail a burn or jump
      // planned after the shot, so the railgun fires after moving.
      if (!inPost) continue;
      const recoilRing = ctx.post.ring + (ctx.post.facing === "prograde" ? 1 : -1);
      const recoilValid = recoilRing >= 1 && recoilRing <= getMaxRing(ctx.post.wellId);
      const canCompensate =
        !ctx.enginesUsedByMovement &&
        !status.engines.isBroken &&
        !status.engines.usedThisTurn &&
        ctx.massAfterMovement >= BURN_COSTS.soft.mass;
      if (!recoilValid && !canCompensate) continue;
      if (!canCompensate && ctx.postPositionMatters) continue;
      const compensate = canCompensate;
      intents.push({
        weapon,
        targetId: target.player.id,
        phase: "post",
        damage,
        shielded,
        heat: energy + (compensate ? BURN_COSTS.soft.energy : 0),
        energy,
        count: 1,
        compensateRecoil: compensate,
      });
      continue;
    }

    if (weapon.type === "missiles") {
      const phase: FiringPhase | null = inPost ? "post" : inPre ? "pre" : null;
      if (!phase) continue;
      const ammo = Math.max(0, weapon.ammo ?? 0);
      if (parameters.conserveAmmo && ammo <= 1 && target.hull > damage) continue;
      // The whole magazine is the opening offer: the planner trims it to what
      // the heat budget takes and to what the target actually needs.
      intents.push({
        weapon,
        targetId: target.player.id,
        phase,
        damage: damage * ammo,
        shielded,
        heat: salvoHeat(weapon),
        energy,
        count: ammo,
      });
      continue;
    }

    // Lasers and racks: fire wherever the target is in range, before the
    // move when possible (nothing later in the turn can invalidate it).
    const phase: FiringPhase | null = inPre ? "pre" : inPost ? "post" : null;
    if (!phase) continue;
    intents.push({
      weapon,
      targetId: target.player.id,
      phase,
      damage,
      shielded,
      heat: energy,
      energy,
      count: 1,
    });
  }

  return intents;
}

/**
 * Pick which opponent to shoot among those with at least one option.
 *
 * Under the "mission" preference the order is: a ship a Destroy card names,
 * then the ship closest to winning the game (a hit on a player one dock from
 * the win costs them cargo and a turn, which is worth more than the same hit
 * on a bystander), then whoever is weakest.
 */
export function selectTarget(
  situation: TacticalSituation,
  candidates: Array<{ opponent: Opponent; intents: FireIntent[] }>,
  parameters: BotParameters
): { opponent: Opponent; intents: FireIntent[] } | null {
  const withShots = candidates.filter((c) => c.intents.length > 0);
  if (withShots.length === 0) return null;

  const missionTargets = destroyTargetIds(situation.me);
  const potential = (c: { intents: FireIntent[] }) =>
    c.intents.reduce((sum, i) => sum + i.damage, 0);
  // A volley that cannot beat the shield cubes on a ship never reaches its
  // hull (laser damage excepted), so a ship we can actually hurt outranks a
  // weaker one we cannot.
  const canHurt = (c: (typeof withShots)[number]) =>
    hullThrough(c.intents, c.opponent.shieldAbsorption) > 0;
  const byWeakest = (a: (typeof withShots)[number], b: (typeof withShots)[number]) =>
    Number(canHurt(b)) - Number(canHurt(a)) ||
    a.opponent.hull - b.opponent.hull ||
    potential(b) - potential(a);
  const byClosest = (a: (typeof withShots)[number], b: (typeof withShots)[number]) =>
    a.opponent.ringDistance +
    a.opponent.sectorDistance -
    (b.opponent.ringDistance + b.opponent.sectorDistance);
  const byDanger = (a: (typeof withShots)[number], b: (typeof withShots)[number]) =>
    b.opponent.danger.score - a.opponent.danger.score || byWeakest(a, b);

  switch (parameters.targetPreference) {
    case "closest":
      return [...withShots].sort(byClosest)[0];
    case "weakest":
      return [...withShots].sort(byWeakest)[0];
    case "mission": {
      const mission = withShots
        .filter((c) => missionTargets.has(c.opponent.player.id))
        .sort(byWeakest);
      if (mission[0]) return mission[0];
      const dangerous = withShots
        .filter((c) => c.opponent.danger.score >= INTERDICT_DANGER)
        .sort(byDanger);
      return dangerous[0] ?? [...withShots].sort(byWeakest)[0];
    }
  }
}
