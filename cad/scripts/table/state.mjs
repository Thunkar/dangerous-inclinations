// A real 4-bot game for the table renders: play headless games with the
// engine, look at the end of every round, and keep the round where the most
// is on the table (missiles in flight, a wreck, cargo aboard, sales made,
// an Escort marker placed, a ship moored). Writes the state as the renders
// need it to cad/shots/table/state.json.
//
//   node scripts/table/state.mjs [--seed=N] [--round=R] [--scan=40]
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  runGame,
  isMooredAt,
  aboard,
  buildPrimaryDeck,
  buildSecondaryDeck,
  cardForPlayer,
  isPrimaryType,
  MAX_PLAYERS,
} from "@dangerous-inclinations/engine";

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? Number(a.split("=")[1]) : d;
};
const OUT = join(import.meta.dirname, "../../shots/table");

/** What a state offers the camera. */
function score(s) {
  const wells = new Set(s.players.map((p) => p.ship.wellId));
  const missiles = s.missiles.length;
  const cargo = s.players.reduce((n, p) => n + aboard(p.cargo).length, 0);
  const sales = s.players.reduce((n, p) => n + p.soldAt.length, 0);
  const escorts = s.players.reduce(
    (n, p) => n + p.missions.filter((m) => m.type === "escort" && m.markedPlayerId).length,
    0
  );
  const moored = s.players.filter((p) => isMooredAt(s.stations, p.ship)).length;
  const revealed = s.players.reduce(
    (n, p) => n + p.ship.subsystems.filter((x) => x.slotGroup && x.isRevealed).length,
    0
  );
  const has = (x) => (x > 0 ? 1 : 0);
  return {
    total:
      4 * has(missiles) + 3 * has(s.wrecks.length) + 3 * has(cargo) + 3 * has(sales) + 2 * has(escorts) +
      2 * has(moored) + wells.size + Math.min(missiles, 6) * 0.3 + Math.min(cargo, 4) * 0.3 + Math.min(revealed, 10) * 0.1 +
      Math.min(sales, 4) * 0.2,
    missiles,
    wrecks: s.wrecks.length,
    cargo,
    sales,
    escorts,
    moored,
    wells: wells.size,
    revealed,
  };
}

function play(seed) {
  const r = runGame({ seed, botCount: 4, record: true });
  // The end of each round: the snapshot after the last seat's turn.
  return r.recording.turns
    .filter((t) => t.resultingStateSnapshot.activePlayerIndex === 0 && t.resultingStateSnapshot.phase === "active")
    .map((t) => ({ seed, round: t.turnNumber, state: t.resultingStateSnapshot }));
}

let pick;
const seed = arg("seed", null);
if (seed !== null) {
  const rounds = play(seed);
  const want = arg("round", null);
  pick = want === null ? rounds.reduce((a, b) => (score(b.state).total > score(a.state).total ? b : a)) : rounds.find((r) => r.round === want);
  if (!pick) throw new Error(`seed ${seed} has no round ${want}`);
} else {
  const all = [];
  for (let s = 1; s <= arg("scan", 40); s++) for (const r of play(s)) all.push({ ...r, score: score(r.state) });
  all.sort((a, b) => b.score.total - a.score.total);
  for (const r of all.slice(0, 12)) console.log(`seed ${r.seed} round ${r.round}`, JSON.stringify(r.score));
  pick = all[0];
}

const s = pick.state;

/**
 * The printed card behind a mission: its place in the printed pile as the
 * site's /card page lays it out (ui/src/site/missions/decks.ts: the primary
 * pile at the largest table, `<pile>-<index>`). A rival card counts seats to
 * the left, so the holder's seat turns the count back into the card.
 */
const PRINTED = { primary: buildPrimaryDeck(MAX_PLAYERS), secondary: buildSecondaryDeck() };
function printedCard(m, holder) {
  const pile = isPrimaryType(m.type) ? "primary" : "secondary";
  const same = (a, b) =>
    a.type === b.type &&
    a.targetPlayerId === b.targetPlayerId &&
    a.pickupPlanetId === b.pickupPlanetId &&
    a.deliveryPlanetId === b.deliveryPlanetId;
  const i = PRINTED[pile].findIndex((card) => {
    if (card.targetOffset !== undefined && card.targetOffset >= s.players.length) return false;
    return same(cardForPlayer(card, holder, s.players), m);
  });
  if (i < 0) throw new Error(`no printed card for ${JSON.stringify(m)}`);
  return `${pile}-${i}`;
}
const dealt = s.players.reduce((n, p) => n + p.missionOffers.length, 0);
const primaryOffers = s.players.reduce((n, p) => n + p.missionOffers.filter((m) => isPrimaryType(m.type)).length, 0);
const out = {
  seed: pick.seed,
  round: pick.round,
  score: score(s),
  stations: s.stations,
  wrecks: s.wrecks,
  missiles: s.missiles,
  /** What is left in the two draw piles after the deal. */
  piles: {
    primary: buildPrimaryDeck(s.players.length).length - primaryOffers,
    secondary: buildSecondaryDeck().length - (dealt - primaryOffers),
  },
  players: s.players.map((p) => ({
    id: p.id,
    name: p.name,
    points: p.points,
    home: p.home,
    ship: {
      wellId: p.ship.wellId,
      ring: p.ship.ring,
      sector: p.ship.sector,
      facing: p.ship.facing,
      fuel: p.ship.reactionMass,
      hull: p.ship.hitPoints,
      maxHull: p.ship.maxHitPoints,
      heat: p.ship.heat.currentHeat,
      subsystems: p.ship.subsystems.map((x) => ({
        id: x.id,
        type: x.type,
        energy: x.allocatedEnergy,
        broken: x.isBroken,
        revealed: x.isRevealed,
        ammo: x.ammo,
      })),
    },
    moored: isMooredAt(s.stations, p.ship),
    cargo: aboard(p.cargo).map((c) => ({ id: c.id, kind: c.kind, loot: p.missions.some((m) => m.type === "piracy" && m.cargoId === c.id) })),
    waiting: p.cargo.filter((c) => !c.isPickedUp && c.pickupPlanetId).map((c) => ({ id: c.id, kind: c.kind, at: c.pickupPlanetId })),
    soldAt: p.soldAt,
    missions: p.missions.map((m) => ({
      type: m.type,
      done: m.isCompleted,
      marked: m.type === "escort" ? m.markedPlayerId : undefined,
      card: printedCard(m, s.players.indexOf(p)),
      target: m.targetPlayerId,
      route: m.pickupPlanetId ? [m.pickupPlanetId, m.deliveryPlanetId] : m.deliveryPlanetId,
    })),
  })),
};
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "state.json"), JSON.stringify(out, null, 2));
console.log(`picked seed ${out.seed} round ${out.round}`, JSON.stringify(out.score));
