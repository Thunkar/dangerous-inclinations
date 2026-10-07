import type { GameState, PlayerAction } from "../models/game.ts";
import type { GameEvent } from "../models/events.ts";

/**
 * Bumped whenever the recording schema changes incompatibly.
 * v2: events replace log strings; states carry no log; new action shapes.
 * v3: `power` replaces `set_standing_power`; energy stays on a tile until its owner's next turn.
 * v4: a visit does one job: the `dock_job` action, and `docked` carries the job done.
 * v5: a shuffled secondary pile with Escort and Salvage; the state carries `wrecks`,
 *     and an Escort marker is placed by choice with the `escort_mark` action.
 * v6: `fuel_sold` is `fuel_pumped`; a destroyed ship's missiles are removed.
 * v7: `Player.points` and `mission_completed.points`; Survey has no station and
 *     Intercept and Survey no taken flag (the data aboard says it); tiles carry
 *     no `isPowered`; missiles no `turnFired`; `heat_damage` is folded into
 *     `heat_check`; the radiator's reveal reason is `shed_heat`;
 *     `missile_intercepted` has no heat and a missile's `attack_resolved` names
 *     it; a kill removes loot instead of leaving it un-picked.
 * v8: one sale per station and no hold limit: `Player.soldAt`, `dock_job`
 *     became `dock_sale` naming the item sold, `docked.job` became
 *     `docked.sold`, the `seize` action, `PlayerView.hold`, and cargo ids are
 *     opaque `item-<n>` tokens.
 * v9: a visit does one thing: `dock_sale` may name `"load"`, crates load only
 *     on a visit that loads, and Tanker hands in 5 fuel.
 * v10: a jump needs prograde facing, and a railgun's recoil pushes the ship
 *     against its facing.
 * v11: absorbing makes no heat; `attack_resolved.toHeat` is `absorbed`.
 * v12: Escort is spent (`isSpent`, `escort_spent`) on the carrier's death,
 *     released (`escort_released`) on the escort's, and pays only with the
 *     escort in the well; `PlayerView.spentMissions`.
 * v13: Escort marks on the same ring, and is never spent: the marker comes
 *     back if either ship is destroyed (`escort_released.cause`); no
 *     `isSpent`, `escort_spent` or `PlayerView.spentMissions`.
 * v14: shields take 1 or 2 cubes at a point a cube (plasma two), and every
 *     point absorbed is heat on the owner's track.
 * v15: a ballistic rack that rolls at missiles puts INTERCEPT_HEAT on its
 *     owner's track, once a player-turn.
 */
export const RECORDING_SCHEMA_VERSION = 15;

/**
 * Why a recording cannot be replayed, or null when it can. A recording made
 * under other rules is refused, never migrated: its states and actions mean
 * what the engine meant when it was written.
 */
export function staleRecordingReason(recording: { schemaVersion?: unknown }): string | null {
  if (recording.schemaVersion === RECORDING_SCHEMA_VERSION) return null;
  const version =
    recording.schemaVersion === undefined ? "no schema version" : `schema v${String(recording.schemaVersion)}`;
  return `This recording predates the current rules (${version}, the rules are at v${RECORDING_SCHEMA_VERSION}) and cannot be replayed`;
}

/**
 * One turn. `actions` is the source of truth for replay; the snapshot is a
 * cache for O(1) scrubbing and must equal re-executing the actions on the
 * previous snapshot.
 */
export interface RecordedTurn {
  turnNumber: number;
  playerId: string;
  actions: PlayerAction[];
  resultingStateSnapshot: GameState;
  events: GameEvent[];
}

export interface RecordingMetadata {
  source: "sim" | "live";
  playerKinds: Array<{ playerId: string; kind: "human" | "bot" }>;
  label?: string;
  turnCount: number;
  winnerId?: string;
  endReason: "victory" | "max_turns" | "invalid_turn" | "tiebreak";
}

/**
 * A complete game: initial (post-deployment) state, every turn, final state.
 * Recordings hold full authoritative state and are private until a game ends.
 */
export interface GameRecording {
  schemaVersion: typeof RECORDING_SCHEMA_VERSION;
  recordingId: string;
  createdAt: string;
  seed: number;
  initialState: GameState;
  turns: RecordedTurn[];
  finalState?: GameState;
  metadata: RecordingMetadata;
}
