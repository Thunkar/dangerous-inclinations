/**
 * A seat's view as text an agent can read: the rules that matter this turn,
 * the ship, the cards, what is known about the others, what is legal now,
 * and what happened since the seat last acted. Everything comes from the
 * GameView (so an agent sees exactly what a human at that seat sees) and the
 * same pure helpers the UI uses.
 */
import type { GameEvent } from "../models/events.ts";
import type { SecondaryMissionType, Mission } from "../models/missions.ts";
import {
  DEFAULT_POINTS_TO_WIN,
  MISSION_POINTS,
  SURVEY_RING,
  TANKER_FUEL,
} from "../models/missions.ts";
import {
  SHIELD_ENERGY_PER_POINT,
  SUBSYSTEM_CONFIGS,
  getSubsystemConfig,
} from "../models/subsystems.ts";
import { DEFAULT_DISSIPATION_CAPACITY, MAX_HEAT, SHIELD_HEAT_PER_POINT } from "../models/game.ts";
import { getWellName } from "../models/gravityWells.ts";
import type { GameView, PlayerView } from "../game/view.ts";
import { describeEvent, describeMission } from "../game/describe.ts";
import { seatOptions } from "./options.ts";

const pos = (p: { wellId: string; ring: number; sector: number }) =>
  `${getWellName(p.wellId as never)} R${p.ring} S${p.sector}`;

/**
 * Numbers a weapon or a tile owns, read from the configs rather than written
 * out again: a digest that quotes a damage value by hand goes stale the first
 * time the value moves, and an agent that plans on a stale number submits a
 * turn the engine refuses.
 */
const dmg = (t: "railgun" | "laser" | "ballistic_rack" | "missiles") =>
  SUBSYSTEM_CONFIGS[t].weaponStats!.damage;
const RADIATOR_BONUS = SUBSYSTEM_CONFIGS.radiator.passiveEffect?.dissipationBonus ?? 0;
const MISSILE = SUBSYSTEM_CONFIGS.missiles.weaponStats!;

/**
 * The rules an agent needs at hand, in the words of RULES.md, kept short.
 *
 * Built when it is asked for, not at module load: the numbers in it are the
 * game's constants, and a copy frozen into a top-level string would go stale
 * the first time one of them moved.
 *
 * @param pointsToWin what this table plays to (`view.pointsToWin`).
 */
