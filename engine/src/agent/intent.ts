/**
 * From what an agent wants to do to the actions the engine accepts. Cubes for
 * a burn, a rotation or a shot are not the agent's business at all: the engine
 * powers a subsystem from the action that uses it. What the builder does carry is
 * `power`, the shields, racks and sensor the agent wants up until its next
 * turn, and the order a turn is played in. The loadout is cleared at the start
 * of every turn, so a subsystem not named in `power` (and not used) is off.
 */
import type {
  BurnIntensity,
  Facing,
  GravityWellId,
  Player,
  PlayerAction,
  Position,
} from "../models/game.ts";
import { MAX_REACTION_MASS, isQuietTurn } from "../models/game.ts";
import type { SubsystemId } from "../models/subsystems.ts";
import { LOAD_CRATES, SCAN_SECTOR_RANGE, SELL_FUEL, SELL_NOTHING } from "../models/missions.ts";
import { getSubsystemConfig, isPowerableType } from "../models/subsystems.ts";
import { BURN_COSTS, calculateBurnMassCost, calculateJumpMassCost } from "../models/rings.ts";
import type { GameView } from "../game/view.ts";
import { powerActions, type EnergyTargets } from "../ai/behaviors/survival.ts";
import { canBeTargeted, isTouchable, canFireFrom, isInWeaponRange } from "../game/targeting.ts";
import { inScanRange } from "../game/scan.ts";
import { hasWorkingCompressor } from "../game/ship.ts";
import { projectPosition, recoilRing, ringAfter, type MovementPreview } from "../game/movement.ts";
import {
  driftPosition,
  positionOf,
  ringVelocity,
  samePosition,
  wrapSector,
} from "../game/geometry.ts";
import { isMooredAt, isMooredMidTurn } from "../game/stations.ts";
import { escortCandidates, unplacedEscorts } from "../game/escort.ts";
import { freePiracyCards } from "../game/piracy.ts";
import { onSurveyRing, surveyToTake } from "../game/survey.ts";
import { salvageToTake } from "../game/salvage.ts";
import { findJump, getJumpOptions, phasedJumpDestination } from "../models/gravityWells.ts";

export interface FireIntent {
  weapon: SubsystemId;
  target: string;
  /** Slot to break on a critical; defaults to the engines. */
  critical?: SubsystemId;
  compensateRecoil?: boolean;
  /**
   * Missiles only: how many rounds go up in this one launch. A salvo of any
   * size is one use of the subsystem: no extra cubes and no extra heat, so the
   * magazine is what limits it.
   */
  count?: number;
  /**
   * Fire before or after the move. Default: a railgun after the move (its
   * recoil would derail a burn) unless only the start of the move reaches the
   * target, anything else before the move if the target is in range from
   * where the ship stands, otherwise after.
   */
  when?: "before" | "after";
}

