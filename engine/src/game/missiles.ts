/**
 * Missiles.
 *
 * Launch: the missile appears at the firing ship's position. Any ship in the
 * same well can be fired at, however far away: a guided missile has no firing
 * box, and {@link missileCanReach} is how a bot or a preview asks whether this
 * one will actually catch up.
 * A missile flies the moment it is launched, at the launch's place in its
 * owner's turn, from the sector it was dropped on ({@link flyLaunchedMissiles}),
 * so whatever the turn does after the launch meets its result. At the end of
 * each of the owner's later turns it flies and rides its ring, in the order
 * its owner chooses ({@link planMissileMove}, {@link processOwnerMissiles}).
 * A flight is up to `stepsPerMove` steps toward the target (a step is one
 * ring or one sector; rings close first). If the flight ends on the target's
 * sector, before the ride or after it, it
 * attacks: a powered ballistic rack rolls against it and destroys it on a 2+,
 * otherwise it rolls to hit like any weapon. A rack rolls at up to
 * `interceptsPerRack()` missiles a turn (one missiles subsystem's magazine),
 * so a ship expecting more carries a second rack. Answering a turn's missiles
 * is INTERCEPT_HEAT on the defender's track, however many the rack rolls at,
 * as a shield's absorbed points are: the salvo's energy goes somewhere. A
 * missile that has moved
 * `maxMoves` times without hitting is removed. A missile that catches a ship
 * still recovering from a respawn, or one moored at a station (RULES
 * §Stations), does neither: it slides past untouchable prey and stays in
 * flight, and no rack rolls at it. Missiles never cross gravity wells.
 */
import type { GameState, Missile, Player, Position } from "../models/game.ts";
import type { SubsystemId } from "../models/subsystems.ts";
import { getMissileStats, interceptsPerRack, isPowered } from "../models/subsystems.ts";
import type { EventDraft } from "../models/events.ts";
import { rollD10, nextEntityId } from "../utils/rng.ts";
import {
  driftPosition,
  positionOf,
  samePosition,
  sectorDistance,
  sectorStepToward,
  wrapSector,
} from "./geometry.ts";
import { resolveAttack } from "./damage.ts";
import { addHeat, isDestroyed, isOnBoard, updateSubsystem, useSubsystem } from "./ship.ts";
import { canBeTargeted } from "./targeting.ts";

const MISSILE = getMissileStats();

/** A ballistic rack with energy on it destroys a missile on this d10 roll or better. */
export const INTERCEPT_ROLL = 2;

/**
 * Heat on the defender's track for each rack that answers missiles in a
 * player-turn, however many it rolls at. Measured 7 Oct 2026 against a
 * rack that rolled for free and against heat per missile shot down (2 or 1
 * a missile): per missile taxes the defence by the size of the salvo, which
 * is the attacker's choice, and pushed the sensor bow with three launchers
 * over its bar; a flat charge per turn moved the least.
 */
export const INTERCEPT_HEAT = 2;

export function createMissile(
  state: GameState,
  owner: Player,
  targetId: string,
  criticalTarget: SubsystemId
): Missile {
  return {
    id: nextEntityId(state, `missile-${owner.id}`),
    ownerId: owner.id,
    targetId,
    ...positionOf(owner.ship),
    movesMade: 0,
    criticalTarget,
  };
}

/** Move up to `steps` toward `target`: rings first, then sectors. Same well only. */
export function stepToward(from: Position, target: Position, steps: number): Position {
  if (from.wellId !== target.wellId) return from;
  let { ring, sector } = from;
  let left = steps;
  while (left > 0 && ring !== target.ring) {
    ring += target.ring > ring ? 1 : -1;
    left--;
  }
  while (left > 0 && wrapSector(sector) !== wrapSector(target.sector)) {
    sector = wrapSector(sector + sectorStepToward(sector, target.sector));
    left--;
  }
  return { wellId: from.wellId, ring, sector };
}

