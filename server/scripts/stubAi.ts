/**
 * Stand-in for `engine/src/ai/index.ts`, used only by
 * `engine-source-loader.mjs` under STUB_AI=1 so the smoke test can run while
 * the real AI module is mid-rewrite and does not link. It makes the dumbest
 * legal choices; the smoke test is about the server's plumbing and redaction,
 * not about play quality.
 */
import type { PlayerAction, ShipLoadout } from "../../engine/src/models/game.ts";
import { DEFAULT_LOADOUT } from "../../engine/src/models/game.ts";
import type { Mission } from "../../engine/src/models/missions.ts";
import { MISSIONS_PER_PLAYER } from "../../engine/src/models/missions.ts";
import type { GameView } from "../../engine/src/game/view.ts";
import { HOME_RING, HOME_WELL_ID } from "../../engine/src/models/gravityWells.ts";
// The rule itself, not the bot that reads it: engine/src/ai is exactly what
// this stub stands in for, so nothing here may import from it.
import { legalDeploymentsAgainst } from "../../engine/src/game/deployment.ts";

export function botDecideActions(_view: GameView): { actions: PlayerAction[] } {
  return { actions: [] };
}

export function botChooseLoadout(
  offers: Mission[],
  _context: { playerCount: number },
): { missionIds: string[]; loadout: ShipLoadout } {
  return { missionIds: offers.slice(0, MISSIONS_PER_PLAYER).map((m) => m.id), loadout: DEFAULT_LOADOUT };
}

export function botChooseDeployment(
  view: GameView,
  pick: (n: number) => number,
): { wellId: string; ring: number; sector: number } {
  const placed = view.players
    .filter((p) => p.hasDeployed && p.ship)
    .map((p) => ({ wellId: p.ship!.wellId, ring: p.ship!.ring, sector: p.ship!.sector }));
  const legal = legalDeploymentsAgainst(placed);
  if (legal.length === 0) return { wellId: HOME_WELL_ID, ring: HOME_RING, sector: 0 };
  return legal[pick(legal.length)];
}
