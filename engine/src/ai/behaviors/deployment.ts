/**
 * Deployment: everyone starts on Black Hole Ring 4. Choose a free sector;
 * it becomes Home.
 *
 * Preference, in order:
 *   1. a sector that puts the ship "ahead of" the lane toward a Deliver
 *      card's pickup planet — from ring 4 a soft burn outward lands on the
 *      same sector of ring 5, so starting under the right arc (or a little
 *      behind it, since ring 4 drifts 2 per turn) means an early jump;
 *   2. otherwise the free sector farthest from the ships already placed
 *      (spread out, don't start in someone's railgun arc);
 * Ties are broken by the game's seeded RNG through `pick`. An occupied
 * sector is never named.
 */
import { HOME_RING, HOME_WELL_ID, TRANSFER_LANES, arcSectors } from "../../models/gravityWells.ts";
import { SECTORS_PER_RING } from "../../models/rings.ts";
import { sectorDistance, wrapSector } from "../../game/geometry.ts";
import type { GameView } from "../../game/view.ts";

export interface DeploymentChoice {
  wellId: string;
  sector: number;
}

export function occupiedHomeSectors(view: GameView): Set<number> {
  const occupied = new Set<number>();
  for (const p of view.players) {
    if (p.hasDeployed && p.ship && p.ship.wellId === HOME_WELL_ID && p.ship.ring === HOME_RING) {
      occupied.add(p.ship.sector);
    }
  }
  return occupied;
}

export function freeHomeSectors(view: GameView): number[] {
  const occupied = occupiedHomeSectors(view);
  return Array.from({ length: SECTORS_PER_RING }, (_, s) => s).filter((s) => !occupied.has(s));
}

/** Ring-5 sectors from which a jump to `planetId` is possible. */
function laneSectorsTo(planetId: string): number[] {
  return TRANSFER_LANES.filter((l) => l.planetId === planetId).flatMap((l) => arcSectors(l.blackHoleArc));
}

export function chooseDeployment(view: GameView, pick: (n: number) => number): DeploymentChoice {
  const free = freeHomeSectors(view);
  if (free.length === 0) return { wellId: HOME_WELL_ID, sector: 0 };

  const missions = (view.me?.missions ?? []).filter((m) => !m.isCompleted);
  const occupied = [...occupiedHomeSectors(view)];

  // 1. Line up with the lane toward the first Deliver pickup: the sector two
  // behind the arc start (ring 4 drifts 2), or anything under the arc.
  const pickup = missions.find((m) => m.type === "deliver_cargo");
  if (pickup && pickup.type === "deliver_cargo") {
    const wanted = new Set<number>();
    for (const s of laneSectorsTo(pickup.pickupPlanetId)) {
      wanted.add(s);
      wanted.add(wrapSector(s - 2));
    }
    const lined = free.filter((s) => wanted.has(s));
    if (lined.length > 0) return { wellId: HOME_WELL_ID, sector: lined[pick(lined.length)] };
  }

  // 2. Spread out: maximise the distance to the nearest placed ship.
  if (occupied.length > 0) {
    const score = (s: number) => Math.min(...occupied.map((o) => sectorDistance(s, o)));
    const best = Math.max(...free.map(score));
    const farthest = free.filter((s) => score(s) === best);
    return { wellId: HOME_WELL_ID, sector: farthest[pick(farthest.length)] };
  }

  return { wellId: HOME_WELL_ID, sector: free[pick(free.length)] };
}
