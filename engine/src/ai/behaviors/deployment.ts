/**
 * Deployment: everyone starts on Black Hole ring 3 or ring 4, three sectors
 * clear of every ship already placed. The legal set comes from the engine
 * (`legalDeploymentsAgainst`, read against the public positions on the view),
 * so the bot can never name a placement the rules would refuse. The chosen
 * position becomes Home.
 *
 * Preference, in order:
 *   1. a Deliver card wants the lane: ring 4 under the arc toward its pickup
 *      planet, or two sectors behind it — from ring 4 a soft burn outward
 *      lands on the same sector of ring 5, and ring 4 drifts 2 a turn, so
 *      starting there means an early jump;
 *   2. a card that has to reach somebody — Destroy, Intercept, Piracy — wants
 *      ring 3, which drifts 4 a turn and brings the whole ring past the ship,
 *      on the legal sector farthest from the ships already placed;
 *   3. anyone else takes ring 4, farthest from the ships already placed
 *      (spread out, don't start in someone's railgun arc).
 * Ties are broken by the game's seeded RNG through `pick`.
 */
import {
  HOME_RING,
  HOME_RINGS,
  HOME_WELL_ID,
  TRANSFER_LANES,
  arcSectors,
} from "../../models/gravityWells.ts";
import type { Position } from "../../models/game.ts";
import { sectorDistance, wrapSector } from "../../game/geometry.ts";
import { legalDeploymentsAgainst } from "../../game/deployment.ts";
import type { GameView } from "../../game/view.ts";

export interface DeploymentChoice {
  wellId: string;
  ring: number;
  sector: number;
}

/** The inner deployment ring: four sectors a turn. */
const FAST_RING = HOME_RINGS[0];

/**
 * Cards whose holder has to come to somebody. `piracy` is named as a string
 * because the card is being added by another hand; when it lands as a
 * `MissionType` this set can hold the type itself.
 */
const HUNTING_MISSIONS = new Set<string>(["destroy_ship", "intercept_transmission", "piracy"]);

/** Where the ships already placed sit, as the view shows them. */
export function placedShipPositions(view: GameView): Position[] {
  return view.players
    .filter((p) => p.hasDeployed && p.ship)
    .map((p) => ({ wellId: p.ship!.wellId, ring: p.ship!.ring, sector: p.ship!.sector }));
}

/** Ring-5 sectors from which a jump to `planetId` is possible: its outbound lane. */
function laneSectorsTo(planetId: string): number[] {
  return TRANSFER_LANES.filter(
    (l) => l.planetId === planetId && l.direction === "outbound"
  ).flatMap((l) => arcSectors(l.blackHoleArc));
}

export function chooseDeployment(view: GameView, pick: (n: number) => number): DeploymentChoice {
  const placed = placedShipPositions(view);
  const legal = legalDeploymentsAgainst(placed);
  if (legal.length === 0) return { wellId: HOME_WELL_ID, ring: HOME_RING, sector: 0 };

  const take = (from: Position[]): DeploymentChoice => {
    const p = from[pick(from.length)];
    return { wellId: p.wellId, ring: p.ring, sector: p.sector };
  };
  const onRing = (ring: number) => legal.filter((p) => p.ring === ring);
  const farthest = (from: Position[]): Position[] => {
    if (placed.length === 0 || from.length === 0) return from;
    const clearance = (p: Position) =>
      Math.min(...placed.map((q) => sectorDistance(p.sector, q.sector)));
    const best = Math.max(...from.map(clearance));
    return from.filter((p) => clearance(p) === best);
  };

  const missions = (view.me?.missions ?? []).filter((m) => !m.isCompleted);

  // 1. Line up with the lane toward the first Deliver pickup.
  const pickup = missions.find((m) => m.type === "deliver_cargo");
  if (pickup && pickup.type === "deliver_cargo") {
    const wanted = new Set<number>();
    for (const s of laneSectorsTo(pickup.pickupPlanetId)) {
      wanted.add(s);
      wanted.add(wrapSector(s - 2));
    }
    const lined = onRing(HOME_RING).filter((p) => wanted.has(p.sector));
    if (lined.length > 0) return take(lined);
  }

  // 2/3. The fast ring if this seat has to reach somebody, the outer ring
  // otherwise; either way as far as possible from the ships already placed.
  const hunting = missions.some((m) => HUNTING_MISSIONS.has(m.type as string));
  const wantedRing = onRing(hunting ? FAST_RING : HOME_RING);
  return take(farthest(wantedRing.length > 0 ? wantedRing : legal));
}
