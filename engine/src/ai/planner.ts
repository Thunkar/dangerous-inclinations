/**
 * Candidate action sequences.
 *
 * A candidate is built around one movement choice (follow the goal plan,
 * close on a target, or hold position). Everything else — facing, energy,
 * heat, which weapons fire and when, scans, scoop, shields — is derived
 * from that movement so that every action in the sequence is valid for the
 * engine at the moment it executes:
 *
 *   1. rotate (if the movement or the railgun needs a facing)
 *   2. shots and scans that are in range from the current position
 *   3. the movement (coast / burn / jump)
 *   4. shots and scans that are in range from the projected position
 *
 * Energy allocations precede all of that (the engine applies them first);
 * the reactor holds 10 and heat above the dissipation capacity at the end
 * of the turn costs hull, so both are budgeted while the sequence is built.
 */
import type {
  Facing,
  FireWeaponAction,
  PlayerAction,
  ScanAction,
  TacticalAction,
} from "../models/game.ts";
import { SURVEY_RING } from "../models/missions.ts";
import { BLACK_HOLE_ID } from "../models/gravityWells.ts";
import { getSubsystemConfig } from "../models/subsystems.ts";
import { BURN_COSTS } from "../models/rings.ts";
import { projectPosition } from "../game/movement.ts";
import { getStationAt, isMooredAt } from "../game/stations.ts";
import { isInWeaponRange } from "../game/targeting.ts";
import type { ActionPlan, BotParameters, Opponent, TacticalSituation } from "./types.ts";
import { INTERDICT_DANGER } from "./types.ts";
import {
  chooseCriticalTarget,
  destroyTargetIds,
  firingOptions,
  isWeaponReady,
  selectTarget,
  weaponRangeTarget,
  hullThrough,
  hullPotential,
} from "./behaviors/combat.ts";
import type { FireIntent } from "./behaviors/combat.ts";
import { scanOption } from "./behaviors/scanning.ts";
import type { ScanIntent } from "./behaviors/scanning.ts";
import { assignDefensiveEnergy, energyActions, totalEnergy } from "./behaviors/survival.ts";
import type { EnergyTargets } from "./behaviors/survival.ts";
import { coastChoice, movementFromPlan } from "./behaviors/positioning.ts";
import type { MovementChoice } from "./behaviors/positioning.ts";
import { planShipToTarget } from "./movementPlanner/index.ts";

/** Hull the bot keeps when it accepts heat damage for a decisive volley. */
const MIN_HULL_AFTER_OVERHEAT = 3;
/** Hull damage from heat the bot will accept for a shot that is worth it. */
const MAX_OVERHEAT = 2;
/** Planning horizon for closing on a target outside the current goal. */
const ENGAGE_PLAN_TURNS = 6;
/**
 * Denial premium for a kill, in "points of hull damage": a destroyed ship
 * drops its cargo (crates go back to their pickup station) and spends its
 * next whole turn respawning at Home.
 */
const KILL_DENIAL = 6;
/** Extra denial per token the victim was carrying when the volley lands. */
const CARGO_DENIAL = 4;

const flip = (f: Facing): Facing => (f === "prograde" ? "retrograde" : "prograde");

/**
 * Build the full action sequence for one movement choice.
 */
