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
import { PLANETS, HOME_RING } from "../../engine/src/models/gravityWells.ts";
import { SECTORS_PER_RING } from "../../engine/src/models/rings.ts";

export function botDecideActions(_view: GameView): { actions: PlayerAction[] } {
  return { actions: [] };
}

export function botChooseLoadout(
  offers: Mission[],
  _context: { playerCount: number },
): { missionIds: string[]; loadout: ShipLoadout } {
  return { missionIds: offers.slice(0, MISSIONS_PER_PLAYER).map((m) => m.id), loadout: DEFAULT_LOADOUT };
}

export function botChooseDeployment(view: GameView, pick: (n: number) => number): { wellId: string; sector: number } {
  const taken = new Set(
    view.players
      .filter((p) => p.ship && p.ship.ring === HOME_RING)
      .map((p) => `${p.ship!.wellId}:${p.ship!.sector}`),
  );
  const planet = PLANETS[pick(PLANETS.length)];
  for (let sector = 0; sector < SECTORS_PER_RING; sector++) {
    if (!taken.has(`${planet.id}:${sector}`)) return { wellId: planet.id, sector };
  }
  return { wellId: PLANETS[0].id, sector: 0 };
}