/**
 * The two orders a missile's move may take. A ride-first move drifts with the
 * ring, then flies; a fly-first move flies, attacks if the flight ended on the
 * target, and only then drifts. The launch flight has no ride at all: it is
 * flown the moment the missile is launched, from the sector it was dropped on.
 */
export type MissileOrder = "ride_first" | "fly_first";

/** One move of a missile in one order: the path to draw, where it ends, whether it attacks. */
export interface MissileMove {
  order: MissileOrder;
  /** Every point it passes, the first its start (after the ride, if it rides first). */
  path: Position[];
  /** Where the missile is when the move is over. */
  end: Position;
  /** The flight ended on the target's sector: the missile attacks there. */
  hits: boolean;
}

function flightFrom(from: Position, target: Position): Position[] {
  const path: Position[] = [from];
  if (from.wellId !== target.wellId) return path;
  let current = from;
  for (let i = 0; i < MISSILE.stepsPerMove && !samePosition(current, target); i++) {
    current = stepToward(current, target, 1);
    path.push(current);
  }
  return path;
}

function moveIn(
  missile: Position & { movesMade: number },
  target: Position,
  order: MissileOrder
): MissileMove {
  const start = positionOf(missile);
  if (missile.movesMade === 0 || order === "ride_first") {
    const path = flightFrom(missile.movesMade === 0 ? start : driftPosition(start), target);
    const end = path[path.length - 1];
    return { order: "ride_first", path, end, hits: samePosition(end, target) };
  }
  const path = flightFrom(start, target);
  const landed = path[path.length - 1];
  if (samePosition(landed, target)) return { order, path, end: landed, hits: true };
  const end = driftPosition(landed);
  return { order, path: [...path, end], end, hits: false };
}

/** The orders a missile may choose between this move: none on the launch flight. */
const ordersFor = (missile: { movesMade: number }): MissileOrder[] =>
  missile.movesMade === 0 ? ["ride_first"] : ["ride_first", "fly_first"];

/** Steps between two points of one well: the ring gap and the sectors round. */
const stepsBetween = (a: Position, b: Position) =>
  Math.abs(a.ring - b.ring) + sectorDistance(a.sector, b.sector);

/**
 * The move a missile makes, in the order its owner would choose: one that
 * attacks if either does, and otherwise the one that leaves it nearest the
 * target as that target coasts to its next turn, reached either way round
 * next time. Ties go to riding first. RULES §Weapons -> Missiles leaves the
 * order to the player; the engine chooses for every player, bots and people
 * alike, the order that serves them.
 */
export function planMissileMove(
  missile: Position & { movesMade: number },
  target: Position
): MissileMove {
  const moves = ordersFor(missile).map((order) => moveIn(missile, target, order));
  const hit = moves.find((m) => m.hits);
  if (hit) return hit;
  const coasted = driftPosition(target);
  const reach = (p: Position) =>
    Math.min(stepsBetween(p, coasted), stepsBetween(driftPosition(p), coasted));
  return moves.reduce((best, m) => (reach(m.end) < reach(best.end) ? m : best));
}

/**
 * Where a missile will be after its next move, plus the intermediate points
 * (for drawing the path), in the order {@link planMissileMove} chooses.
 */
export function projectMissilePath(
  missile: Position & { movesMade: number },
  target: Position
): Position[] {
  return planMissileMove(missile, target).path;
}

/**
 * Best case: can a missile launched from `from` land on a target at `target`
 * before it expires, if that target simply coasts?
 *
 * Tries every order the missile may fly each move in, and the launch
 * flight's missing ride, as the engine will replay them. The target is
 * assumed to coast: it is a best case, not a promise, which is all a launcher
 * can know: the target moves after the missile is away.
 */
export function missileCanReach(from: Position, target: Position): boolean {
  if (from.wellId !== target.wellId) return false;
  const reaches = (missile: Position & { movesMade: number }, victim: Position): boolean => {
    if (missile.movesMade >= MISSILE.maxMoves) return false;
    return ordersFor(missile).some((order) => {
      const move = moveIn(missile, victim, order);
      return (
        move.hits ||
        reaches({ ...move.end, movesMade: missile.movesMade + 1 }, driftPosition(victim))
      );
    });
  };
  return reaches({ ...from, movesMade: 0 }, target);
}

