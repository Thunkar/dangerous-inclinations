/**
 * A seat's view as text an agent can read: the rules that matter this turn,
 * the ship, the cards, what is known about the others, what is legal now,
 * and what happened since the seat last acted. Everything comes from the
 * GameView (so an agent sees exactly what a human at that seat sees) and the
 * same pure helpers the UI uses.
 */
import type { GameEvent } from "../models/events.ts";
import type { Mission } from "../models/missions.ts";
import { MISSIONS_TO_WIN, SURVEY_RING } from "../models/missions.ts";
import { getSubsystemConfig } from "../models/subsystems.ts";
import { getWellName } from "../models/gravityWells.ts";
import type { GameView, PlayerView } from "../game/view.ts";
import { describeEvent, describeMission } from "../game/describe.ts";
import { seatOptions } from "./options.ts";

const pos = (p: { wellId: string; ring: number; sector: number }) =>
  `${getWellName(p.wellId as never)} R${p.ring} S${p.sector}`;

/** The rules an agent needs at hand, in the words of RULES.md, kept short. */
export const AGENT_RULES_DIGEST = `RULES IN BRIEF
- Win: the round in which someone reaches ${MISSIONS_TO_WIN} points is played out; then highest score, then hull, then fuel. Destroy = 2 points, other cards 1.
- Turn: energy (move cubes freely; a tile is off or at least its minimum) -> actions in any order (rotate, ONE move: coast|burn|jump, fire any powered weapons, scan) -> your missiles fly -> docking -> heat check -> missions.
- Drift: every turn you move forward by your ring's velocity (BH rings 8/6/4/2/1, planet rings 4/2/1). Coast = drift only (scoop with 3 cubes: +velocity fuel).
- Burn: drift, then change ring. Prograde facing burns OUTWARD, retrograde INWARD. soft 1 ring / 1 fuel / 1 cube on engines; medium 2/2/2; hard 3/3/3. Phasing: adjust arrival sector, 1 fuel per sector, from -(velocity-1) to +3.
- Jump: only from a lane's departure arc, engines at 3, 3 fuel (free with compressor), lands on the matching sector of the arrival arc; no drift that turn. Lanes are one-way. Phasing: shift the landing 1 fuel a sector, never out of the arrival arc — so any departure sector reaches any of the arc's 4 sectors. A compressor pays for the jump, not for the phasing.
- Heat: using a tile costs its cubes in heat. Dissipation 5 (+2 per radiator). Excess at your heat check = hull damage. Shields: absorb up to their cubes (max 2) but EVERY absorbed point is 2 heat to you. Lasers ignore shields.
- Weapons: railgun 4 dmg, same ring, 1-5 sectors AHEAD in your facing, recoil pushes you a ring in your facing unless compensated (1 fuel, engines). Laser 2 dmg through shields, +-2 rings, +-1 sector, ONE side only (prograde: port=side-0/1 fires outward, starboard=side-2/3 inward; retrograde swaps). Rack 1 dmg, +-1 ring/+-1 sector or same ring 1 sector; intercepts missiles. Missiles 2 dmg, +-2 rings/+-3 sectors, guided, 4 aboard.
- Hit roll d10: 1 miss, 2-9 hit, 10 crit (8-10 with powered sensors). A crit that reaches the hull breaks the named slot.
- Docking (end your turn on a station's sector, planet ring 1): load/deliver cargo, repair, FULL hull, reload. Stations drift 4 sectors at the end of each round. Moored: while you sit on a station you ride it — a coast does not drift, and the station carries you when it advances. Burn to cast off.
- Survey: end a turn on BH ring ${SURVEY_RING} with the sensor array powered, then dock anywhere. Intercept: scan the target (same ring, within 3 sectors), then dock anywhere.
- Destroyed: respawn at Home next turn, lose the turn after too (you still drift with your ring while recovering), drop cargo.`;

function missionLine(m: Mission, name: (id: string) => string): string {
  const head = describeMission(m, name);
  if (m.isCompleted) return `${head} — DONE`;
  switch (m.type) {
    case "deliver_cargo":
      return `${head} — load the crate at ${getWellName(m.pickupPlanetId as never)}'s station, deliver at ${getWellName(m.deliveryPlanetId as never)}'s`;
    case "intercept_transmission":
      return `${head} — ${m.scanAcquired ? "data aboard: dock at any station" : "scan them first (same ring, within 3 sectors, sensors powered)"}`;
    case "survey":
      return `${head} — ${
        m.surveyAcquired
          ? "data aboard: dock at any station"
          : `end a turn on BH R${SURVEY_RING} with sensors powered`
      }`;
    case "destroy_ship":
      return `${head} — worth 2 points`;
  }
}

function tileLine(p: PlayerView): string {
  const slots = p.slots.map((s) => {
    const what = s.type ? `${s.type}${s.knownVia === "scanned" ? " (scanned)" : ""}` : "face-down";
    const broken = s.isBroken ? " BROKEN" : "";
    return `${s.id}=${what}${broken}${s.allocatedEnergy ? ` [${s.allocatedEnergy}]` : ""}`;
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
  if (options.includeRules !== false) out.push(AGENT_RULES_DIGEST, "");

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
    `YOUR SHIP: ${pos(ship)}, facing ${ship.facing}. Hull ${ship.hitPoints}/${ship.maxHitPoints}. Heat ${ship.heat.currentHeat} (dissipation ${stats?.dissipationCapacity ?? "?"}). Fuel ${ship.reactionMass}/${stats?.maxReactionMass ?? "?"}. Reactor: ${ship.reactor.availableEnergy} free of ${ship.reactor.totalCapacity}.${
      me.skipTurns > 0 ? ` RECOVERING (${me.skipTurns} lost turn left).` : ""
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
  out.push(`YOUR POINTS: ${me.completedMissionCount}/${MISSIONS_TO_WIN}. CARDS:`);
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
      `  - ${p.name} (${p.id}): ${s.isDestroyed ? "DESTROYED (respawning)" : `${pos(s)} facing ${s.facing}`}, hull ${s.hitPoints}/${s.maxHitPoints}, heat ${s.heat}, ${p.completedMissionCount} pts, cargo ${p.cargoAboard.crates} crate(s) ${p.cargoAboard.data} data. Tiles: ${tileLine(p)}. Completed: ${
        p.completedMissions.map((m) => describeMission(m, name)).join("; ") || "none"
      }.${p.skipTurns ? " Recovering." : ""}`
    );
  }
  out.push(
    "",
    `STATIONS (planet ring 1, drift 4/round): ${view.stations.map((s) => `${getWellName(s.planetId as never)} S${s.sector}`).join(", ")}.`
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
        ? `  Moored at a station: a coast holds this berth (no drift) and the station carries you at the end of the round; burn to cast off${o.scoopGain ? ` (scoop would still gain ${o.scoopGain} fuel for 3 cubes)` : ""}.`
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
  "scan": { "target": "<playerId>", "slot": "side-1" }
}
The builder puts the cubes a burn/rotation/shot/scan needs onto the tiles and orders the actions (rotate, shots marked "before", the move, other shots, scan). Preview it before submitting; if the preview reports errors, fix the intent or fall back to a coast.`;
