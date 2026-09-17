/**
 * Situation analysis from a GameView.
 *
 * Everything the bot knows about opponents comes from their PlayerView:
 * public ship info plus face-up and scanned tiles. Ammo and fuel of
 * opponents are unknown, but the cubes on every slot are public, so threat
 * assessment counts the weapons that are both known and powered and reads
 * face-down slots through their energy (see {@link suspectedWeapon}).
 */
import type { Player, Position, Station } from "../models/game.ts";
import type { Subsystem, SubsystemType } from "../models/subsystems.ts";
import { getSubsystemConfig, isWeaponType, SHIELD_ENERGY_PER_POINT } from "../models/subsystems.ts";
import type { GameView, PlayerView, SlotView } from "../game/view.ts";
import { positionOf, sectorDistance } from "../game/geometry.ts";
import { getDissipationCapacity, hasWorkingCompressor } from "../game/ship.ts";
import { MAX_REACTION_MASS } from "../models/game.ts";
import { canEngage } from "../game/targeting.ts";
import { isMooredAt } from "../game/stations.ts";
import type {
  BotParameters,
  BotStatus,
  KnownWeapon,
  Opponent,
  SuspectedSlot,
  SuspectedWeapon,
  TacticalSituation,
} from "./types.ts";
import { assessDanger } from "./behaviors/danger.ts";
import { computeGoals, selectCurrentGoal, attachPlanToGoal } from "./behaviors/missions.ts";

/** Known in-range damage that counts as a full (1.0) threat. */
const FULL_THREAT_DAMAGE = 6;
/** The cube count leaves exactly one weapon it can be. */
const CERTAIN = 1;
/** The cube count fits a weapon and a harmless tile equally well. */
const POSSIBLE = 0.5;
/** Weight of a face-down side slot that might be shields, when estimating absorption. */
const SUSPECTED_SHIELD_WEIGHT = 0.5;

/**
 * What a slot can be, read through the cubes sitting on it. Allocation is
 * public and a tile is either off or at least at its minimum, so the cube
 * count narrows the tile down:
 *
 * | Slot    | Cubes | Could be                                | Read as                    |
 * |---------|-------|-----------------------------------------|----------------------------|
 * | forward | 4     | railgun                                 | railgun, certain           |
 * | forward | 2     | sensor array, missiles                  | missiles, maybe            |
 * | side    | 2     | laser, ballistic rack, missiles, shields| missiles, maybe            |
 * | side    | 1,3,4 | shields                                 | harmless (see shields)     |
 * | either  | 0     | anything, but it cannot fire this turn  | harmless                   |
 *
 * Where several weapons share a cube count the widest envelope wins
 * (missiles: a turret reaching ±2 rings and ±3 sectors), so the bot
 * assumes the worst about where it can be hit from, and `confidence`
 * discounts that assumption when a harmless tile fits the cubes too.
 *
 * This is the only place slot energy is turned into an opinion; threat
 * assessment, critical-hit targeting and scan choice all read it from here.
 */
export function suspectedWeapon(
  slot: Pick<SlotView, "group" | "allocatedEnergy">
): SuspectedWeapon | null {
  const weapon = (type: SubsystemType, confidence: number): SuspectedWeapon => ({
    type,
    damage: getSubsystemConfig(type).weaponStats?.damage ?? 0,
    confidence,
  });
  if (slot.allocatedEnergy === 0) return null;
  if (slot.group === "forward") {
    if (slot.allocatedEnergy >= getSubsystemConfig("railgun").minEnergy) {
      return weapon("railgun", CERTAIN);
    }
    // Two cubes forward is a sensor array or a missile launcher.
    return slot.allocatedEnergy === getSubsystemConfig("missiles").minEnergy
      ? weapon("missiles", POSSIBLE)
      : null;
  }
  // Two cubes on a side slot is a laser, a rack, missiles — or shields.
  return slot.allocatedEnergy === getSubsystemConfig("missiles").minEnergy
    ? weapon("missiles", POSSIBLE)
    : null;
}

/**
 * Damage the opponent's shields will soak out of one turn's volley. A
 * shield cube absorbs one damage and is then spent, so a tile with N cubes
 * is worth N for the whole sequence.
 *
 * Face-down side slots holding 1-4 cubes that have never fired (firing
 * would have flipped them face-up) may be shields; they count at
 * {@link SUSPECTED_SHIELD_WEIGHT} so the bot neither ignores them nor
 * treats a guess as a fact.
 */
export function shieldAbsorption(slots: ReadonlyArray<SlotView>): number {
  const maxCubes = getSubsystemConfig("shields").maxEnergy;
  let absorbed = 0;
  for (const slot of slots) {
    if (slot.type === "shields") {
      if (slot.isBroken !== true)
        absorbed += Math.floor(Math.min(slot.allocatedEnergy, maxCubes) / SHIELD_ENERGY_PER_POINT);
      continue;
    }
    if (slot.type !== null || slot.group !== "side") continue;
    if (slot.allocatedEnergy < 1 || slot.allocatedEnergy > maxCubes) continue;
    absorbed += (slot.allocatedEnergy / SHIELD_ENERGY_PER_POINT) * SUSPECTED_SHIELD_WEIGHT;
  }
  return absorbed;
}

/** A weapon tile is only dangerous while it holds at least its minimum energy. */
function isSlotPowered(slot: SlotView, type: SubsystemType): boolean {
  return slot.allocatedEnergy >= getSubsystemConfig(type).minEnergy;
}

/**
 * A Subsystem-shaped view of an opponent's slot, good enough for range
 * checks (which only read type, slotGroup and slotIndex).
 */
