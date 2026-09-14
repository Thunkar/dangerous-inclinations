/**
 * Deployment: choose a planet and a free sector on its outer ring. That
 * sector becomes Home.
 *
 * Planet, in order:
 *
 *   1. the pickup planet of a Deliver card — a haul is a fixed route and
 *      starting on it saves the longest leg of it;
 *   2. the planet where a Destroy or Intercept target has already deployed
 *      (positions and Home markers are public) — a hunt that starts 120°
 *      away is a hunt that never happens;
 *   3. otherwise the planet with the fewest ships, to spread out.
 *
 * Ties at every level are broken by the game's seeded RNG through `pick`.
 * Sector: a free sector inside a transfer lane when one is available (a
 * jump is then possible on turn one), else any free sector; that choice
 * goes through `pick` as well. An occupied sector is never named.
 */
import { HOME_RING, PLANETS, TRANSFER_LANES, arcSectors } from "../../models/gravityWells.ts";
import { SECTORS_PER_RING } from "../../models/rings.ts";
import type { GameView } from "../../game/view.ts";

export interface DeploymentChoice {
  wellId: string;
  sector: number;
}

export function occupiedHomeSectors(view: GameView, wellId: string): Set<number> {
  const occupied = new Set<number>();
  for (const p of view.players) {
    if (p.hasDeployed && p.ship && p.ship.wellId === wellId && p.ship.ring === HOME_RING)
      occupied.add(p.ship.sector);
  }
  return occupied;
}

export function freeHomeSectors(view: GameView, wellId: string): number[] {
  const occupied = occupiedHomeSectors(view, wellId);
  return Array.from({ length: SECTORS_PER_RING }, (_, s) => s).filter((s) => !occupied.has(s));
}

function laneSectors(wellId: string): Set<number> {
  const sectors = new Set<number>();
  for (const lane of TRANSFER_LANES) {
    if (lane.planetId === wellId) for (const s of arcSectors(lane.planetArc)) sectors.add(s);
  }
  return sectors;
}

/** Where a player has put themselves, as far as the table can see. */
function deployedWellOf(view: GameView, playerId: string): string | null {
  const player = view.players.find((p) => p.id === playerId);
  if (!player || !player.hasDeployed) return null;
  return player.ship?.wellId ?? player.home?.wellId ?? null;
}

export function chooseDeployment(view: GameView, pick: (n: number) => number): DeploymentChoice {
  const me = view.me;
  const planets = PLANETS.map((p) => p.id);
  const usable = (ids: Array<string | null>): string[] => [
    ...new Set(
      ids.filter(
        (id): id is string => id !== null && planets.includes(id) && freeHomeSectors(view, id).length > 0
      )
    ),
  ];
  const missions = (me?.missions ?? []).filter((m) => !m.isCompleted);

  // Haul first: the pickup planet of a Deliver card.
  let candidates = usable(
    missions.map((m) => (m.type === "deliver_cargo" ? m.pickupPlanetId : null))
  );

  // Hunt second: where the mark is, if they have already taken their seat.
  if (candidates.length === 0) {
    candidates = usable(
      missions.map((m) =>
        m.type === "destroy_ship" || m.type === "intercept_transmission"
          ? deployedWellOf(view, m.targetPlayerId)
          : null
      )
    );
  }

  // Otherwise spread out.
  if (candidates.length === 0) {
    const shipsAt = (id: string) =>
      view.players.filter((p) => p.hasDeployed && p.ship && p.ship.wellId === id).length;
    const withRoom = usable(planets);
    const fewest = Math.min(...withRoom.map(shipsAt));
    candidates = withRoom.filter((id) => shipsAt(id) === fewest);
  }
  const wellId = candidates.length === 1 ? candidates[0] : candidates[pick(candidates.length)];

  const free = freeHomeSectors(view, wellId);
  const lanes = laneSectors(wellId);
  const preferred = free.filter((s) => lanes.has(s));
  const pool = preferred.length > 0 ? preferred : free;
  return { wellId, sector: pool[pick(pool.length)] };
}
