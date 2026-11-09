// A game state as the table renders it (state.json's shape): what layout.ts
// needs of the engine's GameState, every card named by its place in the
// printed pile. Shared by state.mjs (one round) and film.mjs (a turn).
import {
  isMooredAt,
  aboard,
  buildPrimaryDeck,
  buildSecondaryDeck,
  cardForPlayer,
  isPrimaryType,
  MAX_PLAYERS,
} from "@dangerous-inclinations/engine";

const PRINTED = { primary: buildPrimaryDeck(MAX_PLAYERS), secondary: buildSecondaryDeck() };

/** `s` for the table; `meta` is `{ seed, round }` and `score`, carried as given. */
export function tableState(s, meta) {
  /**
   * The printed card behind a mission: its place in the printed pile as the
   * site's /card page lays it out (ui/src/site/missions/decks.ts: the primary
   * pile at the largest table, `<pile>-<index>`). A rival card counts seats to
   * the left, so the holder's seat turns the count back into the card.
   */
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
  return {
    seed: meta.seed,
    round: meta.round,
    score: meta.score,
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
}