export interface TurnIntent {
  /**
   * Subsystems to power this turn and the cubes to put on each: shields 1 or 2, a
   * ballistic rack 2, a sensor array 2. They work until your next turn, and
   * they run first, so a sensor widens every shot this turn. Ones not named
   * are off: the loadout is cleared at the start of the turn. Nothing else
   * takes cubes here: the engines, the thrusters, the scoop and every weapon
   * are powered by the action that uses them, and a rack that fires or a
   * sensor that scans is left up by it (a subsystem does one thing a turn, so do
   * not also power it).
   */
  power?: Partial<Record<SubsystemId, number>>;
  /**
   * Turn the ship to the other facing (the thrusters, once a turn). `true`
   * turns it before a move that leaves the facing free (a coast, or a burn
   * that names no facing) and right after one that already has the facing it
   * needs (a burn naming the facing the ship has, or a jump while prograde),
   * so it can scan or fire along the ring it arrives on. "before" and "after"
   * place it explicitly. A move that needs the other facing always turns the
   * ship before it.
   */
  rotate?: boolean | "before" | "after";
  move?:
    | { kind: "coast"; scoop?: boolean }
    | { kind: "burn"; intensity: BurnIntensity; adjustment?: number; facing?: Facing }
    | { kind: "jump"; destinationWellId: string; adjustment?: number };
  /**
   * Shots in the order given within each side of the move. Order matters: a
   * salvo that lands flies and attacks as it is launched, so list it before
   * a disruptor it should strip a wall for.
   */
  fire?: FireIntent[];
  scan?: { target: string; slot?: SubsystemId };
  /**
   * A broken subsystem to repair at the heat check. It only lands if the turn makes
   * no heat at all: no move but a coast without the scoop, no shot, no scan,
   * and no shields powered.
   */
  repair?: SubsystemId;
  /**
   * What the station buys if this turn arrives at one: an item aboard by its
   * cargo id, "fuel" for a Tanker's pump, or "none" to sell nothing. A
   * station buys one item from you, once per game. Left out, or one the
   * visit cannot make, and the visit sells whatever completes the most
   * mission points (ties to crates, then data, then fuel).
   */
  sell?: string;
  /**
   * Rivals to put an Escort marker on, one per marker in hand, each a
   * different ship. A "you may": nothing is placed unless named here. Each is
   * an action in the sequence: before the move when the rival can take it
   * where you start, otherwise right after the move, and either way ahead of
   * every shot and seizure on that side of the move. One that does not
   * qualify at that point (not on your ring, carrying nothing, already
   * marked, just back from Home, either of you moored) is refused.
   */
  escort?: string[];
  /**
   * Survey: take the data. An action in the sequence: before the move when
   * you start on Black Hole Ring 1, otherwise right after the move. One a
   * turn, for the first undone Survey with no data aboard. Refused if you are
   * not on the ring at that point.
   */
  survey?: boolean;
  /**
   * Salvage: take this wreck's black box (its id, from `view.wrecks`). An
   * action in the sequence: before the move when the wreck is in your sector
   * where you start, otherwise right after the move. One wreck a turn, moored
   * or not. Refused if the wreck is not in your sector at that point.
   *
   * `true` names no wreck: the first one in your sector where the salvage
   * comes. Before the move with a wreck where you start, right after it with
   * one where the move ends, and otherwise last of all, after your shots, so
   * a ship they destroy in that sector leaves its wreck for it (a ship is
   * settled the moment it dies). Finding no wreck there, it is not taken.
   */
  salvage?: string | true;
  /**
   * Items to seize, one per free Piracy card, each a different item. A "you
   * may": nothing is taken unless named here. Each is an action in the
   * sequence: before the move when the victim shares your sector where you
   * start, otherwise right after the move, and either way ahead of every shot
   * on that side of the move, so a shot that destroys the victim cannot take
   * the item down with it. An item that is not there to take at that point
   * is refused.
   */
  seize?: { victim: string; cargoId: string }[];
}

export interface BuiltTurn {
  actions: PlayerAction[];
  /**
   * What the builder filled in or changed, and anything in the turn as built
   * that the engine will refuse, for the agent's log.
   */
  notes: string[];
}