export function agentRulesDigest(pointsToWin: number = DEFAULT_POINTS_TO_WIN): string {
  return `RULES IN BRIEF
- Win: the round in which someone reaches ${pointsToWin} points is played out; then highest score, then hull, then fuel. Destroy, Deliver and Intercept are worth ${MISSION_POINTS.destroy_ship} points each; Survey, Piracy and Tanker ${MISSION_POINTS.survey}. A hand is ONE primary and TWO DIFFERENT secondaries, which is five points held for the ${pointsToWin} that win: your primary and either secondary wins, the other secondary is a spare, and two secondaries on their own are not enough.
- Turn: energy (move cubes freely; a tile is off or at least its minimum) -> actions in any order (rotate, ONE move: coast|burn|jump, fire any powered weapons, scan) -> your missiles fly -> docking -> heat check -> missions.
- Drift: every turn you move forward by your ring's velocity (BH rings 8/6/4/2/1, planet rings 6/4/2/1). Coast = drift only (scoop with 3 cubes: +velocity fuel; it runs in port too).
- Your hold takes ONE crate: a second Deliver cannot be loaded until the first is delivered. Data chits (scan, survey) ride free.
- Burn: drift, then change ring. Prograde facing burns OUTWARD, retrograde INWARD. soft 1 ring / 1 fuel / 1 cube on engines; medium 2/2/2; hard 3/3/3. Phasing: adjust arrival sector, 1 fuel per sector, from -(velocity-1) to +3.
- Jump: only from a lane's departure arc, engines at 3, 3 fuel (1 with a compressor), lands on the matching sector of the arrival arc; no drift that turn. Lanes are one-way. Phasing: shift the landing 1 fuel a sector, never out of the arrival arc, so any departure sector reaches any of the arc's 4 sectors. A compressor pays two of the jump's three fuel, never the phasing.
- Heat is a TRACK and does NOT reset. Using a tile costs its cubes in heat. At your heat check: anything above ${MAX_HEAT} is hull damage and the track stops at ${MAX_HEAT}, then you dissipate ${DEFAULT_DISSIPATION_CAPACITY} (+${RADIATOR_BONUS} per working radiator) and CARRY THE REST into next turn. So a hot turn is a debt, not a wound, but generate more than you dissipate for long enough and you redline.
- Shields: every ${SHIELD_ENERGY_PER_POINT} cubes on a tile absorb 1 point of damage, so a tile takes ${SHIELD_ENERGY_PER_POINT} cubes or ${2 * SHIELD_ENERGY_PER_POINT} and never an odd one; every point absorbed is ${SHIELD_HEAT_PER_POINT} heat to YOU. POWERED SHIELDS RUN HOT: each adds its cubes to your heat at EVERY check, absorbing or not. A tile that did absorb has spent its cubes back to the reactor and is dark, so it costs nothing that turn. Lasers ignore shields.
- Weapons: railgun ${dmg("railgun")} dmg, same ring, 1-5 sectors AHEAD in your facing, recoil pushes you a ring in your facing unless compensated (1 fuel, engines). Laser ${dmg("laser")} dmg through shields, +-2 rings, +-1 sector, ONE side only (prograde: port=side-0/1 fires outward, starboard=side-2/3 inward; retrograde swaps). Rack ${dmg("ballistic_rack")} dmg, +-1 ring/+-1 sector or same ring 1 sector; while powered it rolls at EVERY missile that reaches you and destroys it on 2+, and the whole turn of rolling is ONE use of the rack. Missiles ${dmg("missiles")} dmg at ANY ship in your well, any distance, any facing: ${MISSILE.maxAmmo} aboard, each flies ${MISSILE.fuelPerTurn} steps a turn (a step is one ring or one sector) for ${MISSILE.maxMoves} turns, then is gone. One action launches AS MANY as you like at ONE ship for ONE use of the tile, so the magazine is the limit, not the heat.
- POINT BLANK: a ship in YOUR OWN sector (same ring, same sector) is in range of every weapon you carry, whatever its arc.
- THE FIRST ROUND REACHES NOBODY: no weapon fires and nobody scans. Deploy on Black Hole ring 3 or 4, at least three sectors from every placed ship; if no sector qualifies, the farthest one.
- Hit roll d10: 1 miss, 2-9 hit, 10 crit (8-10 with powered sensors). A crit BREAKS THE NAMED SLOT whether or not the shot got through the shields, and the broken tile dumps its cubes into its owner's heat. Cubes on every slot are public even while the tile is face-down, so name a loaded slot. (A tile that just absorbed has spent its cubes, so breaking it dumps little, but it is gone until they dock.)
- Repair: a station (on arrival) fixes everything; away from one, if your heat is 0 at the check you repair ONE broken tile you name: that means no move but a plain coast, no scoop, no shot, no scan and no shields powered. It is the only way back for a ship whose engines or thrusters were shot out, because every station needs a jump to reach.
- Docking (end your turn on a station's sector, planet ring 2): load/deliver cargo, repair, FULL hull, reload. Stations drift 4 sectors at the end of each round. Moored: while you sit on a station you ride it: a coast does not drift, and the station carries you when it advances. Burn to cast off.
- Secondary cards (1 pt, no tile needed). Survey = end a turn on BH ring ${SURVEY_RING}: take the chit, then dock anywhere to file it. Piracy = end a turn in the exact sector of a ship carrying a crate or a data chit and it is yours, then sell the loot at ANY station: a crate first if they carry both, their card goes back to undone, your hold must be empty (a crate of your own and you take nothing) and neither ship may be moored. Tanker = arrive at a station with ${TANKER_FUEL}+ fuel and it is pumped in automatically: hand in ${TANKER_FUEL}, the card is done.
- Intercept: scan the target (same ring, within 3 sectors), then file at the station the card names.
- Destroyed: you drop your cargo and lose one turn. On your next turn the ship is placed at Home, full hull and tank, and drifts with its ring. The turn after that is A FIRST ROUND OF YOUR OWN: energy, rotation and a move are yours, but no weapon of yours fires and you scan nobody, and nobody can fire at, missile or scan you until that turn is over.`;
}