/**
 * Does a missile launched from `from` land on a ship at `target` on its
 * launch flight, so its attack resolves before the actions sequenced after
 * the launch? The target cannot move in between: it is the launcher's turn.
 */
export function landsOnLaunch(from: Position, target: Position): boolean {
  return moveIn({ ...from, movesMade: 0 }, target, "ride_first").hits;
}

interface MissileProcessResult {
  state: GameState;
  events: EventDraft[];
}

/**
 * The launch flight: every missile of a salvo just launched flies at once,
 * at the launch's place in the turn, from the sector it was dropped on (no
 * ride, since `movesMade` is still 0), and attacks then if it ends on its
 * target. That is one of its moves. A missile still in the air stays where
 * the flight left it, marked `launchedThisTurn`, so the end of the turn does
 * not move it again, and whatever its ship does next (a move, a recoil)
 * leaves it where it is. `launched` are new tokens not yet on the board.
 */
export function flyLaunchedMissiles(state: GameState, launched: Missile[]): MissileProcessResult {
  const events: EventDraft[] = [];
  const flown: Missile[] = [];
  let next = state;
  for (const missile of launched) {
    const flight = flyMissile(next, missile);
    next = flight.state;
    events.push(...flight.events);
    if (flight.survivor) flown.push({ ...flight.survivor, launchedThisTurn: true });
  }
  return { state: { ...next, missiles: [...next.missiles, ...flown] }, events };
}

/**
 * Move and resolve every missile owned by `ownerId` that was launched on an
 * earlier turn. Called at the end of the owner's turn, after their actions:
 * a missile launched this turn has flown already and only loses its mark.
 */
export function processOwnerMissiles(state: GameState, ownerId: string): MissileProcessResult {
  const events: EventDraft[] = [];
  if (!state.players.some((p) => p.id === ownerId)) return { state, events };

  const survivors: Missile[] = [];
  let next = state;
  for (const missile of state.missiles) {
    if (missile.ownerId !== ownerId) {
      survivors.push(missile);
      continue;
    }
    if (missile.launchedThisTurn) {
      const { launchedThisTurn: _flown, ...inFlight } = missile;
      survivors.push(inFlight);
      continue;
    }
    const flight = flyMissile(next, missile);
    next = flight.state;
    events.push(...flight.events);
    if (flight.survivor) survivors.push(flight.survivor);
  }

  return { state: { ...next, missiles: survivors }, events };
}

interface Flight extends MissileProcessResult {
  /** The missile still in the air after its move, or null once it is spent. */
  survivor: Missile | null;
}

/**
 * One move of one missile, the same at launch and at the end of a turn: ride
 * the orbit (not on the launch flight), fly up to `stepsPerMove` steps, and
 * attack if it ends on the target's sector. `state.missiles` is left alone:
 * the caller keeps the list. The attack reads the owner's ship as it stands
 * now, so the critical range is the sensor's at this moment.
 */