/** Turn an intent into the engine's actions for `view.me`. Pure; validate with a preview before submitting. */
export function buildTurn(view: GameView, intent: TurnIntent): BuiltTurn {
  const me = view.me;
  if (!me) throw new Error("A spectator cannot act");
  const ship = me.ship;
  const notes: string[] = [];
  const find = (id: SubsystemId) => ship.subsystems.find((s) => s.id === id);

  // Only what the intent asks for: the loadout starts the turn clear, so
  // nothing is up unless this turn powers it. A subsystem an action powers is not
  // named here and never needs to be.
  const targets: EnergyTargets = new Map();
  for (const [id, cubes] of Object.entries(intent.power ?? {}) as Array<[SubsystemId, number]>) {
    const sub = find(id);
    if (!sub) {
      notes.push(`no subsystem ${id} aboard; ignored`);
      continue;
    }
    if (!isPowerableType(sub.type)) {
      notes.push(`${id} is powered by the action that uses it; it takes no cubes here`);
      continue;
    }
    if (sub.isBroken) {
      notes.push(`${id} is broken and cannot be powered; ignored`);
      continue;
    }
    const c = getSubsystemConfig(sub.type);
    const wanted = Math.max(0, Math.min(c.maxEnergy, Math.round(cubes)));
    if (wanted === 0) continue;
    if (wanted < c.minEnergy) {
      notes.push(`${id} needs at least ${c.minEnergy} cubes to work; set to ${c.minEnergy}`);
      targets.set(id, c.minEnergy);
    } else targets.set(id, wanted);
  }
  // A subsystem does one thing a turn. The engine refuses the pair, and says so;
  // this note is only the reason, in advance.
  const used = new Set<SubsystemId>([
    ...(intent.fire ?? []).map((f) => f.weapon),
    ...(intent.scan
      ? ship.subsystems.filter((s) => s.type === "sensor_array").map((s) => s.id)
      : []),
  ]);
  for (const id of targets.keys()) {
    if (used.has(id))
      notes.push(
        `${id} is powered and also used this turn; a subsystem does one thing a turn, and using it leaves it up anyway`
      );
  }

  const move = intent.move ?? { kind: "coast" as const };
  // The thrusters turn the ship once a turn, before the move or right after
  // it. A move that needs a facing decides it: a burn's own facing when it
  // names one, prograde for a jump. Asked with `true`, the rotation goes
  // before a move that leaves the facing free (or names none) and right after
  // a move that already has the facing it needs, so a burn onto a ring can
  // turn the ship to scan or fire along it; "before" and "after" say which.
  const moveFacing: Facing | undefined =
    move.kind === "burn" ? move.facing : move.kind === "jump" ? "prograde" : undefined;
  const asked =
    intent.rotate === true
      ? "auto"
      : intent.rotate === "before" || intent.rotate === "after"
        ? intent.rotate
        : null;
  if (intent.rotate !== undefined && intent.rotate !== false && asked === null)
    notes.push(`"rotate" is true, "before" or "after", not ${JSON.stringify(intent.rotate)}; ignored`);
  let rotation: "before" | "after" | null = null;
  if (moveFacing !== undefined && moveFacing !== ship.facing) {
    rotation = "before";
    if (asked === "after")
      notes.push(
        `the ${move.kind} needs ${moveFacing} facing, so the rotation goes before it; the thrusters turn once a turn, so there is none after it`
      );
  } else if (asked === "auto") rotation = moveFacing === undefined ? "before" : "after";
  else if (asked === "after") rotation = "after";
  else if (asked === "before") {
    if (moveFacing !== undefined)
      notes.push(
        `the ${move.kind} needs ${moveFacing} facing, which the ship already has; a rotation before it is dropped ("rotate": "after" turns the ship after the move)`
      );
    else rotation = "before";
  }
  const turned: Facing = ship.facing === "prograde" ? "retrograde" : "prograde";
  /** Facing before and during the move, and after it. */
  const facing: Facing = rotation === "before" ? turned : ship.facing;
  const postFacing: Facing = rotation === null ? ship.facing : turned;
  for (const f of intent.fire ?? []) {
    const w = find(f.weapon);
    if (!w) {
      notes.push(`no weapon ${f.weapon} aboard; shot dropped`);
      continue;
    }
  }

  // Power first: a sensor widens only the shots after it.
  const actions: PlayerAction[] = powerActions(me as Player, targets);
  let sequence = actions.length;
  const seq = () => ++sequence;

  // Where the ship stands before and after the move, for choosing when a shot fires.
  const pre = { wellId: ship.wellId, ring: ship.ring, sector: ship.sector, facing };
  const jumpOption =
    move.kind === "jump"
      ? getJumpOptions(pre).find((o) => o.destination.wellId === move.destinationWellId)
      : undefined;
  const preview: MovementPreview =
    move.kind === "coast"
      ? { kind: "coast", moored: isMooredMidTurn(view.stations, ship, pre) }
      : move.kind === "burn"
        ? { kind: "burn", burnIntensity: move.intensity, sectorAdjustment: move.adjustment ?? 0 }
        : {
            kind: "jump",
            jumpDestination: jumpOption
              ? phasedJumpDestination(jumpOption, move.adjustment ?? 0)
              : undefined,
          };
  const post = { ...projectPosition(ship, facing, preview), facing: postFacing };
  const targetPosition = (id: string) => {
    const s = view.players.find((p) => p.id === id)?.ship;
    return s ? positionOf(s) : null;
  };
  const phaseOf = (f: FireIntent): "before" | "after" => {
    if (f.when) return f.when;
    const weapon = find(f.weapon)!;
    const at = targetPosition(f.target);
    const before = !!at && isInWeaponRange(weapon, pre, at);
    const after = !!at && isInWeaponRange(weapon, post, at);
    // A railgun's recoil moves the ship a ring, so it waits for the move
    // unless only the start of the move has the shot.
    if (weapon.type === "railgun") return before && !after ? "before" : "after";
    // Reaching from neither, it goes before the move and the walk below says why.
    return before || !after ? "before" : "after";
  };
  const shots = (intent.fire ?? [])
    .filter((f) => find(f.weapon))
    .map((f) => ({ ...f, when: phaseOf(f) }));
  const fireAction = (f: FireIntent): PlayerAction => ({
    type: "fire_weapon",
    playerId: me.id,
    sequence: seq(),
    data: {
      subsystemId: f.weapon,
      targetPlayerId: f.target,
      criticalTarget: f.critical ?? "engines",
      ...(f.compensateRecoil ? { compensateRecoil: true } : {}),
      ...(f.count !== undefined ? { count: f.count } : {}),
    },
  });

  // A scan widens the critical range of every shot after it, so it goes as
  // early as it reaches: before the move when the target is in scan range
  // from where the ship starts (facing as the rotation leaves it), otherwise
  // right after the move.
  const sensor = ship.subsystems.find((s) => s.type === "sensor_array");
  if (intent.scan && !sensor) notes.push("no sensor array aboard; scan dropped");
  const scanTarget = intent.scan ? targetPosition(intent.scan.target) : null;
  const scanBefore = !!scanTarget && inScanRange(pre, scanTarget);
  const scanAction = (): PlayerAction[] =>
    intent.scan && sensor
      ? [
          {
            type: "scan",
            playerId: me.id,
            sequence: seq(),
            // The engine turns a peek at a slot the scanner already knows into
            // a peek at the first one it does not, so the bow is a safe default.
            data: { targetPlayerId: intent.scan.target, peekSlot: intent.scan.slot ?? "forward-0" },
          },
        ]
      : [];

  // Seizures: each named once, against a rival at the table. One the victim
  // shares the start's sector for goes before the move, the rest right after
  // it, and both ahead of the shots on their side of the move.
  const seizes: { victim: string; cargoId: string; before: boolean }[] = [];
  for (const { victim, cargoId } of intent.seize ?? []) {
    const at = targetPosition(victim);
    if (victim === me.id) notes.push("a seizure is made from a rival, not you; dropped");
    else if (!view.players.some((p) => p.id === victim))
      notes.push(`no player ${String(victim)} to seize from; dropped`);
    else if (seizes.some((x) => x.victim === victim && x.cargoId === cargoId))
      notes.push(`${cargoId} named twice for a seizure; once kept`);
    else seizes.push({ victim, cargoId, before: !!at && samePosition(at, pre) });
  }
  const seizeActions = (before: boolean): PlayerAction[] =>
    seizes
      .filter((x) => x.before === before)
      .map((x) => ({
        type: "seize",
        playerId: me.id,
        sequence: seq(),
        data: { victimId: x.victim, cargoId: x.cargoId },
      }));

  // Escort markers: each named once, against a rival at the table, one per
  // marker in hand. One the rival can take where the ship starts goes before
  // the move, the rest right after it, ahead of the seizures (a seizure could
  // empty the carrier) and the shots on their side of the move.
  const marks: { carrierId: string; before: boolean }[] = [];
  if (intent.escort !== undefined) {
    const inHand = unplacedEscorts(me.missions).length;
    const atStart = new Set(escortCandidates(view, me.id, pre, pre));
    for (const carrierId of intent.escort) {
      if (carrierId === me.id) notes.push("an Escort marker goes on a rival, not you; dropped");
      else if (!view.players.some((p) => p.id === carrierId))
        notes.push(`no player ${String(carrierId)} to escort; dropped`);
      else if (marks.some((m) => m.carrierId === carrierId))
        notes.push(`${carrierId} named twice for Escort; once kept`);
      else if (marks.length >= inHand)
        notes.push(`only ${inHand} Escort marker(s) in hand; ${carrierId} dropped`);
      else marks.push({ carrierId, before: atStart.has(carrierId) });
    }
  }
  const markActions = (before: boolean): PlayerAction[] =>
    marks
      .filter((m) => m.before === before)
      .map((m) => ({
        type: "escort_mark",
        playerId: me.id,
        sequence: seq(),
        data: { carrierId: m.carrierId },
      }));
  // The survey and the salvage: where the ship starts if it qualifies there,
  // otherwise right after the move.
  const surveyBefore = onSurveyRing(pre);
  const surveyActions = (before: boolean): PlayerAction[] =>
    intent.survey === true && surveyBefore === before
      ? [{ type: "survey", playerId: me.id, sequence: seq(), data: {} }]
      : [];
  // A named wreck goes where the ship meets it; `true` names none, and goes
  // where a wreck is (the start, then the move's end) or else after every
  // shot, for the wreck a kill leaves.
  const named =
    typeof intent.salvage === "string"
      ? view.wrecks.find((w) => w.id === intent.salvage)
      : undefined;
  if (typeof intent.salvage === "string" && !named)
    notes.push(`no wreck ${String(intent.salvage)} on the board; salvage dropped`);
  const unnamed = intent.salvage === true;
  const salvagePlace: "before" | "after" | "last" | null = named
    ? samePosition(named, pre)
      ? "before"
      : "after"
    : unnamed
      ? view.wrecks.some((w) => samePosition(w, pre))
        ? "before"
        : view.wrecks.some((w) => samePosition(w, post))
          ? "after"
          : "last"
      : null;
  const salvageActions = (place: "before" | "after" | "last"): PlayerAction[] =>
    salvagePlace === place
      ? [
          {
            type: "salvage",
            playerId: me.id,
            sequence: seq(),
            data: named ? { wreckId: named.id } : {},
          },
        ]
      : [];

  const rotateAction = (): PlayerAction => ({
    type: "rotate",
    playerId: me.id,
    sequence: seq(),
    data: { targetFacing: turned },
  });
  if (rotation === "before") actions.push(rotateAction());
  actions.push(...markActions(true));
  actions.push(...seizeActions(true));
  actions.push(...surveyActions(true));
  actions.push(...salvageActions("before"));
  if (scanBefore) actions.push(...scanAction());
  for (const f of shots.filter((s) => s.when === "before")) actions.push(fireAction(f));
  if (move.kind === "coast")
    actions.push({
      type: "coast",
      playerId: me.id,
      sequence: seq(),
      data: { activateScoop: move.scoop === true },
    });
  else if (move.kind === "burn")
    actions.push({
      type: "burn",
      playerId: me.id,
      sequence: seq(),
      data: { burnIntensity: move.intensity, sectorAdjustment: move.adjustment ?? 0 },
    });
  else
    actions.push({
      type: "well_transfer",
      playerId: me.id,
      sequence: seq(),
      data: {
        destinationWellId: move.destinationWellId as GravityWellId,
        sectorAdjustment: move.adjustment ?? 0,
      },
    });
  if (rotation === "after") actions.push(rotateAction());
  actions.push(...markActions(false));
  actions.push(...seizeActions(false));
  actions.push(...surveyActions(false));
  actions.push(...salvageActions("after"));
  if (!scanBefore) actions.push(...scanAction());
  for (const f of shots.filter((s) => s.when !== "before")) actions.push(fireAction(f));
  actions.push(...salvageActions("last"));
  notes.push(...foreseenRefusals(view, me, actions));
  if (intent.repair !== undefined) {
    const sub = ship.subsystems.find((s) => s.id === intent.repair);
    if (!sub) notes.push(`no subsystem ${intent.repair}; repair dropped`);
    else if (!sub.isBroken) notes.push(`${intent.repair} is not broken; repair dropped`);
    else actions.push({ type: "repair", playerId: me.id, data: { subsystemId: intent.repair } });
  }
  if (intent.sell !== undefined) {
    const sale = intent.sell;
    const known =
      sale === SELL_FUEL ||
      sale === SELL_NOTHING ||
      sale === LOAD_CRATES ||
      me.cargo.some((c) => c.id === sale);
    if (!known)
      notes.push(
        `${String(sale)} is not an item in your hold, "${SELL_FUEL}", "${LOAD_CRATES}" or "${SELL_NOTHING}"; sale dropped`
      );
    else actions.push({ type: "dock_sale", playerId: me.id, data: { sale } });
  }
  return { actions, notes };
}

