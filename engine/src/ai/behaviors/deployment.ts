/**
 * Deployment: everyone starts on Black Hole ring 2, 3 or 4, three sectors
 * clear of every ship already placed. The legal set comes from the engine
 * (`legalDeploymentsAgainst`, read against the public positions on the view),
 * so the bot can never name a placement the rules would refuse. The chosen
 * position becomes Home.
 *
 * Preference, in order:
 *   1. a Deliver card wants the lane: ring 4 under the arc toward its pickup
 *      planet, or two sectors behind it: from ring 4 a soft burn outward
 *      lands on the same sector of ring 5, and ring 4 drifts 2 a turn, so
 *      starting there means an early jump;
 *   2. an undone Destroy or Intercept whose target is already placed wants
 *      the target's ring, where both ships drift together and the gap holds:
 *      - Intercept takes the legal sector closest to the target (the
 *        deployment gap is 3, the scan range, so it can scan on its first
 *        legal turn), behind the target when both sides are equally close
 *        (every ring drifts prograde, so behind is the lower sector);
 *      - Destroy on a railgun hull takes the sector that puts the target
 *        3 to the railgun's range ahead of a prograde-facing ship, closest
 *        first; a hull with no railgun, or a window with no legal sector in
 *        it, takes the Intercept sector instead;
 *      no legal sector on the target's ring falls through to 3;
 *   3. a card that has to reach somebody (Destroy, Intercept, Piracy, Escort)
 *      wants the fastest deployment ring, ring 2, which drifts 6 a turn and
 *      brings the whole ring past the ship, on the legal sector farthest from
 *      the ships already placed;
 *   4. anyone else takes ring 4, farthest from the ships already placed
 *      (spread out, don't start in someone's railgun arc).
 * Ties are broken by the game's seeded RNG through `pick`.
 */
import { HOME_RING, HOME_RINGS, BLACK_HOLE_ID, arcSectors } from "../../models/gravityWells.ts";
import type { Position } from "../../models/game.ts";
import type { Mission, MissionType } from "../../models/missions.ts";
import { getSubsystemConfig } from "../../models/subsystems.ts";
import { SECTORS_PER_RING } from "../../models/rings.ts";
import { forwardDistance, positionOf, sectorDistance, wrapSector } from "../../game/geometry.ts";
import { planetLane } from "./danger.ts";
import { DEPLOYMENT_GAP, legalDeploymentsAgainst } from "../../game/deployment.ts";
import type { GameView } from "../../game/view.ts";
import { isOpenMission } from "../types.ts";

export interface DeploymentChoice {
  wellId: string;
  ring: number;
  sector: number;
}

/** The inner deployment ring: the fastest a ship may start on. */
const FAST_RING = HOME_RINGS[0];

/** Cards whose holder has to come to somebody. */
const HUNTING_MISSIONS = new Set<MissionType>([
  "destroy_ship",
  "intercept_transmission",
  "piracy",
  "escort",
]);

/** Where the ships already placed sit, as the view shows them. */
export function placedShipPositions(view: GameView): Position[] {
  return view.players.filter((p) => p.hasDeployed && p.ship).map((p) => positionOf(p.ship!));
}

/** Ring-5 sectors from which a jump to `planetId` is possible: its outbound lane. */
function laneSectorsTo(planetId: string): number[] {
  const lane = planetLane(planetId, "outbound");
  return lane ? arcSectors(lane.blackHoleArc) : [];
}

export function chooseDeployment(view: GameView, pick: (n: number) => number): DeploymentChoice {
  const placed = placedShipPositions(view);
  const legal = legalDeploymentsAgainst(placed);
  if (legal.length === 0) return { wellId: BLACK_HOLE_ID, ring: HOME_RING, sector: 0 };

  const take = (from: Position[]): DeploymentChoice => {
    const p = from[pick(from.length)];
    return positionOf(p);
  };
  const onRing = (ring: number) => legal.filter((p) => p.ring === ring);
  const farthest = (from: Position[]): Position[] => {
    if (placed.length === 0 || from.length === 0) return from;
    const clearance = (p: Position) =>
      Math.min(...placed.map((q) => sectorDistance(p.sector, q.sector)));
    const best = Math.max(...from.map(clearance));
    return from.filter((p) => clearance(p) === best);
  };

  const missions = (view.me?.missions ?? []).filter(isOpenMission);

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

  // 2. Next to a placed Destroy or Intercept target, on its ring.
  const nearTarget = targetSectors(view, missions, legal);
  if (nearTarget.length > 0) return take(nearTarget);

  // 3/4. The fast ring if this seat has to reach somebody, the outer ring
  // otherwise; either way as far as possible from the ships already placed.
  const hunting = missions.some((m) => HUNTING_MISSIONS.has(m.type));
  const wantedRing = onRing(hunting ? FAST_RING : HOME_RING);
  return take(farthest(wantedRing.length > 0 ? wantedRing : legal));
}

/**
 * The legal sectors a Destroy or Intercept holder wants next to its target,
 * or none when the seat holds neither card, the target is not placed yet or
 * its ring has no legal sector.
 */
function targetSectors(
  view: GameView,
  missions: readonly Mission[],
  legal: Position[]
): Position[] {
  const card = missions.find(
    (m) => m.type === "destroy_ship" || m.type === "intercept_transmission"
  );
  if (card?.type !== "destroy_ship" && card?.type !== "intercept_transmission") return [];
  const target = view.players.find((p) => p.id === card.targetPlayerId && p.hasDeployed && p.ship);
  if (!target?.ship) return [];
  const t = positionOf(target.ship);
  const ring = legal.filter((p) => p.wellId === t.wellId && p.ring === t.ring);
  if (ring.length === 0) return [];

  // Sectors from a candidate forward to the target: what a prograde-facing
  // railgun reads as "ahead", and at most half a ring for a ship behind it.
  const ahead = (p: Position) => forwardDistance(p.sector, t.sector);

  if (card.type === "destroy_ship" && view.me?.ship.subsystems.some((s) => s.type === "railgun")) {
    const range = getSubsystemConfig("railgun").weaponStats?.sectorRange ?? 0;
    const inWindow = ring.filter((p) => ahead(p) >= DEPLOYMENT_GAP && ahead(p) <= range);
    if (inWindow.length > 0) {
      const best = Math.min(...inWindow.map(ahead));
      return inWindow.filter((p) => ahead(p) === best);
    }
  }

  const nearest = Math.min(...ring.map((p) => sectorDistance(p.sector, t.sector)));
  const closest = ring.filter((p) => sectorDistance(p.sector, t.sector) === nearest);
  const behind = closest.filter((p) => ahead(p) <= SECTORS_PER_RING / 2);
  return behind.length > 0 ? behind : closest;
}