export function buildCandidate(
  situation: TacticalSituation,
  parameters: BotParameters,
  movementIn: MovementChoice,
  description: string,
  followsGoal: boolean
): ActionPlan {
  const { me, ship, status, view } = situation;
  let movement = movementIn;
  // Moored at a station: a coast holds the berth instead of drifting, and the
  // station carries the ship at the end of the round (RULES §Moored).
  const moored = isMooredAt(view.stations, status.position);

  const capacity = me.ship.reactor.totalCapacity;
  const rotationEnergy = getSubsystemConfig("rotation").minEnergy;

  // A movement whose heat alone would gut the hull is not worth it.
  const movementHeatDamage = Math.max(0, status.heat + movement.engineEnergy - status.dissipation);
  if (movementHeatDamage > 0 && status.hull - movementHeatDamage < MIN_HULL_AFTER_OVERHEAT) {
    movement = coastChoice(false);
  }
  // Nor is one the reactor cannot power (engines plus the turn it needs).
  const movementRotation =
    movement.requiredFacing !== null && movement.requiredFacing !== ship.facing
      ? rotationEnergy
      : 0;
  if (movement.engineEnergy + movementRotation > capacity) {
    movement = coastChoice(false);
  }

  // Facing: the burn direction, or whatever gives the railgun a shot.
  const canRotate =
    !status.rotation.isBroken &&
    !status.rotation.usedThisTurn &&
    movement.engineEnergy + rotationEnergy <= capacity;
  const preview =
    movement.kind === "coast" && moored ? { ...movement.preview, moored: true } : movement.preview;
  let facing: Facing = movement.requiredFacing ?? ship.facing;
  if (movement.requiredFacing === null && canRotate) {
    const railgun = status.weapons.find((w) => w.type === "railgun" && isWeaponReady(w));
    if (railgun) {
      const shotsWith = (f: Facing) => {
        const post = projectPosition(ship, f, preview);
        return situation.opponents.filter(
          (o) => o.sameWell && isInWeaponRange(railgun, post, o.position)
        ).length;
      };
      if (shotsWith(ship.facing) === 0 && shotsWith(flip(ship.facing)) > 0)
        facing = flip(ship.facing);
    }
  }
  const rotate = facing !== ship.facing;

  const pre = { ...status.position, facing };
  const post = projectPosition(ship, facing, preview);
  const endsOnStation = getStationAt(view.stations, post) !== undefined;
  /**
   * "Arrives at a station" — deliberately not "is at one". Since RULES §Moored
   * a docked ship stays docked, so a coast keeps ending on the station; if
   * that counted as completing a mission step (`completesStep` below, +35 on
   * missionProgress) a moored bot would rate sitting still as progress every
   * turn and loiter in port. Measured: median game length went 33 -> 44
   * rounds with the flag left as `endsOnStation`. Reaching a station is
   * progress; holding a berth already docked at last turn is not.
   */
  const landsOnStation = endsOnStation && !moored;
  const surveying =
    post.wellId === BLACK_HOLE_ID &&
    post.ring === SURVEY_RING &&
    me.missions.some((m) => m.type === "survey" && !m.isCompleted && !m.surveyAcquired);
  // Docking and the survey are both resolved from where the ship ends its
  // turn, so an uncompensated railgun recoil must not move it — and a moored
  // ship pushed off its berth loses the berth.
  const postPositionMatters = endsOnStation || surveying;

  // Budgets.
  const targets: EnergyTargets = new Map();
  let heatUsed = 0;
  if (movement.engineEnergy > 0) {
    targets.set(status.engines.id, movement.engineEnergy);
    heatUsed += movement.engineEnergy;
  }
  if (rotate) {
    targets.set(status.rotation.id, getSubsystemConfig("rotation").minEnergy);
    heatUsed += getSubsystemConfig("rotation").minEnergy;
  }
  const heatBudget = status.heatBudget;
  const fits = (energy: number, heat: number, overflow = 0) =>
    totalEnergy(targets) + energy <= capacity && heatUsed + heat <= heatBudget + overflow;

  // Scoop the plan relies on comes before weapons; low-fuel scooping after.
  const scoopEnergy = getSubsystemConfig("scoop").minEnergy;
  let scoop = false;
  const canScoop =
    movement.kind === "coast" && !status.scoop.isBroken && !status.scoop.usedThisTurn;
  const tryScoop = () => {
    if (scoop || !canScoop || status.reactionMass >= status.maxReactionMass) return;
    if (!fits(scoopEnergy, scoopEnergy)) return;
    targets.set(status.scoop.id, scoopEnergy);
    heatUsed += scoopEnergy;
    scoop = true;
  };
  if (movement.wantsScoop) tryScoop();

  // Mission scan first: it completes a mission step.
  const scan: ScanIntent | null = scanOption(situation, pre, post, parameters);
  let scanChosen: ScanIntent | null = null;
  const tryScan = () => {
    if (!scan || scanChosen || !fits(scan.energy, scan.heat)) return;
    targets.set(scan.sensor.id, scan.energy);
    heatUsed += scan.heat;
    scanChosen = scan;
  };
  if (scan?.forMission) tryScan();

  // A survey only counts with the sensor array powered while the ship holds the ring.
  if (surveying) {
    const sensor = status.sensors.find((s) => !s.isBroken);
    const sensorEnergy = getSubsystemConfig("sensor_array").minEnergy;
    if (sensor && !targets.has(sensor.id) && fits(sensorEnergy, 0)) {
      targets.set(sensor.id, sensorEnergy);
    }
  }

  // Weapons: concentrate on one target, biggest hits first, spilling
  // over to the next once that one is already accounted for.
  const ctx = {
    pre,
    post,
    enginesUsedByMovement: movement.kind !== "coast",
    massAfterMovement: status.reactionMass - movement.massCost,
    postPositionMatters,
  };
  // A shield tile absorbs damage up to the cubes on it and is refilled for
  // free on its owner's next turn, so a volley that cannot beat the cubes we
  // can see never reaches a hull, never lands a critical (a critical only
  // breaks a tile if the shot reaches the hull) and buys nothing but our own
  // heat, a missile off the rack and a tile turned face-up. A ship whose
  // whole volley falls inside the visible shields is not fired on at all.
  const options = situation.opponents
    .filter((o) => o.sameWell)
    .map((opponent) => ({
      opponent,
      intents: firingOptions(situation, opponent, ctx, parameters),
    }))
    .filter((o) => o.intents.length > 0 && hullThrough(o.intents, o.opponent.shieldAbsorption) > 0);
  // Ships we are trying to kill rather than merely defang: a Destroy card
  // names them, or they are one dock from winning. Criticals aim at their
  // shields, and missiles are spent on them rather than held.
  const destroyTargets = destroyTargetIds(situation.me);
  const killIntent = (o: Opponent) =>
    destroyTargets.has(o.player.id) || o.danger.score >= INTERDICT_DANGER;
  const chosen = selectTarget(situation, options, parameters);
  const target: Opponent | null = chosen?.opponent ?? null;

  // Hull damage already queued on a ship: shielded damage has to beat the
  // shield cubes the bot can see first, laser damage does not. Nothing is
  // gained by firing past the hull, and the engine skips shots at a ship
  // that died earlier in the turn anyway, so the later weapons are offered
  // to the next target in range instead.
  const queued = new Map<string, Array<{ damage: number; shielded: boolean }>>();
  const hullOn = (o: Opponent, extra?: { damage: number; shielded: boolean }) =>
    hullThrough(
      [...(queued.get(o.player.id) ?? []), ...(extra ? [extra] : [])],
      o.shieldAbsorption
    );
  const byDamage = (a: FireIntent, b: FireIntent) => b.damage - a.damage;
  const queue: Array<{ opponent: Opponent; intent: FireIntent }> = [];
  for (const option of chosen ? [chosen, ...options.filter((o) => o !== chosen)] : []) {
    for (const intent of [...option.intents].sort(byDamage)) {
      queue.push({ opponent: option.opponent, intent });
    }
  }

  const shots: Array<{ opponent: Opponent; intent: FireIntent }> = [];
  const fired = new Set<string>();
  for (const { opponent, intent } of queue) {
    if (fired.has(intent.weapon.id)) continue;
    if (hullOn(opponent) >= opponent.hull) continue;
    const energy = intent.energy + (intent.compensateRecoil ? BURN_COSTS.soft.energy : 0);
    const decisive = hullOn(opponent, intent) >= opponent.hull;
    // Heat over the dissipation is hull damage at the end of the turn. It is
    // worth paying for a shot that finishes a ship — and for any shot at a
    // player about to win, whatever else the bot was doing this turn, because
    // the shot costs them cargo and tempo they cannot buy back.
    const worthOverheating = decisive || opponent.danger.score >= INTERDICT_DANGER;
    const overflow = worthOverheating
      ? Math.max(
          0,
          Math.min(
            MAX_OVERHEAT,
            status.hull - MIN_HULL_AFTER_OVERHEAT - (status.heat + heatUsed - status.dissipation)
          )
        )
      : 0;
    if (!fits(energy, intent.heat, overflow)) continue;
    if (intent.compensateRecoil)
      targets.set(
        status.engines.id,
        Math.max(targets.get(status.engines.id) ?? 0, BURN_COSTS.soft.energy)
      );
    targets.set(intent.weapon.id, intent.energy);
    heatUsed += intent.heat;
    fired.add(intent.weapon.id);
    queued.set(opponent.player.id, [...(queued.get(opponent.player.id) ?? []), intent]);
    shots.push({ opponent, intent });
  }

  let expectedDamage = 0;
  let expectedHullDamage = 0;
  let denialValue = 0;
  for (const option of options) {
    const raw = (queued.get(option.opponent.player.id) ?? []).reduce((s, q) => s + q.damage, 0);
    expectedDamage += raw;
    const hull = hullOn(option.opponent);
    expectedHullDamage += hull;
    if (hull <= 0) continue;
    // Denial: the same damage is worth more against a player whose next dock
    // wins the game. A kill also empties their hold and skips their turn.
    const { danger } = option.opponent;
    const kills = hull >= option.opponent.hull;
    denialValue +=
      danger.score *
      (hull + (kills ? KILL_DENIAL + (danger.crates + danger.data) * CARGO_DENIAL : 0));
  }

  // Opportunistic scan and low-fuel scoop with what is left.
  tryScan();
  if (status.reactionMass < parameters.lowFuelThreshold) tryScoop();

  // Spare energy goes to defence.
  const enemiesNear = situation.opponents.some((o) => o.sameWell);
  assignDefensiveEnergy(
    targets,
    status.shields,
    status.racks.filter((r) => !shots.some((s) => s.intent.weapon.id === r.id)),
    enemiesNear || situation.incomingMissiles > 0,
    situation.incomingMissiles > 0,
    getSubsystemConfig("shields").maxEnergy,
    capacity
  );

  // Assemble.
  const { deallocations, allocations } = energyActions(me, targets);
  const tactical: TacticalAction[] = [];
  let sequence = 1;
  const fire = (shot: { opponent: Opponent; intent: FireIntent }): FireWeaponAction => ({
    type: "fire_weapon",
    playerId: me.id,
    sequence: sequence++,
    data: {
      subsystemId: shot.intent.weapon.id,
      targetPlayerId: shot.intent.targetId,
      criticalTarget: chooseCriticalTarget(
        shot.opponent,
        killIntent(shot.opponent) ? "kill" : "suppress"
      ),
      ...(shot.intent.weapon.type === "railgun"
        ? { compensateRecoil: shot.intent.compensateRecoil === true }
        : {}),
    },
  });
  const scanAction = (intent: ScanIntent): ScanAction => ({
    type: "scan",
    playerId: me.id,
    sequence: sequence++,
    data: { targetPlayerId: intent.targetId, peekSlot: intent.peekSlot },
  });

  // An uncompensated railgun recoil changes the ring, which would put any
  // later shot or scan out of the range it was checked against, so the
  // railgun always goes last within its phase.
  const inPhase = (phase: "pre" | "post") =>
    shots
      .filter((s) => s.intent.phase === phase)
      .sort(
        (a, b) =>
          Number(a.intent.weapon.type === "railgun") - Number(b.intent.weapon.type === "railgun")
      );

  if (rotate)
    tactical.push({
      type: "rotate",
      playerId: me.id,
      sequence: sequence++,
      data: { targetFacing: facing },
    });
  if (scanChosen && (scanChosen as ScanIntent).phase === "pre")
    tactical.push(scanAction(scanChosen));
  for (const s of inPhase("pre")) tactical.push(fire(s));

  switch (movement.kind) {
    case "coast":
      tactical.push({
        type: "coast",
        playerId: me.id,
        sequence: sequence++,
        data: { activateScoop: scoop },
      });
      break;
    case "burn":
      tactical.push({
        type: "burn",
        playerId: me.id,
        sequence: sequence++,
        data: {
          burnIntensity: movement.burnIntensity!,
          sectorAdjustment: movement.sectorAdjustment ?? 0,
        },
      });
      break;
    case "jump":
      tactical.push({
        type: "well_transfer",
        playerId: me.id,
        sequence: sequence++,
        data: {
          destinationWellId: movement.destinationWellId!,
          sectorAdjustment: movement.sectorAdjustment ?? 0,
        },
      });
      break;
  }

  if (scanChosen && (scanChosen as ScanIntent).phase === "post")
    tactical.push(scanAction(scanChosen));
  for (const s of inPhase("post")) tactical.push(fire(s));

  const actions: PlayerAction[] = [...deallocations, ...allocations, ...tactical];
  const killsTarget = target !== null && hullOn(target) >= target.hull;
  const scansForMission = scanChosen !== null && (scanChosen as ScanIntent).forMission;

  return {
    actions,
    description,
    expectedDamage,
    expectedHullDamage,
    killsTarget,
    targetId: target?.player.id,
    followsGoal,
    scans: scanChosen !== null,
    heatDamage: Math.max(0, status.heat + heatUsed - status.dissipation),
    massSpent:
      movement.massCost + (shots.some((s) => s.intent.compensateRecoil) ? BURN_COSTS.soft.mass : 0),
    completesStep: landsOnStation || surveying || scansForMission || killsTarget,
    denialValue,
  };
}

