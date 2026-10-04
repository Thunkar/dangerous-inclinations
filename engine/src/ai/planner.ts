/**
 * Candidate action sequences.
 *
 * A candidate is built around one movement choice (follow the goal plan,
 * close on a target, or hold position). Everything else (facing, energy,
 * heat, which weapons fire and when, scans, scoop, shields) is derived
 * from that movement so that every action in the sequence is valid for the
 * engine at the moment it executes:
 *
 *   1. power the shields, racks and sensor the plan wants up
 *   2. rotate (if the movement or the railgun needs a facing)
 *   3. shots and scans that are in range from the current position
 *   4. the movement (coast / burn / jump)
 *   5. shots and scans that are in range from the projected position
 *
 * The power actions come first because a sensor widens only the shots after
 * it. The loadout is cleared at the start of the turn, so anything the bot
 * wants up is powered again every turn. Heat over the redline at the end of
 * the turn costs hull, and every cube is heat, so the sequence is built
 * against that one budget. Heat is a track: what is left after the
 * dissipation is carried, not forgiven.
 */
import type {
  Facing,
  FireWeaponAction,
  PlayerAction,
  Position,
  ScanAction,
  TacticalAction,
} from "../models/game.ts";
import { MAX_HEAT, isQuietTurn } from "../models/game.ts";
import { SELL_NOTHING, SURVEY_RING } from "../models/missions.ts";
import { BLACK_HOLE_ID } from "../models/gravityWells.ts";
import type { SubsystemId } from "../models/subsystems.ts";
import {
  getMissileStats,
  getSubsystemConfig,
  interceptsPerRack,
} from "../models/subsystems.ts";
import { BURN_COSTS } from "../models/rings.ts";
import { projectPosition } from "../game/movement.ts";
import { getStationAt } from "../game/stations.ts";
import { ringVelocity, samePosition } from "../game/geometry.ts";
import { bestSale, salesOnArrival } from "../game/docking.ts";
import { allowedSales } from "./behaviors/sales.ts";
import { escortCandidates, unplacedEscorts } from "../game/escort.ts";
import { canBeFiredAt, canFireFrom, isInWeaponRange } from "../game/targeting.ts";
import { heatAfterCheck } from "../game/heat.ts";
import type { ActionPlan, BotParameters, Opponent, TacticalSituation } from "./types.ts";
import { INTERDICT_DANGER } from "./types.ts";
import {
  MAX_DISRUPT_BLOCK,
  chooseCriticalTarget,
  chooseDisruptTarget,
  denialTokens,
  disruptBlockChance,
  escortsOnMe,
  isDisruptor,
  destroyTargetIds,
  firingOptions,
  holdFireIds,
  isKillTarget,
  isWeaponReady,
  selectTarget,
  weaponEnergy,
  weaponRangeTarget,
  hullThrough,
  hullPotential,
} from "./behaviors/combat.ts";
import type { ShotOption } from "./behaviors/combat.ts";
import { scanOption } from "./behaviors/scanning.ts";
import type { ScanIntent } from "./behaviors/scanning.ts";
import { assignDefensiveEnergy, powerActions } from "./behaviors/survival.ts";
import type { EnergyTargets } from "./behaviors/survival.ts";
import { castOffChoice, coastChoice, movementFromPlan } from "./behaviors/positioning.ts";
import type { MovementChoice } from "./behaviors/positioning.ts";
import { planShipToTarget } from "./movementPlanner/index.ts";
import { blackBoxAboard, surveyToDive } from "./behaviors/missions.ts";
import { seizeChoices } from "./behaviors/piracy.ts";
import type { SeizableItem } from "../game/piracy.ts";

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
/**
 * How much a hit on a *loaded* ship is worth denying, whatever the scoreboard
 * says about them.
 *
 * A crate or data aboard is a card halfway done, and a kill sends it back to
 * the dock along with two of their turns. That loss is the same whether they
 * are winning or last. Denial used to be multiplied by a danger score that
 * stays near zero until a player is two points up, and measured 17 Sept 2026
 * the table saw a card coming 18% of the time and never once below two points:
 * 69% of everything scored was scored by somebody nobody thought worth
 * shooting at.
 *
 * Only the hold lifts the weight. A flat floor under every shot was tried
 * first and it made bots fire at anyone in reach (every card's completion
 * rate fell, the cheapest secondary of the time by a sixth) because a ship
 * with nothing aboard has nothing to drop.
 */
