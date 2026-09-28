/**
 * One sale per station as the bots play it (RULES §Stations): a station buys
 * one item from each player, once, so which station takes which card's item
 * is a plan, not an accident.
 *
 * A station is **reserved** while this seat's undone primary still needs a
 * sale there: a Deliver's delivery planet and an Intercept's filing planet.
 * Only that primary's item is sold at a reserved station. A secondary's item
 * (Survey data, a Salvage box, Piracy loot, a Tanker's fuel) sells only at a
 * station the seat has not sold at and has not reserved; with none, the card
 * waits, and with every station sold at, the card is dead.
 */
import type { Player } from "../../models/game.ts";
import type { Mission } from "../../models/missions.ts";
import { PLANETS } from "../../models/gravityWells.ts";
import type { SaleOffer, SaleOption } from "../../game/docking.ts";

type Seller = Pick<Player, "missions" | "cargo" | "soldAt">;

/** The planet this seat's undone primary still has to sell at, and the card. */
export function reservedStation(me: Seller): { planetId: string; missionId: string } | null {
  for (const m of me.missions) {
    if (m.isCompleted) continue;
    if (m.type === "deliver_cargo" || m.type === "intercept_transmission")
      return { planetId: m.deliveryPlanetId, missionId: m.id };
  }
  return null;
}

/** Whether `missionId`'s item may be sold at `planetId`'s station. */
export function saleAllowedAt(me: Seller, planetId: string, missionId: string): boolean {
  if (me.soldAt.includes(planetId)) return false;
  const reserved = reservedStation(me);
  return !reserved || reserved.planetId !== planetId || reserved.missionId === missionId;
}

/** The sales on offer this seat may make here, in the offer's order. */
export function allowedSales(me: Seller, planetId: string, offer: SaleOffer): SaleOption[] {
  return offer.options.filter(
    (o) =>
      o.kind === "load" || (o.missionId !== undefined && saleAllowedAt(me, planetId, o.missionId))
  );
}

/**
 * Why a card that needs a sale of its own cannot be played now: "dead" when
 * no station is left to sell at, "waiting" when the only ones left are
 * reserved for the primary. Null when it can be played, or needs no sale.
 */
export function saleBlocked(me: Seller, mission: Mission): "dead" | "waiting" | null {
  if (mission.isCompleted) return null;
  switch (mission.type) {
    case "destroy_ship":
    case "escort":
      return null;
    case "deliver_cargo":
    case "intercept_transmission":
      return me.soldAt.includes(mission.deliveryPlanetId) ? "dead" : null;
    default: {
      const unsold = PLANETS.map((p) => p.id).filter((id) => !me.soldAt.includes(id));
      if (unsold.length === 0) return "dead";
      return unsold.some((id) => saleAllowedAt(me, id, mission.id)) ? null : "waiting";
    }
  }
}