/**
 * Distinct candidates for this turn: follow the goal, close on a target,
 * hold position. Identical action sequences are merged.
 */
export function generateCandidates(
  situation: TacticalSituation,
  parameters: BotParameters
): ActionPlan[] {
  const { ship, status, currentGoal } = situation;
  const candidates: ActionPlan[] = [];

  const goalMovement = currentGoal?.plan ? movementFromPlan(ship, status, currentGoal.plan) : null;
  if (goalMovement && currentGoal) {
    candidates.push(
      buildCandidate(situation, parameters, goalMovement, `Goal: ${currentGoal.description}`, true)
    );
  }

  // Close on the most relevant enemy in this well when the goal is not already doing so.
  const readyWeapons = status.weapons.filter(isWeaponReady);
  if (readyWeapons.length > 0 && parameters.aggressiveness > 0) {
    // Worth leaving the route for: a ship a Destroy card names, a ship one
    // dock from winning the game, or a ship this turn's volley could finish
    // outright. Trading a turn of a cargo run for two points of hull on a
    // bystander who will repair at their next station is not a trade.
    const missionTargets = destroyTargetIds(situation.me);
    const prey = situation.opponents
      .filter(
        (o) =>
          o.sameWell &&
          o.ringDistance <= 3 &&
          (missionTargets.has(o.player.id) ||
            o.danger.score >= INTERDICT_DANGER ||
            hullPotential(readyWeapons, o.shieldAbsorption) >= o.hull)
      )
      .sort(
        (a, b) =>
          Number(missionTargets.has(b.player.id)) - Number(missionTargets.has(a.player.id)) ||
          b.danger.score - a.danger.score ||
          a.ringDistance + a.sectorDistance - (b.ringDistance + b.sectorDistance)
      )[0];
    const alreadyChasing =
      (currentGoal?.type === "hunt" || currentGoal?.type === "interdict") &&
      currentGoal.targetPlayerId === prey?.player.id;
    if (prey && !alreadyChasing) {
      const plan = planShipToTarget(
        ship,
        weaponRangeTarget(readyWeapons, prey.position),
        ENGAGE_PLAN_TURNS
      );
      const movement = plan ? movementFromPlan(ship, status, plan) : null;
      if (movement) {
        candidates.push(
          buildCandidate(situation, parameters, movement, `Engage ${prey.player.name}`, false)
        );
      }
    }
  }

  candidates.push(
    buildCandidate(
      situation,
      parameters,
      coastChoice(false),
      "Hold position",
      goalMovement?.kind === "coast"
    )
  );

  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = JSON.stringify(c.actions);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