function flyMissile(state: GameState, missile: Missile): Flight {
  const events: EventDraft[] = [];
  const ownerId = missile.ownerId;
  const players = [...state.players];
  const targetIndex = players.findIndex((p) => p.id === missile.targetId);
  const target = targetIndex >= 0 ? players[targetIndex] : undefined;
  const at = positionOf(missile);

  if (!target || !isOnBoard(target)) {
    events.push({ type: "missile_expired", missileId: missile.id, ownerId, at });
    return { state, events, survivor: null };
  }

  // Rolls advance the copy's RNG, never the caller's state.
  const next: GameState = { ...state };
  const targetPos = positionOf(target.ship);

  // A ship that just came back cannot be touched until its returning turn
  // is over (RULES §Destruction and Respawn), and a moored one cannot be
  // fired at (RULES §Stations), so a missile that catches either neither
  // attacks nor is shot down: it stays in the air with one more move behind
  // it and burns out on schedule.
  const untouchable = !canBeTargeted(target, state.stations);
  // Prey nobody may touch is not worth stopping for: the missile rides first,
  // as it always did, and flies past.
  const move = untouchable
    ? moveIn(missile, targetPos, "ride_first")
    : planMissileMove(missile, targetPos);
  const moved = move.end;

  if (untouchable || !move.hits) {
    const movesMade = missile.movesMade + 1;
    if (movesMade >= MISSILE.maxMoves) {
      events.push({ type: "missile_expired", missileId: missile.id, ownerId, at: moved });
      return { state, events, survivor: null };
    }
    events.push({
      type: "missile_moved",
      missileId: missile.id,
      ownerId,
      to: moved,
      movesLeft: MISSILE.maxMoves - movesMade,
    });
    return { state, events, survivor: { ...missile, ...moved, movesMade } };
  }

  // On target. Point defence first: a rack that is up (powered, or fired, on
  // its owner's last turn) rolls at the missiles reaching its ship until its
  // cubes are spoken for, which is as many as those cubes could have thrown
  // (`interceptsPerRack`). A ship expecting more than that carries a second
  // rack and powers both.
  //
  // The racks are read off the target as it stands now, because an earlier
  // missile of the same salvo may already have broken one or heated the ship.
  let targetShip = target.ship;
  const rack = targetShip.subsystems.find(
    (s) =>
      s.type === "ballistic_rack" &&
      isPowered(s) &&
      !s.isBroken &&
      s.spentThisTurn < interceptsPerRack()
  );
  if (rack) {
    // The first roll of a player-turn uses the rack and flips it face-up,
    // and is the turn's INTERCEPT_HEAT on its owner's track: one salvo or
    // several, one missile or four, answering them costs the same.
    if (!rack.usedThisTurn) {
      const used = useSubsystem(targetShip, target.id, rack.id, "intercepted");
      targetShip = used.ship;
      events.push(...used.events);
    }
    const heat = rack.spentThisTurn === 0 ? INTERCEPT_HEAT : 0;
    targetShip = addHeat(targetShip, heat);
    targetShip = updateSubsystem(targetShip, rack.id, (r) => ({
      spentThisTurn: r.spentThisTurn + 1,
    }));
    const roll = rollD10(next);
    const destroyed = roll >= INTERCEPT_ROLL;
    events.push({
      type: "missile_intercepted",
      missileId: missile.id,
      ownerId,
      targetId: target.id,
      roll,
      destroyed,
      rackId: rack.id,
      heat,
    });
    if (destroyed) {
      players[targetIndex] = { ...target, ship: targetShip };
      return { state: { ...next, players }, events, survivor: null };
    }
    // roll of 1: the rack fired but missed; fall through to the attack
  }

  const owner = players.find((p) => p.id === ownerId)!;
  const roll = rollD10(next);
  const outcome = resolveAttack(
    targetShip,
    target.id,
    MISSILE.damage,
    missile.criticalTarget,
    roll,
    owner.ship,
    ownerId
  );
  players[targetIndex] = { ...target, ship: outcome.ship };
  events.push({
    type: "attack_resolved",
    attackerId: ownerId,
    targetId: target.id,
    weaponType: "missiles",
    missileId: missile.id,
    roll,
    result: outcome.hitResult.result,
    damage: outcome.hitResult.damage,
    toHull: outcome.hitResult.damageToHull,
    absorbed: outcome.hitResult.absorbed,
    targetHullAfter: outcome.ship.hitPoints,
  });
  events.push(...outcome.events);
  if (isDestroyed(outcome.ship) && !isDestroyed(target.ship)) {
    events.push({
      type: "ship_destroyed",
      victimId: target.id,
      killerId: ownerId,
      cause: "missile",
    });
  }
  return { state: { ...next, players }, events, survivor: null };
}
