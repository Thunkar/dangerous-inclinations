/**
 * Missiles.
 *
 * Launch: the missile appears at the firing ship's position. Any ship in the
 * same well can be fired at, however far away — a guided missile has no firing
 * box, and {@link missileCanReach} is how a bot or a preview asks whether this
 * one will actually catch up.
 * At the end of the owner's turn each of their missiles drifts with its ring
 * (unless it was launched after the ship had already moved this turn: it rode
 * along, so it starts from where it was dropped), then moves up to
 * `fuelPerTurn` steps toward its target (a step is one ring or one sector;
 * rings close first). If it ends on the target's sector it
 * attacks: a powered ballistic rack rolls against it and destroys it on a 2+,
 * otherwise it rolls to hit like any weapon. The rack rolls at every missile
 * that reaches the ship — a salvo is not stopped by one round of point defence
 * — and each roll costs the rack's cubes in heat. A missile that has moved
 * `maxMoves` times without hitting is removed. Missiles never cross gravity
 * wells.
 */
import type { GameState, Missile, Player, Position } from "../models/game.ts";
import type { SubsystemId } from "../models/subsystems.ts";
import { getMissileStats, getSubsystemConfig } from "../models/subsystems.ts";
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
import { isDestroyed, revealSubsystem, useSubsystem } from "./ship.ts";

const MISSILE = getMissileStats();

export function createMissile(
  state: GameState,
  owner: Player,
  targetId: string,
  criticalTarget: SubsystemId,
  launchedAfterMove: boolean
): Missile {
  return {
    id: nextEntityId(state, `missile-${owner.id}`),
    ownerId: owner.id,
    targetId,
    ...positionOf(owner.ship),
    turnFired: state.turn,
    movesMade: 0,
    criticalTarget,
    launchedAfterMove,
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
 * Where a missile will be after its next move, plus the intermediate points
 * (for drawing the path): [position after drift (or start, if it skips the
 * drift), ...each step].
 */
export function projectMissilePath(
  missile: Position & { launchedAfterMove?: boolean },
  target: Position
): Position[] {
  const path: Position[] = [];
  const drifted = missile.launchedAfterMove ? positionOf(missile) : driftPosition(missile);
  path.push(drifted);
  if (missile.wellId !== target.wellId) return path;
  let current = drifted;
  for (let i = 0; i < MISSILE.fuelPerTurn && !samePosition(current, target); i++) {
    current = stepToward(current, target, 1);
    path.push(current);
  }
  return path;
}

/**
 * Best case: can a missile launched from `from` land on a target at `target`
 * before it expires, if that target simply coasts?
 *
 * Replays the flight with {@link projectMissilePath}, so the launch-after-move
 * exception (a missile launched once the ship has moved rode along and does
 * not drift again that turn) is counted exactly as the engine will replay it.
 * The target is assumed to coast: it is a best case, not a promise, which is
 * all a launcher can know — the target moves after the missile is away.
 */
export function missileCanReach(
  from: Position,
  target: Position,
  launchedAfterMove: boolean
): boolean {
  if (from.wellId !== target.wellId) return false;
  let missile: Position & { launchedAfterMove: boolean } = { ...from, launchedAfterMove };
  let victim = target;
  for (let move = 0; move < MISSILE.maxMoves; move++) {
    const path = projectMissilePath(missile, victim);
    const end = path[path.length - 1];
    if (samePosition(end, victim)) return true;
    missile = { ...end, launchedAfterMove: false };
    victim = driftPosition(victim);
  }
  return false;
}

export interface MissileProcessResult {
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

    if (!target || isDestroyed(target.ship) || !target.hasDeployed) {
      events.push({ type: "missile_expired", missileId: missile.id, ownerId, at });
      continue;
    }

    const targetPos = positionOf(target.ship);
    // A missile launched after the ship moved already rode along with it.
    const start = missile.launchedAfterMove ? at : driftPosition(at);
    const moved = stepToward(start, targetPos, MISSILE.fuelPerTurn);

    if (!samePosition(moved, targetPos)) {
      const movesMade = missile.movesMade + 1;
      if (movesMade >= MISSILE.maxMoves) {
        events.push({ type: "missile_expired", missileId: missile.id, ownerId, at: moved });
      } else {
        survivors.push({ ...missile, ...moved, movesMade, launchedAfterMove: false });
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

    // On target. Point defence first: a powered rack rolls at every missile
    // that reaches its ship, and the whole turn of rolling is one use of the
    // rack — which is what keeps a one-action salvo honest. The rack is read
    // off the target as it stands now, because an earlier missile of the same
    // salvo may already have broken it or heated the ship.
    let targetShip = target.ship;
    const rack = targetShip.subsystems.find(
      (s) => s.type === "ballistic_rack" && s.isPowered && !s.isBroken
    );
    if (rack) {
      // A turn of interceptions is one use of the rack: the first roll of a
      // player-turn costs its cubes and the rest of that turn's rolls are
      // free. `heatPerIntercept: true` is the experiment that charges each one.
      const chargeThisRoll =
        getSubsystemConfig("ballistic_rack").weaponStats?.heatPerIntercept !== false ||
        !rack.usedThisTurn;
      let heat = 0;
      if (chargeThisRoll) {
        const used = useSubsystem(targetShip, target.id, rack.id, "intercepted");
        targetShip = used.ship;
        heat = used.heat;
        events.push(...used.events);
      }
      const roll = rollD10(state);
      const destroyed = roll >= 2;
      events.push({
        type: "missile_intercepted",
        missileId: missile.id,
        ownerId,
        targetId: target.id,
        roll,
        destroyed,
        heat,
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
      roll,
      result: outcome.hitResult.result,
      damage: outcome.hitResult.damage,
      toHull: outcome.hitResult.damageToHull,
      toHeat: outcome.hitResult.damageToHeat,
      targetHullAfter: outcome.ship.hitPoints,
    });
    events.push(...outcome.events);
    if (outcome.hitResult.sensorAssistedCritical) {
      const revealed = revealSensors(players[ownerIndex]);
      players[ownerIndex] = revealed.player;
      events.push(...revealed.events);
    }
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

/** Reveal the attacker's powered sensor arrays after a sensor-assisted critical. */
export function revealSensors(player: Player): { player: Player; events: EventDraft[] } {
  const events: EventDraft[] = [];
  let ship = player.ship;
  for (const sensor of ship.subsystems.filter(
    (s) => s.type === "sensor_array" && s.isPowered && !s.isRevealed
  )) {
    const r = revealSubsystem(ship, player.id, sensor.id, "critical_bonus");
    ship = r.ship;
    events.push(...r.events);
  }
  return { player: { ...player, ship }, events };
}