/** What each chit-paying secondary card still asks of you. */
const SECONDARY_HOW: Record<SecondaryMissionType, string> = {
  survey: `end a turn on BH R${SURVEY_RING}`,
};

function missionLine(m: Mission, name: (id: string) => string): string {
  const head = describeMission(m, name);
  if (m.isCompleted) return `${head} · DONE`;
  switch (m.type) {
    case "deliver_cargo":
      return `${head} · load the crate at ${getWellName(m.pickupPlanetId as never)}'s station, deliver at ${getWellName(m.deliveryPlanetId as never)}'s`;
    case "intercept_transmission":
      return `${head} · ${
        m.scanAcquired
          ? `data aboard: file it at ${getWellName(m.deliveryPlanetId as never)}'s station`
          : `scan them first (same ring, within 3 sectors, sensors powered), then file at ${getWellName(m.deliveryPlanetId as never)}'s station`
      }`;
    case "survey":
      return `${head} · ${m.acquired ? "chit aboard: dock at any station" : SECONDARY_HOW[m.type]}`;
    case "piracy":
      return `${head} · end a turn in the sector of a ship carrying a crate or a chit (hold empty, neither of you moored), then sell the loot at ANY station`;
    case "tanker":
      return `${head} · arrive at any station with ${TANKER_FUEL}+ fuel and it is pumped in`;
    case "destroy_ship":
      return `${head} · worth 2 points`;
  }
}

function tileLine(p: PlayerView): string {
  const slots = p.slots.map((s) => {
    const what = s.type ? `${s.type}${s.knownVia === "scanned" ? " (scanned)" : ""}` : "face-down";
    const broken = s.isBroken ? " BROKEN" : "";
    const ammo = s.ammo === null ? "" : ` ammo ${s.ammo}`;
    return `${s.id}=${what}${broken}${ammo}${s.allocatedEnergy ? ` [${s.allocatedEnergy}]` : ""}`;
  });
  const fixed = p.fixed.map(
    (f) =>
      `${f.type}${f.isBroken ? " BROKEN" : ""}${f.allocatedEnergy ? ` [${f.allocatedEnergy}]` : ""}`
  );
  return [...fixed, ...slots].join(", ");
}

/**
 * The whole picture for `view.me`. `events` is the filtered history the
 * server returns with the view; only the last `sinceTurn` turns are shown.
 */
export function describeViewForAgent(
  view: GameView,
  events: GameEvent[] = [],
  options: { recentTurns?: number; includeRules?: boolean } = {}
): string {
  const me = view.me;
  if (!me) throw new Error("A spectator has no seat to describe");
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? id;
  const out: string[] = [];
  if (options.includeRules !== false) out.push(agentRulesDigest(view.pointsToWin), "");

  const active = view.players.find((p) => p.id === view.activePlayerId);
  out.push(
    `GAME: turn ${view.turn}, phase ${view.phase}${view.finalRound ? " (FINAL ROUND)" : ""}. ${
      active ? `${active.name}${active.isMe ? " (YOU)" : ""} to act.` : ""
    } You are ${me.name} (${me.id}), seat ${view.players.findIndex((p) => p.id === me.id) + 1} of ${view.players.length}.`
  );
  const ship = me.ship;
  const stats = view.myStats;
  out.push("");
  out.push(
    `YOUR SHIP: ${pos(ship)}, facing ${ship.facing}. Hull ${ship.hitPoints}/${ship.maxHitPoints}. Heat ${ship.heat.currentHeat}/${stats?.maxHeat ?? MAX_HEAT} carried${
      stats?.standingHeat ? ` +${stats.standingHeat} from shields` : ""
    }, dissipates ${stats?.dissipationCapacity ?? "?"}. Fuel ${ship.reactionMass}/${stats?.maxReactionMass ?? "?"}. Reactor: ${ship.reactor.availableEnergy} free of ${ship.reactor.totalCapacity}.${
      me.recovering
        ? " UNTOUCHABLE: you came back at Home last turn, and this turn is a first round of your own. Nobody touches you until it is over, and you fire at nobody and scan nobody on it."
        : ""
    }`
  );
  out.push(
    `YOUR TILES: ${ship.subsystems
      .map((s) => {
        const c = getSubsystemConfig(s.type);
        const extra = s.type === "missiles" ? ` ammo ${s.ammo ?? 0}` : "";
        return `${s.id}=${s.type}${s.isBroken ? " BROKEN" : ""} [${s.allocatedEnergy}/${c.maxEnergy}, min ${c.minEnergy}]${extra}${s.isRevealed ? " (face-up)" : ""}`;
      })
      .join("; ")}`
  );
  out.push(`YOUR POINTS: ${me.completedMissionCount}/${view.pointsToWin}. CARDS:`);
  for (const m of me.missions) out.push(`  - ${missionLine(m, name)}`);
  if (me.cargo.length)
    out.push(
      `CARGO: ${me.cargo
        .map(
          (c) =>
            `${c.kind}${c.isPickedUp ? "" : " (not loaded yet)"} for ${c.deliveryPlanetId === "any" ? "any station" : getWellName(c.deliveryPlanetId as never)}`
        )
        .join("; ")}`
    );
  out.push(`HOME: ${me.home ? pos(me.home) : "not placed"}.`);

  out.push("", "OPPONENTS:");
  for (const p of view.players.filter((x) => !x.isMe)) {
    const s = p.ship;
    if (!s) {
      out.push(`  - ${p.name} (${p.id}): not deployed`);
      continue;
    }
    out.push(
      `  - ${p.name} (${p.id}): ${s.isDestroyed ? "DESTROYED (respawning)" : `${pos(s)} facing ${s.facing}`}, hull ${s.hitPoints}/${s.maxHitPoints}, heat ${s.heat}, ${p.completedMissionCount} pts, fuel ${s.fuel}, cargo ${p.cargoAboard.crates} crate(s) ${p.cargoAboard.data} data. Tiles: ${tileLine(p)}. Completed: ${
        p.completedMissions.map((m) => describeMission(m, name)).join("; ") || "none"
      }.${p.recovering ? " UNTOUCHABLE until their next turn is over: no shot, missile or scan reaches them, and they fire at nobody on it." : ""}`
    );
  }
  out.push(
    "",
    `STATIONS (planet ring 2, drift 4/round): ${view.stations.map((s) => `${getWellName(s.planetId as never)} S${s.sector}`).join(", ")}.`
  );
  if (view.missiles.length)
    out.push(
      `MISSILES IN FLIGHT: ${view.missiles
        .map(
          (m) =>
            `${name(m.ownerId)} -> ${name(m.targetId)} at ${pos(m)} (${m.movesMade} moves made)`
        )
        .join("; ")}`
    );

  if (view.phase === "active" && active?.isMe) {
    const o = seatOptions(view);
    out.push("", "LEGAL THIS TURN:");
    out.push(
      o.moored
        ? `  Moored at a station: a coast holds this berth (no drift) and the station carries you at the end of the round; burn to cast off. You docked on arrival: holding the berth repairs nothing more${o.scoopGain ? `, though the scoop would still gain ${o.scoopGain} fuel for 3 cubes` : ""}.`
        : `  Drift: coast moves you ${o.velocity} sectors forward${o.scoopGain ? ` (scoop would gain ${o.scoopGain} fuel for 3 cubes)` : ""}.`
    );
    out.push(
      `  Burns: ${
        o.burns
          .map(
            (b) =>
              `${b.intensity} ${b.facing === "prograde" ? "out" : "in"} to R${b.toRing} (${b.engineEnergy} cube(s) on engines, ${b.fuel} fuel${b.needsRotation ? ", rotate first" : ""}; phase ${b.adjustment.min}..+${b.adjustment.max})`
          )
          .join("; ") || "none from here"
      }.`
    );
    out.push(
      `  Jump: ${
        o.jump
          ? `to ${pos(o.jump.destination)} (engines 3, ${o.jump.fuel} fuel; phase ${o.jump.adjustment.min}..${o.jump.adjustment.max > 0 ? "+" : ""}${o.jump.adjustment.max} sectors inside the arrival arc, ${o.jump.phasingFuel} fuel each)`
          : "no lane departs from this sector"
      }.`
    );
    for (const w of o.weapons)
      out.push(
        `  ${w.weapon} (${w.type}, ${w.damage} dmg, ${w.energy} cubes)${w.ready ? "" : ` NOT READY: ${w.reason}`}: in range now [${w.targetsNow.map(name).join(", ") || "-"}], after a coast [${w.targetsAfterCoast.map(name).join(", ") || "-"}].`
      );
    out.push(
      `  Scan targets (sensors powered, same ring within 3): [${o.scanTargets.map(name).join(", ") || "-"}].`
    );
    if (o.repair.broken.length > 0)
      out.push(
        `  Broken: ${o.repair.broken.join(", ")}. ${
          o.repair.possibleThisTurn
            ? 'Repair one with {"repair":"<id>"} IF this turn makes no heat at all (plain coast, no scoop, no shot, no scan, shields off).'
            : "No repair this turn: you are already carrying heat or your shields are powered."
        }`
      );
    out.push(`  Heat budget before damage: ${o.heatBudget}. Reactor free: ${o.reactorFree}.`);
  }

  const recent = options.recentTurns ?? 1;
  const since = view.turn - recent;
  const shown = events.filter(
    (e) => e.turn >= since && !(e.type === "energy_allocated" || e.type === "energy_deallocated")
  );
  if (shown.length) {
    out.push("", `RECENT EVENTS (turn ${Math.max(1, since)}+):`);
    for (const e of shown.slice(-40)) out.push(`  T${e.turn} ${describeEvent(e, name)}`);
  }
  return out.join("\n");
}

/** How an agent describes a turn: the intent JSON the builder accepts. */
export const AGENT_INTENT_GUIDE = `INTENT FORMAT (JSON). Everything optional; omitted = keep cubes as they are and coast.
{
  "power": { "engines": 2, "side-0": 2 },     // cubes wanted on tiles (others keep theirs); a tile is off at 0 or at least its minimum
  "unpower": ["forward-0"],                    // tiles to switch off
  "rotate": false,                             // flip facing (1 cube on the thrusters, 1 heat)
  "move": { "kind": "coast", "scoop": false }  // or { "kind": "burn", "intensity": "soft|medium|hard", "adjustment": 0, "facing": "prograde|retrograde" }
                                               // or { "kind": "jump", "destinationWellId": "planet-alpha", "adjustment": 0 }
  "fire": [ { "weapon": "forward-0", "target": "<playerId>", "critical": "engines", "compensateRecoil": false, "when": "after" } ],
  "scan": { "target": "<playerId>", "slot": "side-1" },
  "repair": "engines"                          // a broken tile to fix at the heat check; only lands if the turn makes NO heat
}
The builder puts the cubes a burn/rotation/shot/scan needs onto the tiles and orders the actions (rotate, shots marked "before", the move, other shots, scan). Preview it before submitting; if the preview reports errors, fix the intent or fall back to a coast.`;