const LOADED_DENIAL = 0.5;

const flip = (f: Facing): Facing => (f === "prograde" ? "retrograde" : "prograde");

/**
 * Build the full action sequence for one movement choice.
 */
function buildCandidate(
  situation: TacticalSituation,
  parameters: BotParameters,
  movementIn: MovementChoice,
  description: string,
  followsGoal: boolean
): ActionPlan {
  const { me, ship, status, view } = situation;
  let movement = movementIn;
  // Moored at a station: a coast holds the berth instead of drifting and the
  // station carries the ship at the end of the round (RULES §Stations).
  const moored = status.moored;

  // A movement whose heat alone would gut the hull is not worth it. Heat is
  // hull damage only above the top of the track (RULES §Heat check).
  const movementHeatDamage = Math.max(0, status.heat + movement.engineEnergy - MAX_HEAT);
  if (movementHeatDamage > 0 && status.hull - movementHeatDamage < MIN_HULL_AFTER_OVERHEAT) {
    movement = coastChoice(false);
  }

  const preview =
    movement.kind === "coast" && moored ? { ...movement.preview, moored: true } : movement.preview;
  // Where the move ends. A coast or a jump leaves the facing free, and neither
  // depends on it for where the ship ends up, so this is known before the
  // facing is chosen.
  const landing = projectPosition(ship, movement.requiredFacing ?? ship.facing, preview);
  // A marker is a choice ("you may"): the bot puts one on every carrier it
  // ends the turn with, one per marker in hand, except the ship its Destroy
  // card names (a kill is worth two to the marker's one).
  const escortMarks = escortMarksAt(situation, landing);
  const marking = escortMarks.length > 0;
  // The items a pirate names where the move ends (Piracy, "you may").
  const seizes = seizeChoices(view, me, landing);
  const seizing = seizes.length > 0;
  // Ships not to fire on: those `holdFireIds` names, and the ones this turn
  // marks or seizes from (a kill empties the hold, and an empty ship takes no
  // marker and gives up nothing). A Destroy target stays fair game: the kill
  // is worth two, and a shot that does not kill leaves the item to take.
  const prey = destroyTargetIds(me);
  const holdFire = new Set([
    ...holdFireIds(situation),
    ...escortMarks,
    ...seizes.map((i) => i.victimId).filter((id) => !prey.has(id)),
  ]);
  /** Whether this turn may fire at `o` from `at` at all, whatever the weapon. */
  const mayFireAt = (o: Opponent, at: Position) =>
    !isQuietTurn(view.turn, me) &&
    canFireFrom(at, view.stations) &&
    o.sameWell &&
    canBeFiredAt(o.player, view.stations) &&
    !holdFire.has(o.player.id);

  // Facing: the burn direction, or whatever gives the railgun a shot the
  // turn may actually take.
  const canRotate = !status.rotation.isBroken && !status.rotation.usedThisTurn;
  let facing: Facing = movement.requiredFacing ?? ship.facing;
  if (movement.requiredFacing === null && canRotate) {
    const railgun = status.weapons.find((w) => w.type === "railgun" && isWeaponReady(w));
    if (railgun) {
      const shotsWith = (f: Facing) =>
        situation.opponents.filter(
          (o) =>
            mayFireAt(o, landing) && isInWeaponRange(railgun, { ...landing, facing: f }, o.position)
        ).length;
      if (shotsWith(ship.facing) === 0 && shotsWith(flip(ship.facing)) > 0)
        facing = flip(ship.facing);
    }
  }
  const rotate = facing !== ship.facing;

  const pre = { ...status.position, facing };
  const post = { ...landing, facing };
  const endsOnStation = getStationAt(view.stations, post) !== undefined;
  /**
   * "Arrives at a station" (deliberately not "is at one"). Since RULES §Moored
   * a docked ship stays docked, so a coast keeps ending on the station; if
   * that counted as completing a mission step (`completesStep` below, +35 on
   * missionProgress) a moored bot would rate sitting still as progress every
   * turn and loiter in port. Measured: median game length went 33 -> 44
   * rounds with the flag left as `endsOnStation`. Reaching a station is
   * progress; holding a berth already docked at last turn is not.
   */
  const landsOnStation = endsOnStation && !moored;
  const surveying =
    post.wellId === BLACK_HOLE_ID && post.ring === SURVEY_RING && me.missions.some((m) => surveyToDive(me, m));
  // Salvage and Escort are read off the same place: a wreck's black box taken
  // by ending a turn on its sector (a berth included, and whatever is in the
  // hold), a marker put on an undocked carrier by ending a turn in its sector
  // (never from a berth, `escortCandidates`). Nothing moves between the move
  // and the end of the turn (wrecks drift with the stations, at the end of
  // the round).
  const salvaging =
    me.missions.some((m) => m.type === "salvage" && !m.isCompleted && !blackBoxAboard(me, m)) &&
    view.wrecks.some((w) => samePosition(w, post));
  // Docking, the survey, a salvage, a mark and a seizure are all resolved
  // from where the ship ends its turn, so an uncompensated railgun recoil
  // must not move it, and a moored ship pushed off its berth loses the berth.
  const postPositionMatters = endsOnStation || surveying || salvaging || marking || seizing;

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
  // Heat is the only budget: a subsystem's cubes are its heat at the check.
  const fits = (heat: number, overflow = 0) => heatUsed + heat <= heatBudget + overflow;

  // Scoop the plan relies on comes before weapons; low-fuel scooping after.
  const scoopEnergy = getSubsystemConfig("scoop").minEnergy;
  let scoop = false;
  const canScoop =
    movement.kind === "coast" && !status.scoop.isBroken && !status.scoop.usedThisTurn;
  const tryScoop = () => {
    if (scoop || !canScoop || status.reactionMass >= status.maxReactionMass) return;
    if (!fits(scoopEnergy)) return;
    targets.set(status.scoop.id, scoopEnergy);
    heatUsed += scoopEnergy;
    scoop = true;
  };
  if (movement.wantsScoop) tryScoop();

  // Mission scan first: it completes a mission step.
  const scan: ScanIntent | null = scanOption(situation, pre, post, parameters);
  let scanChosen: ScanIntent | null = null;
  const tryScan = () => {
    if (!scan || scanChosen || !fits(scan.heat)) return;
    targets.set(scan.sensor.id, scan.heat);
    heatUsed += scan.heat;
    scanChosen = scan;
  };
  if (scan?.forMission) tryScan();

  // Weapons: concentrate on one target, biggest hits first, spilling
  // over to the next once that one is already accounted for.
  const ctx = {
    pre,
    post,
    enginesUsedByMovement: movement.kind !== "coast",
    massAfterMovement: status.reactionMass - movement.massCost,
    postPositionMatters,
  };
  // A volley the visible shields soak still pays: the cubes it strips cost
  // their owner heat, and a critical breaks the slot it names whether or not
  // the shot reached the hull (RULES §Critical hits). So every ship with a
  // shot is a candidate; `selectTarget` ranks those it can hurt first.
  // The disruptor takes no hull, so it is no part of choosing the target or
  // queueing the volley: it is decided after both (below).
  const firing = situation.opponents
    .filter((o) => o.sameWell && !holdFire.has(o.player.id))
    .map((opponent) => ({ opponent, all: firingOptions(situation, opponent, ctx, parameters) }));
  const options = firing
    .map(({ opponent, all }) => ({ opponent, intents: all.filter((i) => !isDisruptor(i.weapon)) }))
    .filter((o) => o.intents.length > 0);
  const disruptOptions = firing.flatMap(({ opponent, all }) =>
    all.filter((i) => isDisruptor(i.weapon)).map((intent) => ({ opponent, intent }))
  );
  const chosen = selectTarget(situation, options, parameters);
  const target: Opponent | null = chosen?.opponent ?? null;

  // Hull damage already queued on a ship: shielded damage has to beat the
  // shield cubes the bot can see first, laser damage does not. Nothing is
  // gained by firing past the hull, and the engine skips shots at a ship
  // that died earlier in the turn anyway, so the later weapons are offered
  // to the next target in range instead.
  const queued = new Map<string, Array<{ damage: number; shieldPerCube: number | null }>>();
  const hullOn = (o: Opponent, extra?: { damage: number; shieldPerCube: number | null }) =>
    hullThrough(
      [...(queued.get(o.player.id) ?? []), ...(extra ? [extra] : [])],
      o.shieldAbsorption
    );
  const byDamage = (a: ShotOption, b: ShotOption) => b.damage - a.damage;
  const queue: Array<{ opponent: Opponent; intent: ShotOption }> = [];
  for (const option of chosen ? [chosen, ...options.filter((o) => o !== chosen)] : []) {
    for (const intent of [...option.intents].sort(byDamage)) {
      queue.push({ opponent: option.opponent, intent });
    }
  }

  const shots: Array<{ opponent: Opponent; intent: ShotOption }> = [];
  const fired = new Set<string>();
  /**
   * A salvo of `count` rounds off the same launcher: the cubes and the heat
   * are unchanged (a launch is one use of the subsystem however big it is)
   * and the damage is per missile.
   */
  const sized = (intent: ShotOption, count: number): ShotOption =>
    count === intent.count
      ? intent
      : { ...intent, count, damage: (intent.damage / intent.count) * count };
  for (const { opponent, intent: offered } of queue) {
    if (fired.has(offered.weapon.id)) continue;
    if (hullOn(opponent) >= opponent.hull) continue;
    // Heat over the redline is hull damage at the end of the turn. It is
    // worth paying for a shot that finishes a ship, and for any shot at a
    // player about to win, whatever else the bot was doing this turn, because
    // the shot costs them cargo and tempo they cannot buy back.
    const room = (decisive: boolean) =>
      decisive || opponent.danger.score >= INTERDICT_DANGER
        ? Math.max(
            0,
            Math.min(
              MAX_OVERHEAT,
              status.hull -
                MIN_HULL_AFTER_OVERHEAT -
                Math.max(0, status.heat + heatUsed - MAX_HEAT)
            )
          )
        : 0;
    // A salvo is one use of its subsystem whatever its size, so the only reason to
    // hold rounds back is the next target: spend the fewest that still finish
    // the ship, and if none of them does, spend as many as the budget takes.
    // Everything else fires once and has only itself to offer.
    const kills = (count: number) => hullOn(opponent, sized(offered, count)) >= opponent.hull;
    let smallestKill = 0;
    for (let c = 1; c <= offered.count; c++) {
      if (kills(c)) {
        smallestKill = c;
        break;
      }
    }
    const candidates: number[] = [];
    if (smallestKill > 0) candidates.push(smallestKill);
    for (let c = offered.count; c >= 1; c--) if (c !== smallestKill) candidates.push(c);
    let intent: ShotOption | null = null;
    for (const count of candidates) {
      const candidate = sized(offered, count);
      if (!fits(candidate.heat, room(kills(count)))) continue;
      intent = candidate;
      break;
    }
    if (!intent) continue;
    if (intent.compensateRecoil)
      targets.set(
        status.engines.id,
        Math.max(targets.get(status.engines.id) ?? 0, BURN_COSTS.soft.energy)
      );
    targets.set(intent.weapon.id, weaponEnergy(intent.weapon));
    heatUsed += intent.heat;
    fired.add(intent.weapon.id);
    queued.set(opponent.player.id, [...(queued.get(opponent.player.id) ?? []), intent]);
    shots.push({ opponent, intent });
  }

  // The disruptor, once the damage shots are queued: a hit breaks the slot it
  // names unless any powered shield is up, so it fires only at a ship whose
  // shields look down by the time it shoots. It goes last in its phase, so
  // the direct-fire shots at the same ship before it (the pre phase's, and
  // the post phase's too when it fires after the move) have stripped what
  // cubes they can; missiles resolve at the end of the turn and strip
  // nothing in time. A railgun goes after it (its recoil would move the
  // ship out of the range the disruptor was checked from), so it strips
  // nothing in time either.
  const ahead = (o: Opponent, phase: "pre" | "post") =>
    shots
      .filter(
        (s) =>
          s.opponent === o &&
          s.intent.weapon.type !== "missiles" &&
          s.intent.weapon.type !== "railgun" &&
          (s.intent.phase === "pre" || phase === "post")
      )
      .map((s) => s.intent);
  const disruption = disruptOptions
    .filter(({ opponent, intent }) => !fired.has(intent.weapon.id) && hullOn(opponent) < opponent.hull)
    .map((d) => ({ ...d, block: disruptBlockChance(d.opponent, ahead(d.opponent, d.intent.phase)) }))
    .filter((d) => d.block <= MAX_DISRUPT_BLOCK)
    // The volley's own target first, then a ship worth killing, then the one
    // nearest the win; the likelier hit, then the earlier phase, breaks ties.
    .sort(
      (a, b) =>
        Number(b.opponent === target) - Number(a.opponent === target) ||
        Number(isKillTarget(me, b.opponent)) - Number(isKillTarget(me, a.opponent)) ||
        b.opponent.danger.score - a.opponent.danger.score ||
        a.block - b.block
    )[0];
  if (disruption && fits(disruption.intent.heat)) {
    targets.set(disruption.intent.weapon.id, weaponEnergy(disruption.intent.weapon));
    heatUsed += disruption.intent.heat;
    fired.add(disruption.intent.weapon.id);
    shots.push({ opponent: disruption.opponent, intent: disruption.intent });
  }

  let expectedDamage = 0;
  let expectedHullDamage = 0;
  let denialValue = 0;
  const onMe = escortsOnMe(situation);
  for (const option of options) {
    const raw = (queued.get(option.opponent.player.id) ?? []).reduce((s, q) => s + q.damage, 0);
    expectedDamage += raw;
    const hull = hullOn(option.opponent);
    expectedHullDamage += hull;
    if (hull <= 0) continue;
    // What the hit costs them (hull, and on a kill their hold and their next
    // turn) weighted by how close they are to winning, or by the fact that
    // they are carrying something, whichever says more.
    // A rival's Escort marker on the ship counts as a token aboard (the kill
    // sends it home), and so does their own marker on us (the kill takes it
    // off).
    const { danger } = option.opponent;
    const kills = hull >= option.opponent.hull;
    const tokens = denialTokens(option.opponent, me.id, onMe);
    const loss = hull + (kills ? KILL_DENIAL + tokens * CARGO_DENIAL : 0);
    const loaded = tokens > 0;
    denialValue += loss * Math.max(danger.score, loaded ? LOADED_DENIAL : 0);
  }

  // Opportunistic scan and low-fuel scoop with what is left.
  tryScan();
  if (status.reactionMass < parameters.lowFuelThreshold) tryScoop();

  // Spare energy goes to defence, but powered shields charge their cubes as
  // heat at the check, so they come out of the same budget as the volley, and
  // what is left of the track after that is all they may cost.
  const enemiesNear = situation.opponents.some((o) => o.sameWell);
  // A rack is only point defence while it is up, powered or fired on our own
  // turn: a salvo launched after the enemy's move can reach us on the same
  // turn, so waiting until the missiles are on the board is waiting one turn
  // too long. Anyone in the well with a launcher we know about is reason
  // enough to have the rack up (cubes on a face-down slot never read as one:
  // a launcher that fired is face-up).
  const launchersAimedAtUs = situation.opponents.reduce(
    (count, o) =>
      count +
      (o.sameWell
        ? o.knownWeapons.filter((w) => w.type === "missiles" && !w.isBroken && w.inRange).length
        : 0),
    0
  );
  /**
   * Racks worth the heat: one per four missiles that could reach us this round,
   * because a rack rolls at four and the fifth gets through. Missiles already
   * in the air are counted, and every launcher that bears is priced at a full
   * magazine, which is what one action can put up.
   */
  const wantRacks = Math.ceil(
    (situation.incomingMissiles + launchersAimedAtUs * getMissileStats().maxAmmo) /
      interceptsPerRack()
  );
  // A powered sensor makes every shot sequenced after it critical on an 8
  // (missiles resolving at the end of the turn included), which is worth its
  // two heat on a turn that means to shoot and nothing at all on a turn that
  // does not: the bot only shoots on its own turn.
  const wantSensor = shots.length > 0 && status.sensors.some((s) => !s.isBroken);
  /**
   * What to have up until the bot's next turn, kept apart from the turn's own
   * draws. A rack that fires or a sensor that scans is up anyway, so it is
   * priced here at nothing and left out of the power actions: a subsystem does one
   * thing a turn, and powering it first would make the shot or the scan
   * illegal.
   */
  const upWants: EnergyTargets = new Map();
  assignDefensiveEnergy(upWants, {
    shields: status.shields,
    racks: status.racks,
    sensors: status.sensors,
    derived: targets,
    wantShields: enemiesNear || situation.incomingMissiles > 0,
    wantRacks,
    wantSensor,
    heatRoom: Math.max(0, heatBudget - heatUsed),
  });
  const powered: EnergyTargets = new Map([...upWants].filter(([id]) => !targets.has(id)));
  /**
   * Heat the check will bill beyond the turn's own draws: the power actions'
   * cubes. A subsystem holds its cubes once, so a rack that fires and stays up
   * costs two, not four.
   */
  const poweredHeat = [...powered].reduce((sum, [, cubes]) => sum + cubes, 0);

  // Assemble. Power first: a sensor widens only the shots after it.
  const tactical: TacticalAction[] = powerActions(me, powered);
  let sequence = tactical.length + 1;
  const fire = (shot: { opponent: Opponent; intent: ShotOption }): FireWeaponAction => ({
    type: "fire_weapon",
    playerId: me.id,
    sequence: sequence++,
    data: {
      subsystemId: shot.intent.weapon.id,
      targetPlayerId: shot.intent.targetId,
      criticalTarget: (isDisruptor(shot.intent.weapon) ? chooseDisruptTarget : chooseCriticalTarget)(
        shot.opponent,
        isKillTarget(me, shot.opponent) ? "kill" : "suppress"
      ),
      ...(shot.intent.weapon.type === "railgun"
        ? { compensateRecoil: shot.intent.compensateRecoil === true }
        : {}),
      ...(shot.intent.weapon.type === "missiles" ? { count: shot.intent.count } : {}),
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
  // railgun always goes last within its phase. The disruptor goes just
  // before it, after the shots that strip the shield cubes it was priced
  // against.
  const lastInPhase = (s: { intent: ShotOption }) =>
    s.intent.weapon.type === "railgun" ? 2 : isDisruptor(s.intent.weapon) ? 1 : 0;
  const inPhase = (phase: "pre" | "post") =>
    shots.filter((s) => s.intent.phase === phase).sort((a, b) => lastInPhase(a) - lastInPhase(b));

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

  const massSpent =
    movement.massCost + (shots.some((s) => s.intent.compensateRecoil) ? BURN_COSTS.soft.mass : 0);
  // Docking reads the tank after every action: the scoop's gain on a coast
  // is in, a compensated recoil's fuel is out.
  const scooped = scoop
    ? Math.min(ringVelocity(ship.wellId, ship.ring), status.maxReactionMass - status.reactionMass)
    : 0;
  const visit = landsOnStation
    ? arrivalVisit(situation, post.wellId, status.reactionMass + scooped - massSpent)
    : null;

  const actions: PlayerAction[] = [
    ...tactical,
    ...escortMarks.map(
      (carrierId): PlayerAction => ({ type: "escort_mark", playerId: me.id, data: { carrierId } })
    ),
    ...seizeActions(me.id, seizes),
    ...(visit?.sale ? [{ type: "dock_sale", playerId: me.id, data: { sale: visit.sale } } as const] : []),
  ];
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
    heatDamage: Math.max(0, status.heat + heatUsed + poweredHeat - MAX_HEAT),
    heatCarried: heatAfterCheck(status.heat + heatUsed + poweredHeat, status.dissipation),
    massSpent,
    completesStep:
      visit?.completesStep === true ||
      surveying ||
      salvaging ||
      marking ||
      seizing ||
      scansForMission ||
      killsTarget,
    denialValue,
  };
}

/**
 * The sale to name for a visit this turn arrives at, and whether the visit is
 * a step. A station buys one item from each player, once (RULES §Stations),
 * so which station takes which card's item is a plan (behaviors/sales.ts).
 * A dock goal for this station names its own sale when it is on offer, and
 * the visit is a step only then. Any other arrival names the best sale this
 * seat may make here (`allowedSales`: never a secondary at the primary's
 * station), or "none" rather than let the default sell something it may not,
 * and counts, as repairs, a reload and the crates waiting there come with it.
 */
function arrivalVisit(
  situation: TacticalSituation,
  planetId: string,
  reactionMass: number
): { sale: string | null; completesStep: boolean } {
  const { me, currentGoal } = situation;
  const offer = salesOnArrival(
    { cargo: me.cargo, missions: me.missions, reactionMass, soldAt: me.soldAt },
    planetId
  );
  const allowed = allowedSales(me, planetId, offer);
  const goal = currentGoal?.type === "dock" && currentGoal.planetId === planetId ? currentGoal : null;
  const needed = goal?.dockSale ? allowed.find((o) => o.sale === goal.dockSale) : undefined;
  const sale = needed ?? bestSale(allowed);
  const named = sale ? sale.sale : offer.options.length > 0 ? SELL_NOTHING : null;
  return { sale: named, completesStep: goal?.dockSale ? needed !== undefined : true };
}

/**
 * The carriers this seat puts an Escort marker on if its turn ends at `post`:
 * every one the engine would accept there, one per marker in hand, never its
 * own Destroy target.
 */
function escortMarksAt(situation: TacticalSituation, post: Position): string[] {
  const { me, view } = situation;
  const prey = destroyTargetIds(me);
  return escortCandidates(view, me.id, post)
    .filter((id) => !prey.has(id))
    .slice(0, unplacedEscorts(me.missions).length);
}

/** The `seize` actions naming `items`. */
function seizeActions(playerId: string, items: readonly SeizableItem[]): PlayerAction[] {
  return items.map((i) => ({
    type: "seize",
    playerId,
    data: { victimId: i.victimId, cargoId: i.cargoId },
  }));
}

/**
 * The subsystem to fix first: what stops the ship being a ship before what
 * stops it being dangerous. A broken engine, thruster or scoop can strand a
 * ship short of a station (a burn or a jump needs engines and fuel, and the
 * scoop is what refills the tank), so running cold is its only way back and
 * those come first.
 */
const REPAIR_ORDER: readonly SubsystemId[] = ["engines", "rotation", "scoop"];

function coldRepairCandidate(situation: TacticalSituation): ActionPlan | null {
  const { me, ship, status } = situation;
  if (status.heat > 0) return null;
  const broken = ship.subsystems.filter((s) => s.isBroken);
  if (broken.length === 0) return null;
  const target =
    REPAIR_ORDER.find((id) => broken.some((s) => s.id === id)) ??
    broken.find((s) => s.type === "shields")?.id ??
    broken[0].id;

  // Nothing powered: the loadout was cleared at the start of the turn, and a
  // plain coast and the repair put nothing back on it. A marker makes no heat,
  // so a carrier the coast ends beside is marked as on any other turn.
  const post = projectPosition(ship, ship.facing, {
    kind: "coast",
    moored: status.moored,
  });
  const actions: PlayerAction[] = [
    { type: "coast", playerId: me.id, sequence: 1, data: { activateScoop: false } },
    { type: "repair", playerId: me.id, data: { subsystemId: target } },
    ...escortMarksAt(situation, post).map(
      (carrierId): PlayerAction => ({ type: "escort_mark", playerId: me.id, data: { carrierId } })
    ),
    ...seizeActions(me.id, seizeChoices(situation.view, me, post)),
  ];
  return {
    actions,
    description: `Run cold and repair ${target}`,
    expectedDamage: 0,
    expectedHullDamage: 0,
    killsTarget: false,
    followsGoal: false,
    scans: false,
    heatDamage: 0,
    heatCarried: 0,
    massSpent: 0,
    completesStep: false,
    denialValue: 0,
    repairs: target,
  };
}

export function generateCandidates(
  situation: TacticalSituation,
  parameters: BotParameters
): ActionPlan[] {
  const { ship, status, currentGoal } = situation;
  const candidates: ActionPlan[] = [];

  const planned = currentGoal?.plan ? movementFromPlan(ship, status, currentGoal.plan) : null;
  /**
   * A coast while moored holds the berth (the ship does not drift, it sits
   * where it is), so it cannot be a step toward a goal that is somewhere
   * else. The route planner offers one anyway when the real route is
   * unaffordable (it falls back to coarser targets, and with a tank too low
   * to burn, everything coarse is a coast), and a bot that accepted it scored
   * holding port as progress and stayed until the game timed out.
   */
  const goalMovement = planned && status.moored && planned.kind === "coast" ? null : planned;
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
    // Never toward a ship we escort or are about to.
    const holdFire = holdFireIds(situation);
    const prey = situation.opponents
      .filter(
        (o) =>
          o.sameWell &&
          !holdFire.has(o.player.id) &&
          // Nothing can be done to a ship still recovering from a respawn,
          // or to one at a berth, so leaving the route to reach it buys
          // nothing.
          canBeFiredAt(o.player, situation.view.stations) &&
          o.ringDistance <= 3 &&
          (isKillTarget(situation.me, o) ||
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

  /**
   * Run cold and fix one thing. Nothing else offers this: every other
   * candidate scoops, shields up or fires, and a ship whose engines are broken
   * cannot burn or jump, so its goal plans fail and it would otherwise hold
   * position forever. The crew can only get outside on a turn the ship makes
   * no heat at all, so this candidate drains the loadout and coasts.
   */
  const coldRepair = coldRepairCandidate(situation);
  if (coldRepair) candidates.push(coldRepair);

  // A berth is worth the ride and the fuel the scoop skims, and nothing else:
  // the dock itself resolved on arrival. Casting off is always on the table
  // so that a bot whose goal it cannot yet afford has something to choose
  // besides "hold position", which it used to choose for the rest of the game.
  if (status.moored) {
    const castOff = castOffChoice(ship);
    if (castOff) {
      candidates.push(buildCandidate(situation, parameters, castOff, "Cast off", false));
    }
  }

  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = JSON.stringify(c.actions);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
