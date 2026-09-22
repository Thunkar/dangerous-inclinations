/**
 * From what an agent wants to do to the actions the engine accepts. Cubes for
 * a burn, a rotation or a shot are not the agent's business at all: the engine
 * powers a tile from the action that uses it. What the builder does carry is
 * `power` and `unpower`, the standing tiles the agent wants up while it is not
 * acting, and the order a turn is played in.
 */
import type { BurnIntensity, Facing, GravityWellId, Player, PlayerAction } from "../models/game.ts";
import type { SubsystemId } from "../models/subsystems.ts";
import { getSubsystemConfig, isStandingType } from "../models/subsystems.ts";
import type { GameView } from "../game/view.ts";
import { standingActions, type EnergyTargets } from "../ai/behaviors/survival.ts";
import { isInWeaponRange } from "../game/targeting.ts";
import { projectPosition, type MovementPreview } from "../game/movement.ts";
import { isMooredAt } from "../game/stations.ts";
import { getJumpOptions, phasedJumpDestination } from "../models/gravityWells.ts";

export interface FireIntent {
  weapon: SubsystemId;
  target: string;
  /** Slot to break on a critical; defaults to the engines. */
  critical?: SubsystemId;
  compensateRecoil?: boolean;
  /**
   * Missiles only: how many rounds go up in this one launch. A salvo of any
   * size is one use of the tile: no extra cubes and no extra heat, so the
   * magazine is what limits it.
   */
  count?: number;
  /**
   * Fire before or after the move. Default: a railgun after the move (its
   * recoil would derail a burn), anything else before the move if the target
   * is in range from where the ship stands, otherwise after.
   */
  when?: "before" | "after";
}

export interface TurnIntent {
  /**
   * Cubes wanted on standing tiles (shields, a ballistic rack, a sensor
   * array); ones not named keep what they hold. Nothing else takes cubes here:
   * the engines, the thrusters, the scoop and every weapon are powered by the
   * action that uses them.
   */
  power?: Partial<Record<SubsystemId, number>>;
  /** Standing tiles to switch off (take every cube back). */
  unpower?: SubsystemId[];
  rotate?: boolean;
  move?:
    | { kind: "coast"; scoop?: boolean }
    | { kind: "burn"; intensity: BurnIntensity; adjustment?: number; facing?: Facing }
    | { kind: "jump"; destinationWellId: string; adjustment?: number };
  fire?: FireIntent[];
  scan?: { target: string; slot?: SubsystemId };
  /**
   * A broken tile to repair at the heat check. It only lands if the turn makes
   * no heat at all: no move but a coast without the scoop, no shot, no scan,
   * and no shields powered.
   */
  repair?: SubsystemId;
}

export interface BuiltTurn {
  actions: PlayerAction[];
  /** What the builder filled in or changed, for the agent's log. */
  notes: string[];
}

/** Turn an intent into the engine's actions for `view.me`. Pure; validate with a preview before submitting. */
export function buildTurn(view: GameView, intent: TurnIntent): BuiltTurn {
  const me = view.me;
  if (!me) throw new Error("A spectator cannot act");
  const ship = me.ship;
  const notes: string[] = [];
  const find = (id: SubsystemId) => ship.subsystems.find((s) => s.id === id);

  // Standing tiles only: what is up now, then what the intent asks for. A
  // tile an action powers is not named here and never needs to be.
  const targets: EnergyTargets = new Map();
  for (const st of ship.subsystems) {
    if (isStandingType(st.type)) targets.set(st.id, st.allocatedEnergy);
  }
  const notStanding = (id: SubsystemId) => {
    notes.push(`${id} is powered by the action that uses it; it takes no cubes here`);
  };
  for (const id of intent.unpower ?? []) {
    const sub = find(id);
    if (sub && !isStandingType(sub.type)) notStanding(id);
    else targets.set(id, 0);
  }
  for (const [id, cubes] of Object.entries(intent.power ?? {}) as Array<[SubsystemId, number]>) {
    const sub = find(id);
    if (!sub) {
      notes.push(`no tile ${id} aboard; ignored`);
      continue;
    }
    if (!isStandingType(sub.type)) {
      notStanding(id);
      continue;
    }
    const c = getSubsystemConfig(sub.type);
    const wanted = Math.max(0, Math.min(c.maxEnergy, Math.round(cubes)));
    if (wanted > 0 && wanted < c.minEnergy) {
      notes.push(`${id} needs at least ${c.minEnergy} cubes to work; set to ${c.minEnergy}`);
      targets.set(id, c.minEnergy);
    } else targets.set(id, wanted);
  }

  let facing: Facing = ship.facing;
  let rotate = intent.rotate === true;
  const move = intent.move ?? { kind: "coast" as const };
  if (move.kind === "burn") {
    const wantFacing =
      move.facing ??
      (rotate ? (ship.facing === "prograde" ? "retrograde" : "prograde") : ship.facing);
    if (wantFacing !== ship.facing) rotate = true;
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

  const actions: PlayerAction[] = standingActions(me as Player, targets);
  let sequence = 0;
  const seq = () => ++sequence;

  // Where the ship stands before and after the move, for choosing when a shot fires.
  const pre = { wellId: ship.wellId, ring: ship.ring, sector: ship.sector, facing };
  const jumpOption =
    move.kind === "jump"
      ? getJumpOptions(pre).find((o) => o.destination.wellId === move.destinationWellId)
      : undefined;
  const preview: MovementPreview =
    move.kind === "coast"
      ? { kind: "coast", moored: isMooredAt(view.stations, pre) }
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
    return s ? { wellId: s.wellId, ring: s.ring, sector: s.sector } : null;
  };
  const phaseOf = (f: FireIntent): "before" | "after" => {
    if (f.when) return f.when;
    const weapon = find(f.weapon)!;
    if (weapon.type === "railgun") return "after";
    const at = targetPosition(f.target);
    if (at && isInWeaponRange(weapon, pre, at)) return "before";
    if (at && isInWeaponRange(weapon, post, at)) return "after";
    notes.push(
      `${f.weapon} has no shot at ${f.target} before or after the move; fired before the move anyway`
    );
    return "before";
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

  if (rotate)
    actions.push({
      type: "rotate",
      playerId: me.id,
      sequence: seq(),
      data: { targetFacing: facing },
    });
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
  for (const f of shots.filter((s) => s.when !== "before")) actions.push(fireAction(f));
  if (intent.scan) {
    const sensor = ship.subsystems.find((s) => s.type === "sensor_array");
    const target = view.players.find((p) => p.id === intent.scan!.target);
    const slot =
      intent.scan.slot ??
      target?.slots.find((s) => s.type === null)?.id ??
      target?.slots[0]?.id ??
      "side-0";
    if (!sensor) notes.push("no sensor array aboard; scan dropped");
    else
      actions.push({
        type: "scan",
        playerId: me.id,
        sequence: seq(),
        data: { targetPlayerId: intent.scan.target, peekSlot: slot },
      });
  }
  if (intent.repair !== undefined) {
    const sub = ship.subsystems.find((s) => s.id === intent.repair);
    if (!sub) notes.push(`no subsystem ${intent.repair}; repair dropped`);
    else if (!sub.isBroken) notes.push(`${intent.repair} is not broken; repair dropped`);
    else actions.push({ type: "repair", playerId: me.id, data: { subsystemId: intent.repair } });
  }
  return { actions, notes };
}
