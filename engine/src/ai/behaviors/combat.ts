/**
 * Weapons. Every shot the bot proposes is checked with the engine's own
 * range function from the position the ship will occupy when the shot
 * executes (before or after this turn's movement), so the engine never
 * rejects a bot's fire action for range.
 */
import type { Facing, Player, Position } from "../../models/game.ts";
import type { SlotView } from "../../game/view.ts";
import { isQuietTurn } from "../../models/game.ts";
import type { Subsystem, SubsystemId, SubsystemType } from "../../models/subsystems.ts";
import {
  SHIELD_POINTS_PER_ENERGY,
  getSubsystemConfig,
  shieldPointsPerEnergyOf,
} from "../../models/subsystems.ts";
import { BURN_COSTS } from "../../models/rings.ts";
import { ringVelocity } from "../../game/geometry.ts";
import { canBeFiredAt, canEngage, canFireFrom } from "../../game/targeting.ts";
import { markedBy } from "../../game/escort.ts";
import { recoilRing } from "../../game/movement.ts";
import type { BotParameters, KnownWeapon, Opponent, TacticalSituation } from "../types.ts";
import { SUSPECTED_SHIELD_WEIGHT, suspectedShieldCubes } from "../analyzer.ts";
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

/**
 * Worth killing, not just suppressing: a Destroy card names them, or they are
 * close enough to the win to interdict. Criticals aim at their shields and
 * leaving the route to reach them is worth a turn.
 */
export function isKillTarget(me: Player, opponent: Opponent): boolean {
  return destroyTargetIds(me).has(opponent.player.id) || opponent.danger.score >= INTERDICT_DANGER;
}

/**
 * Ships this seat does not shoot at: those its own Escort markers sit on (the
 * marker pays only when that ship sells, and a kill sends it home) and the
 * carrier its Escort goal is on its way to mark. The bot never marks its own
 * Destroy target, so no marker ever shields its prey.
 */
export function holdFireIds(situation: TacticalSituation): Set<string> {
  const ids = markedBy(situation.me);
  const goal = situation.currentGoal;
  if (goal?.type === "escort" && goal.targetPlayerId) ids.add(goal.targetPlayerId);
  return ids;
}

/**
 * What a kill on `opponent` takes off the table besides hull, counted in
 * tokens: every crate and every piece of data aboard (it goes over the side),
 * every rival's Escort marker on the ship (public, `PlayerView.escortedBy`:
 * the marker goes home and that rival's point with it), and the opponent's own
 * marker on the deciding seat's ship (`onMe`, this seat's `escortedBy`: a
 * dead escort's marker comes off, so the kill sheds a point owed to them).
 * The deciding seat's own marker is not a rival's, and a ship carrying one is
 * not fired on at all.
 */
export function denialTokens(opponent: Opponent, myId: string, onMe: readonly string[]): number {
  const cargo = opponent.player.cargoAboard.crates + opponent.player.cargoAboard.data;
  const escorts = opponent.player.escortedBy.filter((id) => id !== myId).length;
  return cargo + escorts + Number(onMe.includes(opponent.player.id));
}

/** The players whose Escort markers sit on this seat's ship, read off its public view. */
export function escortsOnMe(situation: Pick<TacticalSituation, "view" | "me">): string[] {
  return situation.view.players.find((p) => p.id === situation.me.id)?.escortedBy ?? [];
}

interface FirePosition extends Position {
  facing: Facing;
}

/**
 * One feasible shot: which weapon, when in the turn, at whom.
 */
export interface ShotOption {
  /**
   * Points of this shot a shield cube absorbs (one, two of plasma), or null
   * when shields do not stop it at all (lasers).
   */
  shieldPerCube: number | null;
  weapon: Subsystem;
  targetId: string;
  phase: FiringPhase;
  /** Damage of the whole action: for a salvo, one missile's damage times `count`. */
  damage: number;
  /**
   * Heat the action adds: the weapon's cubes once, whatever the size of a
   * salvo, plus the engines' cube when compensating recoil.
   */
  heat: number;
  /** Rounds this action puts in the air. 1 for everything but a missiles salvo. */
  count: number;
  /** Railgun only. */
  compensateRecoil?: boolean;
}

