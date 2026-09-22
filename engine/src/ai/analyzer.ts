/**
 * Situation analysis from a GameView.
 *
 * Everything the bot knows about opponents comes from their PlayerView:
 * public ship info plus face-up and scanned tiles. Ammo and fuel of opponents
 * are unknown. The cubes on every slot are public and stay on until their
 * owner's next turn. On a face-up tile they are what it did last turn, and a
 * known weapon threatens us while it is unbroken whatever it holds, since the
 * action that fires it powers it. On a face-down slot they can only have come
 * from a `power` action, because using a tile turns it face-up, so they read
 * as one of the three tiles that work on other players' turns (see
 * {@link suspectedWeapon}).
 */
import type { Player, Position, Station } from "../models/game.ts";
import type { Subsystem, SubsystemType } from "../models/subsystems.ts";
import { getSubsystemConfig, isWeaponType, SHIELD_ENERGY_PER_POINT } from "../models/subsystems.ts";
import type { GameView, PlayerView, SlotView } from "../game/view.ts";
import { positionOf, sectorDistance } from "../game/geometry.ts";
import { getDissipationCapacity, hasWorkingCompressor } from "../game/ship.ts";
import { MAX_HEAT, MAX_REACTION_MASS } from "../models/game.ts";
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
/** The cube count fits a weapon and a harmless tile equally well. */
const POSSIBLE = 0.5;
/** Weight of a face-down side slot that might be shields, when estimating absorption. */
const SUSPECTED_SHIELD_WEIGHT = 0.5;

/**
 * Damage a face-up weapon slot could put on us in one action. A missiles tile
 * launches any number of its remaining rounds at one ship in a single action,
 * and the rounds left in a face-up tile are public, so a launcher with four
 * aboard threatens all four at once.
 */
function visibleWeaponDamage(slot: SlotView): number {
  const damage = getSubsystemConfig(slot.type!).weaponStats?.damage ?? 0;
  return slot.type === "missiles" ? damage * Math.max(0, slot.ammo ?? 0) : damage;
}

/**
 * What a slot can be, read through the cubes sitting on it.
 *
 * Using a tile turns it face-up, so cubes on a face-down slot were put there
 * by a `power` action, and only shields, a ballistic rack or a sensor array
 * takes one. The read is narrow and sharp rather than broad and vague: the
 * cubes do not point at a gun, they point at what the ship is holding up
 * while it waits.
 *
 * | Slot    | Cubes | Could be                       | Read as                 |
 * |---------|-------|--------------------------------|-------------------------|
 * | forward | 2     | sensor array, half shield      | no weapon               |
 * | forward | 4     | shields                        | no weapon               |
 * | side    | 4     | shields                        | no weapon               |
 * | side    | 2     | shields, ballistic rack        | rack, maybe             |
 * | either  | 0     | anything not powered           | nothing                 |
 *
 * A dark slot is not a safe slot: it is where every gun on the board sits
 * between shots. That is what `knownWeapons` and a scan are for, and it is why
 * this function's silence is worth less than it used to be.
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
  // The powerable tiles that fit the bow are the sensor array and shields,
  // and neither is a weapon. A sensor makes their criticals land on an 8,
  // which is danger of a different kind and priced by `assessDanger`, not here.
  if (slot.group === "forward") return null;
  // Two cubes on a side slot is a half wall or a rack; four can only be a wall.
  return slot.allocatedEnergy === getSubsystemConfig("ballistic_rack").minEnergy
    ? weapon("ballistic_rack", POSSIBLE)
    : null;
}

/**
 * Damage the opponent's shields will soak out of one turn's volley. A
 * shield cube absorbs one damage and is then spent, so a tile with N cubes
 * is worth N for the whole sequence.
 *
 * A face-down side slot at four cubes can only be a full wall, since the rack
 * is the only other powerable side tile and it holds two: that one counts
 * whole. At two it is a wall or a rack and counts at
 * {@link SUSPECTED_SHIELD_WEIGHT}, so the bot neither ignores the guess nor
 * treats it as a fact.
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
    const certain = slot.allocatedEnergy > getSubsystemConfig("ballistic_rack").maxEnergy;
    absorbed +=
      (slot.allocatedEnergy / SHIELD_ENERGY_PER_POINT) * (certain ? 1 : SUSPECTED_SHIELD_WEIGHT);
  }
  return absorbed;
}

/**
 * Whether a tile is carrying its cubes right now. It is not what makes a gun
 * dangerous (the action that fires one powers it), so it answers a narrower
 * question: whether a rack is up and will therefore intercept, and which
 * slots a critical would find loaded.
 */
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
    rollsThisTurn: 0,
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
    heatBudget: Math.max(0, MAX_HEAT - ship.heat.currentHeat),
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

function analyzeOpponent(
  player: PlayerView,
  myPosition: Position,
  stations: Station[],
  pointsToWin: number
): Opponent {
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
    // Face-up: we know what it is, and an unbroken one will find its own
    // cubes the moment its owner decides to fire it. Whether it is lit now
    // says nothing about next turn, so it is not part of the range question.
    const weapon = slotAsSubsystem(slot);
    const isPowered = isSlotPowered(slot, slot.type);
    const inRange = !weapon.isBroken && sameWell && canEngage(weapon, attacker, myPosition);
    knownWeapons.push({
      slotId: slot.id,
      type: slot.type,
      isBroken: weapon.isBroken,
      isPowered,
      inRange,
    });
    // A face-up missiles tile shows what is left, and the whole magazine can
    // come at us in one launch, so the threat is the magazine. A face-down one
    // is only suspected, and its ammo is behind the screen: it stays priced at
    // a single missile above.
    if (inRange) threatInRange += visibleWeaponDamage(slot);
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
    recovering: player.recovering,
    knownWeapons,
    unknownSlots,
    shieldAbsorption: shieldAbsorption(player.slots),
    threat: Math.min(1, threatInRange / FULL_THREAT_DAMAGE),
    danger: assessDanger(player, position, stations, pointsToWin),
  };
}

export function analyzeSituation(view: GameView, parameters: BotParameters): TacticalSituation {
  const me = view.me;
  if (!me) throw new Error("Cannot analyze a spectator view");
  const status = analyzeStatus(me, view.stations);

  const opponents = view.players
    .filter((p) => !p.isMe && p.hasDeployed && p.ship && !p.ship.isDestroyed)
    .map((p) => analyzeOpponent(p, status.position, view.stations, view.pointsToWin));

  // The bot reads its own position in the race with exactly the formula it
  // uses on everyone else, so "am I ahead of them?" is one comparison.
  const mine = view.players.find((p) => p.isMe);
  const myDanger = assessDanger(
    mine ?? { cargoAboard: { crates: 0, data: 0 }, completedMissionCount: 0 },
    status.position,
    view.stations,
    view.pointsToWin
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
