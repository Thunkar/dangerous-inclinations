/**
 * Missiles.
 *
 * Launch: the missile appears at the firing ship's position. Any ship in the
 * same well can be fired at, however far away: a guided missile has no firing
 * box, and {@link missileCanReach} is how a bot or a preview asks whether this
 * one will actually catch up.
 * At the end of the owner's turn each of their missiles drifts with its ring,
 * except on the turn it was launched (it flies from the sector it was dropped
 * on, whenever in the turn that was), then moves up to `stepsPerMove` steps
 * toward its target (a step is one ring or one sector; rings close first).
 * If it ends on the target's sector it
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
  sectorStepToward,
  wrapSector,
} from "./geometry.ts";
import { resolveAttack } from "./damage.ts";
import { addHeat, isDestroyed, updateSubsystem, useSubsystem } from "./ship.ts";
import { canBeFiredAt, isOnBoard } from "./targeting.ts";

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
 * The launch turn is the one turn a missile does not ride its orbit: it flies
 * from the sector it was dropped on, whether that was before or after its
 * ship moved. From then on it drifts with its ring like everything else.
 */
function rideStart(missile: Position & { movesMade: number }): Position {
  return missile.movesMade === 0 ? positionOf(missile) : driftPosition(positionOf(missile));
}

/**
 * Where a missile will be after its next move, plus the intermediate points
 * (for drawing the path): [position after drift (or the launch sector, on
 * the launch turn), ...each step].
 */
export function projectMissilePath(
  missile: Position & { movesMade: number },
  target: Position
): Position[] {
  const path: Position[] = [];
  const drifted = rideStart(missile);
  path.push(drifted);
  if (missile.wellId !== target.wellId) return path;
  let current = drifted;
  for (let i = 0; i < MISSILE.stepsPerMove && !samePosition(current, target); i++) {
    current = stepToward(current, target, 1);
    path.push(current);
  }
  return path;
}

/**
 * Best case: can a missile launched from `from` land on a target at `target`
 * before it expires, if that target simply coasts?
 *
 * Replays the flight with {@link projectMissilePath}, so the launch turn's
 * missing ride is counted exactly as the engine will replay it. The target is
 * assumed to coast: it is a best case, not a promise, which is all a launcher
 * can know: the target moves after the missile is away.
 */
export function missileCanReach(from: Position, target: Position): boolean {
  if (from.wellId !== target.wellId) return false;
  let missile: Position & { movesMade: number } = { ...from, movesMade: 0 };
  let victim = target;
  for (let move = 0; move < MISSILE.maxMoves; move++) {
    const path = projectMissilePath(missile, victim);
    const end = path[path.length - 1];
    if (samePosition(end, victim)) return true;
    missile = { ...end, movesMade: move + 1 };
    victim = driftPosition(victim);
  }
  return false;
}

interface MissileProcessResult {
  state: GameState;
  events: EventDraft[];
}

/**
 * Move and resolve every missile owned by `ownerId`. Called at the end of the
 * owner's turn, after their actions.
 */
export function processOwnerMissiles(state: GameState, ownerId: string): MissileProcessResult {
  const events: EventDraft[] = [];
  const ownerIndex = state.players.findIndex((p) => p.id === ownerId);
  if (ownerIndex === -1) return { state, events };

  const players = [...state.players];
  const survivors: Missile[] = [];

  for (const missile of state.missiles) {
    if (missile.ownerId !== ownerId) {
      survivors.push(missile);
      continue;
    }
    const targetIndex = players.findIndex((p) => p.id === missile.targetId);
    const target = targetIndex >= 0 ? players[targetIndex] : undefined;
    const at = positionOf(missile);

    if (!target || !isOnBoard(target)) {
      events.push({ type: "missile_expired", missileId: missile.id, ownerId, at });
      continue;
    }

    const targetPos = positionOf(target.ship);
    const start = rideStart(missile);
    const moved = stepToward(start, targetPos, MISSILE.stepsPerMove);

    // A ship that just came back cannot be touched until its returning turn
    // is over (RULES §Destruction and Respawn), and a moored one cannot be
    // fired at (RULES §Stations), so a missile that catches either neither
    // attacks nor is shot down: it stays in the air with one more move behind
    // it and burns out on schedule.
    const untouchable = !canBeFiredAt(target, state.stations);

    if (untouchable || !samePosition(moved, targetPos)) {
      const movesMade = missile.movesMade + 1;
      if (movesMade >= MISSILE.maxMoves) {
        events.push({ type: "missile_expired", missileId: missile.id, ownerId, at: moved });
      } else {
        survivors.push({ ...missile, ...moved, movesMade });
        events.push({
          type: "missile_moved",
          missileId: missile.id,
          ownerId,
          to: moved,
          movesLeft: MISSILE.maxMoves - movesMade,
        });
      }
      continue;
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
        s.rollsThisTurn < interceptsPerRack()
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
      if (rack.rollsThisTurn === 0) targetShip = addHeat(targetShip, INTERCEPT_HEAT);
      targetShip = updateSubsystem(targetShip, rack.id, (r) => ({
        rollsThisTurn: r.rollsThisTurn + 1,
      }));
      const roll = rollD10(state);
      const destroyed = roll >= INTERCEPT_ROLL;
      events.push({
        type: "missile_intercepted",
        missileId: missile.id,
        ownerId,
        targetId: target.id,
        roll,
        destroyed,
      });
      if (destroyed) {
        players[targetIndex] = { ...target, ship: targetShip };
        continue;
      }
      // roll of 1: the rack fired but missed; fall through to the attack
    }

    const owner = players[ownerIndex];
    const roll = rollD10(state);
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
  }

  return { state: { ...state, players, missiles: survivors }, events };
}