/**
 * What a known disruptor counts as among guns, in points of damage: it takes no
 * hull, but every hit breaks a slot, which is what a critical does.
 */
export const DISRUPTOR_WORTH = 2;

/** A gun's rank when choosing which to break: its damage, a disruptor {@link DISRUPTOR_WORTH}. */
export function gunWorth(type: SubsystemType): number {
  return getSubsystemConfig(type).weaponStats?.disrupts === true
    ? DISRUPTOR_WORTH
    : (getSubsystemConfig(type).weaponStats?.damage ?? 0);
}

/** A disruptor: no damage, a hit breaks the named slot unless a shield is up. */
export function isDisruptor(weapon: Pick<Subsystem, "type">): boolean {
  return getSubsystemConfig(weapon.type).weaponStats?.disrupts === true;
}

function weaponDamage(weapon: Subsystem): number {
  return getSubsystemConfig(weapon.type).weaponStats?.damage ?? 0;
}

/**
 * Cubes a weapon takes to fire, and so its heat. A salvo is one use of the
 * launcher: its cubes once, however many rounds leave the rail (RULES §Weapons).
 */
export function weaponEnergy(weapon: Subsystem): number {
  return getSubsystemConfig(weapon.type).minEnergy;
}

/**
 * Everything one weapon of `type` could put on a ship in a single action. A
 * launcher may empty its magazine at one target in one launch, so its
 * potential is the whole magazine: a bot that priced it at one round would
 * never see that its launcher can finish a ship. The analyzer prices a
 * rival's face-up launcher with the same formula.
 */
export function potentialDamage(type: SubsystemType, ammo: number | null | undefined): number {
  const damage = getSubsystemConfig(type).weaponStats?.damage ?? 0;
  return type === "missiles" ? damage * Math.max(0, ammo ?? 0) : damage;
}

function weaponPotential(weapon: Subsystem): number {
  return potentialDamage(weapon.type, weapon.ammo);
}

/**
 * Damage the bot could put on one ship in a single turn if every weapon
 * bore, before shields.
 */
export function volleyPotential(weapons: Subsystem[]): number {
  return weapons.reduce((sum, w) => sum + weaponPotential(w), 0);
}

/**
 * Points of this weapon's damage a shield cube absorbs, or null when shields
 * do not stop it (lasers go straight through).
 */
export function shieldPerCubeOf(weapon: Pick<Subsystem, "type">): number | null {
  const stats = getSubsystemConfig(weapon.type).weaponStats;
  return stats?.ignoresShields === true ? null : shieldPointsPerEnergyOf(stats);
}

/**
 * Hull damage a volley puts through `shieldAbsorption` visible points of
 * shield. The points are a pool of cubes ({@link SHIELD_POINTS_PER_ENERGY}
 * points a cube) that the shots spend in the order given: each absorbs as many
 * points as the cubes left stop of it, so plasma takes two points a cube and a
 * wall that stops a whole bolt has nothing left for what comes after.
 * Laser damage skips the shields. The pool is fractional (a slot that only
 * might be a shield counts at a weight), so nothing is rounded: with every
 * shot at the default rate this is `direct + max(0, shielded - absorption)`.
 * Damage short of the cubes reaches no hull, but it is not wasted: the cubes
 * it strips are heat to their owner, so is every point absorbed, and a critical
 * breaks what it names anyway.
 */
export function hullThrough(
  shots: ReadonlyArray<{ damage: number; shieldPerCube: number | null }>,
  shieldAbsorption: number
): number {
  let cubes = shieldAbsorption / SHIELD_POINTS_PER_ENERGY;
  let hull = 0;
  for (const s of shots) {
    if (s.shieldPerCube === null) {
      hull += s.damage;
      continue;
    }
    const absorbed = Math.min(s.damage, cubes * s.shieldPerCube);
    cubes -= absorbed / s.shieldPerCube;
    hull += s.damage - absorbed;
  }
  return hull;
}