/**
 * What the engine will refuse in the turn as built, walked in its order from
 * where the ship stands, the way the engine plays it: a rotation turns the
 * ship for everything after it, a shot or a scan is taken from where the ship
 * is when it comes up, an uncompensated railgun moves the ship a ring on the
 * spot, and the engines go once, for the move or for a compensation. The
 * builder places the actions but does not change what was asked (no
 * autopilot): this is the reason, in advance, for a refusal the agent would
 * otherwise only meet in the preview. Three notes are not refusals: a
 * seizure or an Escort marker after a shot at the same ship, which finds
 * nothing if the shot kills, and a salvage naming no wreck, which finds one
 * only if a shot before it destroys a ship in its sector.
 */
function foreseenRefusals(view: GameView, me: Player, actions: PlayerAction[]): string[] {
  const notes: string[] = [];
  const ship = me.ship;
  const tile = (id: SubsystemId) => ship.subsystems.find((s) => s.id === id);
  const seat = (id: string) => view.players.find((p) => p.id === id);
  const quiet = isQuietTurn(view.turn, me);
  const start: Position = positionOf(ship);
  let position: Position = start;
  let facing = ship.facing;
  let fuel = ship.reactionMass;
  let engines: string | null = null;
  let moved = false;
  // Piracy cards still free, and the ships shot at so far: a seizure after a
  // shot at the same ship finds nothing if the shot destroyed it.
  let cards = freePiracyCards(me.missions, me.cargo).length;
  const shotAt = new Set<string>();
  // Escort markers still in hand and the ships marked so far; one survey and
  // one wreck a turn.
  let markers = unplacedEscorts(me.missions).length;
  const marked = new Set<string>();
  let surveys = 0;
  let salvages = 0;
  const where = () => (moved ? "after the move" : "before the move");
  const useEngines = (what: string) => {
    const sub = tile("engines");
    if (!sub || sub.isBroken) notes.push(`the engines are broken: no ${what}`);
    else if (engines !== null)
      notes.push(`the engines act once a turn: ${engines} and ${what} cannot share it`);
    engines ??= what;
  };
  const spend = (mass: number, what: string) => {
    if (mass > fuel) notes.push(`${what} needs ${mass} fuel and ${fuel} is in the tank by then`);
    fuel = Math.max(0, fuel - mass);
  };

  const tactical = actions
    .filter((a) => a.sequence !== undefined)
    .sort((a, b) => a.sequence! - b.sequence!);
  for (const a of tactical) {
    switch (a.type) {
      case "rotate":
        if (tile("rotation")?.isBroken) notes.push("the thrusters are broken: no rotation");
        facing = a.data.targetFacing;
        break;
      case "coast": {
        moved = true;
        // A berth held since the turn began holds; one the turn put the ship on drifts.
        if (!isMooredMidTurn(view.stations, start, position)) position = driftPosition(position);
        if (a.data.activateScoop) {
          if (tile("scoop")?.isBroken) notes.push("the fuel scoop is broken: no scooping");
          else
            fuel = Math.min(MAX_REACTION_MASS, fuel + ringVelocity(position.wellId, position.ring));
        }
        break;
      }
      case "burn": {
        moved = true;
        const what = `a ${a.data.burnIntensity} burn`;
        const cost = BURN_COSTS[a.data.burnIntensity];
        useEngines(what);
        spend(calculateBurnMassCost(cost.mass, a.data.sectorAdjustment), what);
        const drifted = driftPosition(position);
        const ring = ringAfter({ ...drifted, facing }, cost.rings);
        if (ring === null)
          notes.push(
            `${what} ${facing === "prograde" ? "outward" : "inward"} from ring ${drifted.ring} would leave the rings`
          );
        position = {
          ...drifted,
          ring: ring ?? drifted.ring,
          sector: wrapSector(drifted.sector + a.data.sectorAdjustment),
        };
        break;
      }
      case "well_transfer": {
        moved = true;
        useEngines("a jump");
        if (facing !== "prograde") notes.push("a jump needs prograde facing when it is made");
        const lane = findJump(position, a.data.destinationWellId);
        const landing = lane && phasedJumpDestination(lane, a.data.sectorAdjustment);
        if (!lane) notes.push(`no lane to ${a.data.destinationWellId} from where the jump is made`);
        else if (!landing) notes.push("the jump's phasing lands outside the arrival arc");
        spend(
          calculateJumpMassCost(a.data.sectorAdjustment, hasWorkingCompressor(ship)),
          "the jump"
        );
        if (landing) position = landing;
        break;
      }
      case "fire_weapon": {
        const weapon = tile(a.data.subsystemId);
        if (!weapon) break;
        shotAt.add(a.data.targetPlayerId);
        const target = seat(a.data.targetPlayerId);
        const shot = `${weapon.id}'s shot at ${a.data.targetPlayerId}`;
        if (quiet) notes.push(`${shot}: no weapon fires on a first round`);
        else if (weapon.isBroken) notes.push(`${shot}: ${weapon.id} is broken`);
        else if (!canFireFrom(start, position, view.stations))
          notes.push(`${shot}: a moored ship fires at nobody; burn off the berth first`);
        else if (!target?.ship || !canBeTargeted(target, view.stations))
          notes.push(`${shot}: that ship cannot be fired at now`);
        else if (!isInWeaponRange(weapon, { ...position, facing }, positionOf(target.ship)))
          notes.push(`${shot}: out of range from where it fires (${where()}, facing ${facing})`);
        if (getSubsystemConfig(weapon.type).weaponStats?.hasRecoil) {
          if (a.data.compensateRecoil) {
            useEngines(`compensating ${weapon.id}'s recoil`);
            spend(BURN_COSTS.soft.mass, `compensating ${weapon.id}'s recoil`);
          } else {
            const ring = recoilRing({ ...position, facing });
            if (ring === null) notes.push(`${shot}: its recoil would push the ship off the rings`);
            else position = { ...position, ring };
          }
        }
        break;
      }
      case "seize": {
        const what = `the seizure of ${a.data.cargoId} from ${a.data.victimId}`;
        const victim = seat(a.data.victimId);
        if (quiet) notes.push(`${what}: nobody seizes on a first round`);
        else if (cards <= 0) notes.push(`${what}: no Piracy card free to take it by then`);
        else if (!victim?.ship || !isTouchable(victim))
          notes.push(`${what}: that ship cannot be touched now`);
        else if (isMooredMidTurn(view.stations, start, position))
          notes.push(`${what}: a moored ship seizes nothing; burn off the berth first`);
        else if (!samePosition(positionOf(victim.ship), position))
          notes.push(`${what}: not in its sector ${where()}`);
        else if (isMooredAt(view.stations, positionOf(victim.ship)))
          notes.push(`${what}: that ship is moored`);
        else if (!victim.hold.some((i) => i.cargoId === a.data.cargoId))
          notes.push(`${what}: it carries no such item`);
        else if (shotAt.has(a.data.victimId))
          notes.push(`${what}: if a shot before it destroys that ship, it finds nothing`);
        cards--;
        break;
      }
      case "escort_mark": {
        const what = `the Escort marker on ${a.data.carrierId}`;
        const carrier = seat(a.data.carrierId);
        if (markers <= 0) notes.push(`${what}: no Escort marker in hand by then`);
        else if (!carrier?.ship || carrier.ship.isDestroyed || !isTouchable(carrier))
          notes.push(`${what}: that ship cannot be touched now`);
        else if (isMooredMidTurn(view.stations, start, position))
          notes.push(`${what}: a moored ship marks nobody; burn off the berth first`);
        else if (marked.has(a.data.carrierId) || carrier.escortedBy.length > 0)
          notes.push(`${what}: that ship already carries an Escort marker`);
        else if (
          carrier.ship.wellId !== position.wellId ||
          carrier.ship.ring !== position.ring
        )
          notes.push(`${what}: not on your ring ${where()}`);
        else if (isMooredAt(view.stations, positionOf(carrier.ship)))
          notes.push(`${what}: that ship is moored`);
        else if (carrier.hold.length === 0) notes.push(`${what}: that ship carries nothing`);
        else if (shotAt.has(a.data.carrierId))
          notes.push(`${what}: if a shot before it destroys that ship, it is not placed`);
        markers--;
        marked.add(a.data.carrierId);
        break;
      }
      case "survey": {
        if (surveys > 0) notes.push("the survey: one a turn");
        else if (!surveyToTake(me)) notes.push("the survey: no Survey card wants data");
        else if (!onSurveyRing(position))
          notes.push(`the survey: not on Black Hole Ring 1 ${where()}`);
        surveys++;
        break;
      }
      case "salvage": {
        const wreckId = a.data.wreckId;
        const what = wreckId === undefined ? "the salvage" : `the salvage of ${wreckId}`;
        const wreck = view.wrecks.find((w) => w.id === wreckId);
        if (salvages > 0) notes.push(`${what}: one wreck a turn`);
        else if (!salvageToTake(me)) notes.push(`${what}: no Salvage card wants a black box`);
        else if (wreckId === undefined) {
          // Naming none, it takes what is in the sector when it comes: a
          // wreck there now, or the one a kill before it leaves.
          const prey = [...shotAt].filter((id) => {
            const s = seat(id)?.ship;
            return !!s && samePosition(positionOf(s), position);
          });
          if (!view.wrecks.some((w) => samePosition(w, position)))
            notes.push(
              prey.length > 0
                ? `${what}: no wreck in your sector ${where()} yet; it takes one only if a shot before it destroys ${prey.join(" or ")}`
                : `${what}: no wreck in your sector ${where()}, and no shot before it at a ship there; it takes nothing`
            );
        } else if (!wreck) notes.push(`${what}: no such wreck on the board`);
        else if (!samePosition(wreck, position))
          notes.push(`${what}: not in its sector ${where()}`);
        salvages++;
        break;
      }
      case "scan": {
        const target = seat(a.data.targetPlayerId);
        const scan = `the scan of ${a.data.targetPlayerId}`;
        if (quiet) notes.push(`${scan}: nobody scans on a first round`);
        else if (ship.subsystems.find((s) => s.type === "sensor_array")?.isBroken)
          notes.push(`${scan}: the sensor array is broken`);
        else if (!target?.ship || !canBeTargeted(target, view.stations))
          notes.push(`${scan}: that ship cannot be scanned now (back from Home, or moored)`);
        else if (!inScanRange({ ...position, facing }, positionOf(target.ship)))
          notes.push(
            `${scan}: not on your ring ahead of you (${facing}) within ${SCAN_SECTOR_RANGE} sectors, or in your sector (${where()})`
          );
        break;
      }
    }
  }
  return notes;
}