export function slotAsSubsystem(slot: SlotView, type: SubsystemType = slot.type!): Subsystem {
  return {
    id: slot.id,
    type,
    allocatedEnergy: 0,
    isPowered: false,
    usedThisTurn: false,
    isBroken: slot.isBroken ?? false,
    isRevealed: true,
    slotGroup: slot.group,
    slotIndex: slot.index,
  };
}

export function analyzeStatus(me: Player, stations: Station[] = []): BotStatus {
  const ship = me.ship;
  const find = (id: string) => ship.subsystems.find((s) => s.id === id)!;
  const dissipation = getDissipationCapacity(ship.subsystems);
  return {
    hull: ship.hitPoints,
    maxHull: ship.maxHitPoints,
    heat: ship.heat.currentHeat,
    dissipation,
    heatBudget: Math.max(0, dissipation - ship.heat.currentHeat),
    availableEnergy: ship.reactor.availableEnergy,
    reactionMass: ship.reactionMass,
    maxReactionMass: MAX_REACTION_MASS,
    position: positionOf(ship),
    facing: ship.facing,
    moored: isMooredAt(stations, positionOf(ship)),
    engines: find("engines"),
    rotation: find("rotation"),
    scoop: find("scoop"),
    weapons: ship.subsystems.filter((s) => isWeaponType(s.type)),
    sensors: ship.subsystems.filter((s) => s.type === "sensor_array"),
    shields: ship.subsystems.filter((s) => s.type === "shields"),
    racks: ship.subsystems.filter((s) => s.type === "ballistic_rack"),
    brokenSubsystems: ship.subsystems.filter((s) => s.isBroken),
    hasCompressor: hasWorkingCompressor(ship),
  };
}

function analyzeOpponent(player: PlayerView, myPosition: Position, stations: Station[]): Opponent {
  const ship = player.ship!;
  const position: Position = { wellId: ship.wellId, ring: ship.ring, sector: ship.sector };
  const sameWell = position.wellId === myPosition.wellId;
  const ringDistance = sameWell ? Math.abs(position.ring - myPosition.ring) : Infinity;
  const sectorDist = sameWell ? sectorDistance(position.sector, myPosition.sector) : Infinity;

  const attacker = { ...position, facing: ship.facing };
  const knownWeapons: KnownWeapon[] = [];
  const unknownSlots: SuspectedSlot[] = [];
  let threatInRange = 0;
  for (const slot of player.slots) {
    if (slot.type === null) {
      // Face-down: the cubes are the only evidence.
      const suspected = sameWell ? suspectedWeapon(slot) : null;
      // canEngage, not the bare range rule: a missile may be launched at
      // anyone in the well, so a launcher only threatens me from somewhere its
      // missile could actually run me down.
      const inRange =
        suspected !== null &&
        canEngage(slotAsSubsystem(slot, suspected.type), attacker, myPosition);
      unknownSlots.push({ slot, suspected, inRange });
      if (inRange && suspected) threatInRange += suspected.damage * suspected.confidence;
      continue;
    }
    if (!isWeaponType(slot.type)) continue;
    // Face-up: we know what it is, and whether it has the cubes to fire.
    const weapon = slotAsSubsystem(slot);
    const isPowered = isSlotPowered(slot, slot.type);
    const inRange =
      !weapon.isBroken && isPowered && sameWell && canEngage(weapon, attacker, myPosition);
    knownWeapons.push({
      slotId: slot.id,
      type: slot.type,
      isBroken: weapon.isBroken,
      isPowered,
      inRange,
    });
    if (inRange) threatInRange += getSubsystemConfig(slot.type).weaponStats?.damage ?? 0;
  }

  return {
    player,
    position,
    facing: ship.facing,
    hull: ship.hitPoints,
    maxHull: ship.maxHitPoints,
    sameWell,
    ringDistance,
    sectorDistance: sectorDist,
    knownWeapons,
    unknownSlots,
    shieldAbsorption: shieldAbsorption(player.slots),
    threat: Math.min(1, threatInRange / FULL_THREAT_DAMAGE),
    danger: assessDanger(player, position, stations),
  };
}

export function analyzeSituation(view: GameView, parameters: BotParameters): TacticalSituation {
  const me = view.me;
  if (!me) throw new Error("Cannot analyze a spectator view");
  const status = analyzeStatus(me, view.stations);

  const opponents = view.players
    .filter((p) => !p.isMe && p.hasDeployed && p.ship && !p.ship.isDestroyed)
    .map((p) => analyzeOpponent(p, status.position, view.stations));

  // The bot reads its own position in the race with exactly the formula it
  // uses on everyone else, so "am I ahead of them?" is one comparison.
  const mine = view.players.find((p) => p.isMe);
  const myDanger = assessDanger(
    mine ?? { cargoAboard: { crates: 0, data: 0 }, completedMissionCount: 0 },
    status.position,
    view.stations
  );

  const threats = opponents
    .filter((o) => o.sameWell && o.threat > 0)
    .sort(
      (a, b) =>
        b.threat - a.threat ||
        a.ringDistance + a.sectorDistance - (b.ringDistance + b.sectorDistance)
    );

  const incomingMissiles = view.missiles.filter(
    (m) => m.targetId === me.id && m.wellId === status.position.wellId
  ).length;

  const goals = computeGoals(view, me, status, opponents, myDanger, parameters);
  const chosen = selectCurrentGoal(goals);
  const currentGoal = chosen ? attachPlanToGoal(chosen, me, view, opponents, status) : null;

  return {
    view,
    me,
    ship: me.ship,
    status,
    myDanger,
    opponents,
    threats,
    incomingMissiles,
    goals,
    currentGoal,
  };
}