/** {@link hullThrough} for weapons the bot could fire this turn. */
export function hullPotential(weapons: Subsystem[], shieldAbsorption: number): number {
  return hullThrough(
    weapons.map((w) => ({ damage: weaponPotential(w), shieldPerCube: shieldPerCubeOf(w) })),
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
        if (weapons.some((w) => canEngage(w, attacker, target))) return true;
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
 * subsystem that is already broken wastes the critical entirely.
 */
function fallbackCriticalTarget(target: Opponent): SubsystemId {
  const engines = target.player.fixed.find((f) => f.type === "engines" && !f.isBroken);
  if (engines) return engines.id;
  const fixed = target.player.fixed.find((f) => !f.isBroken);
  if (fixed) return fixed.id;
  const slot = target.player.slots.find((s) => s.isBroken !== true);
  return slot?.id ?? "engines";
}

/**
 * Slot to break on a critical. Every candidate must be a subsystem that is still
 * intact (breaking a broken subsystem does nothing).
 *
 * Cubes are evidence, of a narrow thing: using a subsystem turns it face-up, so a
 * loaded face-down slot was powered and is a wall, a rack or a sensor. Every
 * subsystem keeps its cubes until its owner's next turn, and breaking a loaded one
 * dumps them on its owner as heat, which a dark one cannot do.
 *
 * `intent` decides what "best" means:
 *
 * - **suppress** (the default): stop them shooting us. The biggest gun we have
 *   actually seen, then a loaded face-down slot (a rack is a gun and a sensor
 *   is their critical range, and either way the cubes burn), then anything
 *   else of theirs we know, then the engines.
 * - **kill**: get through to the hull. A shield holds up to two cubes and
 *   absorbs a point a cube, and its owner powers it again every turn (at a
 *   heat a cube a check), so it is the single subsystem standing between us and
 *   their hull. A critical breaks the slot it names whether or not the shot
 *   got through (RULES §Critical hits), so naming it costs nothing even when
 *   the shield holds: break it and every later shot lands in full until they
 *   reach a station.
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
      .map((s) => ({ slot: s, cubes: suspectedShieldCubes(s.slot) }))
      .filter((s) => s.cubes > 0)
      .sort((a, b) => b.cubes - a.cubes)[0];
    if (suspected) return suspected.slot.slot.id;
  }

  // The gun we have seen, biggest first: an unbroken one fires whenever its
  // owner likes, so being dark right now is no reason to leave it alone.
  const biggest = biggestGun(working);
  if (biggest) return biggest.slotId;

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

  return fallbackCriticalTarget(target);
}

function biggestGun(working: KnownWeapon[]): KnownWeapon | undefined {
  return [...working].sort((a, b) => gunWorth(b.type) - gunWorth(a.type))[0];
}

/**
 * Chance that a disruptor fired at `target` finds a powered shield, after
 * `before`: the direct-fire shots sequenced ahead of it at the same ship.
 *
 * Any working shield with a cube on it blocks the shot whole, so this is read
 * slot by slot, never off the fractional {@link Opponent.shieldAbsorption}. A
 * face-up shield holding cubes is certain. A face-down slot is a shield
 * possibly: one cube is certain (the rack and the sensor hold two), two may
 * be the rack on a side slot or the sensor in the bow, and a guess counts at
 * the analyzer's {@link SUSPECTED_SHIELD_WEIGHT}. The shots before strip
 * cubes as the engine does, subsystem by subsystem in slot order, each taking
 * whole points at its own rate, so a plasma bolt empties a two-cube wall and a
 * railgun shot does too. A guessed slot is stripped as if it were a shield.
 */
export function disruptBlockChance(
  target: Opponent,
  before: ReadonlyArray<{ damage: number; shieldPerCube: number | null }> = []
): number {
  const rack = getSubsystemConfig("ballistic_rack");
  const sensor = getSubsystemConfig("sensor_array");
  // A count the other powerable subsystem of that slot cannot hold is a shield.
  const outside = (cubes: number, c: { minEnergy: number; maxEnergy: number }) =>
    cubes < c.minEnergy || cubes > c.maxEnergy;
  const shields = getSubsystemConfig("shields");
  const guesses: Array<{ cubes: number; certain: boolean }> = [];
  for (const slot of target.player.slots) {
    if (slot.type === "shields") {
      if (slot.isBroken !== true && slot.allocatedEnergy > 0)
        guesses.push({ cubes: slot.allocatedEnergy, certain: true });
      continue;
    }
    if (slot.type !== null || slot.isBroken === true) continue;
    if (slot.group === "side") {
      const cubes = suspectedShieldCubes(slot);
      if (cubes > 0) guesses.push({ cubes, certain: outside(cubes, rack) });
      continue;
    }
    const cubes = slot.allocatedEnergy;
    if (cubes >= shields.minEnergy && cubes <= shields.maxEnergy)
      guesses.push({ cubes, certain: outside(cubes, sensor) });
  }
  for (const shot of before) {
    if (shot.shieldPerCube === null) continue;
    let left = shot.damage;
    for (const g of guesses) {
      if (left <= 0) break;
      const take = Math.min(left, Math.floor(g.cubes * shot.shieldPerCube));
      g.cubes -= take / shot.shieldPerCube;
      left -= take;
    }
  }
  let open = 1;
  for (const g of guesses) if (g.cubes > 0) open *= g.certain ? 0 : 1 - SUSPECTED_SHIELD_WEIGHT;
  return 1 - open;
}

/** The highest {@link disruptBlockChance} a bot fires its disruptor into. */
export const MAX_DISRUPT_BLOCK = 0.5;

/**
 * Slot a disruptor hit breaks. It is only fired at a ship whose shields look
 * down, and a hit always breaks what it names, so the choice is what costs
 * them most, never a slot we know is broken:
 *
 * - **kill**: a face-up working shield. It is down if we are firing at all,
 *   and broken it cannot be powered again until a station, so every later shot
 *   lands in full;
 * - a gun we know holding cubes, most cubes first: a gun that fired keeps its
 *   cubes until its owner's next turn, and breaking it dumps them as heat;
 * - the biggest gun we know, a disruptor counted at {@link DISRUPTOR_WORTH};
 * - the engines of a ship carrying cargo or close to the win: it has
 *   somewhere it must be, and broken engines leave it coasting;
 * - otherwise whatever a critical would name ({@link chooseCriticalTarget}).
 */
export function chooseDisruptTarget(
  target: Opponent,
  intent: "suppress" | "kill" = "suppress"
): SubsystemId {
  const slots = target.player.slots;
  if (intent === "kill") {
    const shield = slots.find((s) => s.type === "shields" && s.isBroken !== true);
    if (shield) return shield.id;
  }
  const working = target.knownWeapons.filter((w) => !w.isBroken);
  const cubesOn = (id: SubsystemId) =>
    slots.find((s: SlotView) => s.id === id)?.allocatedEnergy ?? 0;
  const loaded = working
    .filter((w) => cubesOn(w.slotId) > 0)
    .sort((a, b) => cubesOn(b.slotId) - cubesOn(a.slotId))[0];
  if (loaded) return loaded.slotId;
  const biggest = biggestGun(working);
  if (biggest) return biggest.slotId;
  const engines = target.player.fixed.find((f) => f.type === "engines" && !f.isBroken);
  const cargo = target.player.cargoAboard.crates + target.player.cargoAboard.data;
  if (engines && (cargo > 0 || target.danger.score >= INTERDICT_DANGER)) return engines.id;
  return chooseCriticalTarget(target, intent);
}

interface FiringContext {
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
): ShotOption[] {
  const intents: ShotOption[] = [];
  const { status } = situation;
  const targetPos = target.position;

  // A quiet turn reaches nobody, so there is nothing to plan: the engine
  // would refuse every one of these. The opening round is one (RULES §A Turn)
  // and so is the bot's own turn back from Home, which is a first round of
  // its own (RULES §Destruction and Respawn).
  if (isQuietTurn(situation.view.turn, situation.me)) return intents;
  // Nor does anything reach a ship that just came back, or one at a berth.
  if (!canBeFiredAt(target.player, situation.view.stations)) return intents;
  // And a ship at a berth fires at nobody: a phase that finds the bot moored
  // (before the move while it still holds its berth, or after a move that
  // ends on a station) has no shots.
  const stations = situation.view.stations;
  const firesPre = canFireFrom(ctx.pre, stations);
  const firesPost = canFireFrom(ctx.post, stations);

  for (const weapon of status.weapons) {
    if (!isWeaponReady(weapon)) continue;
    const damage = weaponDamage(weapon);
    const cubes = weaponEnergy(weapon);
    const shieldPerCube = shieldPerCubeOf(weapon);
    const inPre = firesPre && canEngage(weapon, ctx.pre, targetPos);
    const inPost = firesPost && canEngage(weapon, ctx.post, targetPos);

    if (weapon.type === "railgun") {
      // Recoil moves the ship a ring, which would derail a burn or jump
      // planned after the shot, so the railgun fires after moving.
      if (!inPost) continue;
      const recoilValid = recoilRing(ctx.post) !== null;
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
        shieldPerCube,
        heat: cubes + (compensate ? BURN_COSTS.soft.energy : 0),
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
        shieldPerCube,
        heat: cubes,
        count: ammo,
      });
      continue;
    }

    // A disruptor is offered in every phase it bears in: whether it is worth
    // firing depends on the shield cubes the shots before it strip, so the
    // planner decides it after the damage shots and picks the phase then.
    if (isDisruptor(weapon)) {
      for (const phase of ["pre", "post"] as const) {
        if (!(phase === "pre" ? inPre : inPost)) continue;
        intents.push({
          weapon,
          targetId: target.player.id,
          phase,
          damage,
          shieldPerCube,
          heat: cubes,
          count: 1,
        });
      }
      continue;
    }

    // Lasers, racks and plasma: fire wherever the target is in range, before
    // the move when possible (nothing later in the turn can invalidate it).
    const phase: FiringPhase | null = inPre ? "pre" : inPost ? "post" : null;
    if (!phase) continue;
    intents.push({
      weapon,
      targetId: target.player.id,
      phase,
      damage,
      shieldPerCube,
      heat: cubes,
      count: 1,
    });
  }

  return intents;
}

