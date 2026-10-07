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
import { LOAD_CRATES, SELL_FUEL, SELL_NOTHING } from "../models/missions.ts";
import { getSubsystemConfig, isPowerableType } from "../models/subsystems.ts";
import { BURN_COSTS, calculateBurnMassCost, calculateJumpMassCost } from "../models/rings.ts";
import type { GameView } from "../game/view.ts";
import { powerActions, type EnergyTargets } from "../ai/behaviors/survival.ts";
import { canBeFiredAt, canBeScanned, canFireFrom, isInWeaponRange } from "../game/targeting.ts";
import { inScanRange } from "../game/scan.ts";
import { hasWorkingCompressor } from "../game/ship.ts";
import { projectPosition, recoilRing, ringAfter, type MovementPreview } from "../game/movement.ts";
import { driftPosition, positionOf, ringVelocity, wrapSector } from "../game/geometry.ts";
import { isMooredMidTurn } from "../game/stations.ts";
import { unplacedEscorts } from "../game/escort.ts";
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
  rotate?: boolean;
  move?:
    | { kind: "coast"; scoop?: boolean }
    | { kind: "burn"; intensity: BurnIntensity; adjustment?: number; facing?: Facing }
    | { kind: "jump"; destinationWellId: string; adjustment?: number };
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
   * settled against where the turn ends; a ship that does not qualify then
   * (not on your ring, carrying nothing, either of you moored) takes no
   * marker and costs nothing.
   */
  escort?: string[];
  /**
   * Items to seize, one per free Piracy card, each a different item. A "you
   * may": nothing is taken unless named here. Settled where the turn ends; an
   * item not there then is passed over.
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

  let facing: Facing = ship.facing;
  let rotate = intent.rotate === true;
  const move = intent.move ?? { kind: "coast" as const };
  // The rotation comes before the move, so the facing a move needs decides it:
  // a burn's own facing when it names one, prograde for a jump.
  const moveFacing: Facing | undefined =
    move.kind === "burn" ? move.facing : move.kind === "jump" ? "prograde" : undefined;
  if (moveFacing !== undefined && rotate !== (moveFacing !== ship.facing)) {
    if (rotate)
      notes.push(
        `the ${move.kind} needs ${moveFacing} facing, which the ship already has; rotation dropped`
      );
    rotate = moveFacing !== ship.facing;
  }
  if (rotate) {
    facing = ship.facing === "prograde" ? "retrograde" : "prograde";
  }
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
  const post = projectPosition(ship, facing, preview);
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
  // from where the ship starts, otherwise right after the move.
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

  if (rotate)
    actions.push({
      type: "rotate",
      playerId: me.id,
      sequence: seq(),
      data: { targetFacing: facing },
    });
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
  if (!scanBefore) actions.push(...scanAction());
  for (const f of shots.filter((s) => s.when !== "before")) actions.push(fireAction(f));
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
  if (intent.escort !== undefined) {
    const inHand = unplacedEscorts(me.missions).length;
    const named = new Set<string>();
    for (const carrierId of intent.escort) {
      if (carrierId === me.id) notes.push("an Escort marker goes on a rival, not you; dropped");
      else if (!view.players.some((p) => p.id === carrierId))
        notes.push(`no player ${String(carrierId)} to escort; dropped`);
      else if (named.has(carrierId)) notes.push(`${carrierId} named twice for Escort; once kept`);
      else if (named.size >= inHand)
        notes.push(`only ${inHand} Escort marker(s) in hand; ${carrierId} dropped`);
      else {
        named.add(carrierId);
        actions.push({ type: "escort_mark", playerId: me.id, data: { carrierId } });
      }
    }
  }
  if (intent.seize !== undefined) {
    const named = new Set<string>();
    for (const { victim, cargoId } of intent.seize) {
      const key = `${victim}/${cargoId}`;
      if (victim === me.id) notes.push("a seizure is made from a rival, not you; dropped");
      else if (!view.players.some((p) => p.id === victim))
        notes.push(`no player ${String(victim)} to seize from; dropped`);
      else if (named.has(key)) notes.push(`${cargoId} named twice for a seizure; once kept`);
      else {
        named.add(key);
        actions.push({ type: "seize", playerId: me.id, data: { victimId: victim, cargoId } });
      }
    }
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
 * otherwise only meet in the preview.
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
        const target = seat(a.data.targetPlayerId);
        const shot = `${weapon.id}'s shot at ${a.data.targetPlayerId}`;
        if (quiet) notes.push(`${shot}: no weapon fires on a first round`);
        else if (weapon.isBroken) notes.push(`${shot}: ${weapon.id} is broken`);
        else if (!canFireFrom(start, position, view.stations))
          notes.push(`${shot}: a moored ship fires at nobody; burn off the berth first`);
        else if (!target?.ship || !canBeFiredAt(target, view.stations))
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
      case "scan": {
        const target = seat(a.data.targetPlayerId);
        const scan = `the scan of ${a.data.targetPlayerId}`;
        if (quiet) notes.push(`${scan}: nobody scans on a first round`);
        else if (ship.subsystems.find((s) => s.type === "sensor_array")?.isBroken)
          notes.push(`${scan}: the sensor array is broken`);
        else if (!target?.ship || !canBeScanned(target))
          notes.push(`${scan}: that ship cannot be scanned now`);
        else if (!inScanRange(position, positionOf(target.ship)))
          notes.push(`${scan}: not on the ship's ring within range (${where()})`);
        break;
      }
    }
  }
  return notes;
}