/** An opponent and the shots the bot could take at it this turn. */
export interface TargetOption {
  opponent: Opponent;
  intents: ShotOption[];
}

/**
 * Pick which opponent to shoot among those with at least one shot.
 *
 * Under the "mission" preference the order is: a ship a Destroy card names,
 * then the ship closest to winning the game (a hit on a player one dock from
 * the win costs them cargo and a turn, which is worth more than the same hit
 * on a bystander), then whoever is weakest.
 */
export function selectTarget(
  situation: TacticalSituation,
  candidates: TargetOption[],
  parameters: BotParameters
): TargetOption | null {
  if (candidates.length === 0) return null;

  const missionTargets = destroyTargetIds(situation.me);
  const potential = (c: TargetOption) => c.intents.reduce((sum, i) => sum + i.damage, 0);
  // A volley that cannot beat the shield cubes on a ship never reaches its
  // hull (laser damage excepted), so a ship we can actually hurt outranks a
  // weaker one we cannot.
  const canHurt = (c: TargetOption) => hullThrough(c.intents, c.opponent.shieldAbsorption) > 0;
  // Between two ships we can hurt equally, the one with more to lose: cargo
  // aboard and rival Escort markers are what a kill takes off the table, and
  // so is the target's own marker on us.
  const onMe = escortsOnMe(situation);
  const tokens = (c: TargetOption) => denialTokens(c.opponent, situation.me.id, onMe);
  const byWeakest = (a: TargetOption, b: TargetOption) =>
    Number(canHurt(b)) - Number(canHurt(a)) ||
    a.opponent.hull - b.opponent.hull ||
    tokens(b) - tokens(a) ||
    potential(b) - potential(a);
  const byClosest = (a: TargetOption, b: TargetOption) =>
    a.opponent.ringDistance +
    a.opponent.sectorDistance -
    (b.opponent.ringDistance + b.opponent.sectorDistance);
  const byDanger = (a: TargetOption, b: TargetOption) =>
    b.opponent.danger.score - a.opponent.danger.score || byWeakest(a, b);

  switch (parameters.targetPreference) {
    case "closest":
      return [...candidates].sort(byClosest)[0];
    case "weakest":
      return [...candidates].sort(byWeakest)[0];
    case "mission": {
      const mission = candidates
        .filter((c) => missionTargets.has(c.opponent.player.id))
        .sort(byWeakest);
      if (mission[0]) return mission[0];
      const dangerous = candidates
        .filter((c) => c.opponent.danger.score >= INTERDICT_DANGER)
        .sort(byDanger);
      return dangerous[0] ?? [...candidates].sort(byWeakest)[0];
    }
  }
}
