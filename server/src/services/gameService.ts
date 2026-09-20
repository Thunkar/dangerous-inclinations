import type { ShipAppearance } from "@dangerous-inclinations/engine";
/**
 * Live game orchestration: setup (loadout, deployment), turns, bots, and the
 * rewind/fork dev tools. All rules come from the engine; this module owns
 * persistence, ordering and who gets told what.
 *
 * Clients never receive a GameState. Every outgoing message carries
 * `viewFor(state, recipient)` and events filtered for that recipient.
 *
 * Persistence (`Kv`), transport and the bot strategy are injected so the
 * whole flow can run without Redis or sockets (see scripts/smoke.ts).
 */
import { randomUUID } from "node:crypto";
import type {
  GameEvent,
  GameState,
  GameView,
  Mission,
  Player,
  PlayerAction,
  PlayerSpec,
  ShipLoadout,
} from "@dangerous-inclinations/engine";
import {
  DEFAULT_LOADOUT,
  MISSIONS_PER_PLAYER,
  type DeploymentChoice,
  botChooseDeployment,
  botChooseLoadout,
  botDecideActions,
  createGame as engineCreateGame,
  type GameOptions,
  deployShip,
  executeTurn,
  filterEventsFor,
  legalDeploymentPositions,
  isDestroyed,
  missionTargetsPlayer,
  pickIndex,
  restoreRecordedState,
  stampEvents,
  submitLoadout as engineSubmitLoadout,
  transitionToActivePhase,
  viewFor,
} from "@dangerous-inclinations/engine";
import type { Kv } from "./kv.ts";
import { createKeyedLock } from "./lock.ts";
import type { RecordingService } from "./recordingService.ts";
import { log as defaultLog, type ServiceLogger } from "./logger.ts";
import type { ChatMessage, PreviewPayload, ServerGameMessage, ViewPayload } from "../protocol.ts";

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface GameTransport {
  sendToPlayer(gameId: string, playerId: string, message: ServerGameMessage): void;
  broadcastViews(gameId: string, build: (playerId: string) => ServerGameMessage): void;
}

/** What a bot decides, from exactly the information a human has. */
export interface BotStrategy {
  chooseLoadout(
    offers: Mission[],
    context: { playerCount: number; pick?: (n: number) => number }
  ): { missionIds: string[]; loadout: ShipLoadout };
  chooseDeployment(view: GameView, pick: (n: number) => number): DeploymentChoice;
  decideActions(view: GameView): { actions: PlayerAction[] };
}

export const engineBots: BotStrategy = {
  chooseLoadout: (offers, context) => botChooseLoadout(offers, context),
  chooseDeployment: (view, pick) => botChooseDeployment(view, pick),
  decideActions: (view) => botDecideActions(view),
};

export interface GameServiceDeps {
  kv: Kv;
  recordings: RecordingService;
  transport: GameTransport;
  bots?: BotStrategy;
  log?: ServiceLogger;
}

export type Result<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error?: string; errors?: string[] };

export interface LoadoutSubmission {
  appearance?: ShipAppearance;
  loadout: ShipLoadout;
  missionIds: string[];
}

export interface ForkOptions {
  /** Recorded player the forking human takes over. */
  impersonateOriginalPlayerId?: string;
  humanPlayerId: string;
  humanPlayerName: string;
}

/**
 * Bot turns the engine rejected (or the AI failed to produce) in live games.
 * Each one is logged and replaced by an empty turn so the game continues.
 */
let botInvalidTurns = 0;
export function getBotInvalidTurnCount(): number {
  return botInvalidTurns;
}

const gameKey = (gameId: string) => `game:${gameId}`;
const humansKey = (gameId: string) => `game-humans:${gameId}`;
const chatKey = (gameId: string) => `game-chat:${gameId}`;

export function createGameService(deps: GameServiceDeps) {
  const { kv, recordings, transport } = deps;
  const bots = deps.bots ?? engineBots;
  const log = deps.log ?? defaultLog;

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  async function loadState(gameId: string): Promise<GameState | null> {
    const data = await kv.get(gameKey(gameId));
    return data ? (JSON.parse(data) as GameState) : null;
  }

  async function saveState(gameId: string, state: GameState): Promise<void> {
    await kv.set(gameKey(gameId), JSON.stringify(state));
  }

  async function getHumanPlayerIds(gameId: string): Promise<Set<string>> {
    const data = await kv.get(humansKey(gameId));
    return new Set(data ? (JSON.parse(data) as string[]) : []);
  }

  async function setHumanPlayerIds(gameId: string, ids: Iterable<string>): Promise<void> {
    await kv.set(humansKey(gameId), JSON.stringify([...ids]));
  }

  /**
   * Per-game serialization. Turn processing awaits persistence between steps,
   * so two submissions for the same game must not interleave, and neither may
   * a deletion, which would otherwise be undone by a turn already in flight.
   */
  const withGameLock = createKeyedLock();

  async function gameExists(gameId: string): Promise<boolean> {
    return kv.exists(gameKey(gameId));
  }

  /**
   * Human seats come from the persisted registry, never from who is connected.
   * An empty registry for a game that has players means the registry was lost;
   * treating every seat as a bot would play the whole game unattended, so
   * callers refuse instead.
   */
  function humansAreRegistered(
    gameId: string,
    state: GameState,
    humans: ReadonlySet<string>
  ): boolean {
    if (humans.size > 0 || state.players.length === 0) return true;
    log.error(
      `Game ${gameId} has ${state.players.length} players but no registered human seats; refusing to run bots`
    );
    return false;
  }

  const NO_HUMANS_ERROR = "This game has no registered human players; it cannot be played";

  /**
   * A finished game whose archive write failed keeps a pending flag; reads of
   * ended games are the retry tick (together with /api/health).
   */
  async function ensureFinalized(gameId: string, state: GameState): Promise<void> {
    if (state.phase !== "ended") return;
    try {
      if (await recordings.isFinalized(gameId)) await recordings.retryPendingFinalizations();
      else await recordings.finalize(gameId, state, "victory");
    } catch (error) {
      log.error(`Failed to finalize the recording of game ${gameId}: ${String(error)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Messaging
  // -------------------------------------------------------------------------

  function viewPayload(state: GameState, playerId: string, events: GameEvent[]): ViewPayload {
    return { view: viewFor(state, playerId), events: filterEventsFor(events, playerId) };
  }

  function broadcastView(gameId: string, state: GameState, events: GameEvent[]): void {
    transport.broadcastViews(gameId, (playerId) => ({
      type: "GAME_VIEW",
      payload: viewPayload(state, playerId, events),
    }));
  }

  /**
   * Persist an executed turn, record it, archive the recording if the game just
   * ended, and only then tell every connected player.
   *
   * All-or-nothing as far as clients are concerned: the recording is appended
   * first and the state second, and if either write fails the turn is rolled
   * back, nothing is broadcast and the caller answers TURN_ERROR. A committed
   * turn is therefore always a recorded turn.
   */
  async function commitTurn(
    gameId: string,
    before: GameState,
    after: GameState,
    turn: { turnNumber: number; playerId: string; actions: PlayerAction[]; events: GameEvent[] }
  ): Promise<Result> {
    let turnCount: number | null = null;
    try {
      turnCount = await recordings.append(gameId, {
        turnNumber: turn.turnNumber,
        playerId: turn.playerId,
        actions: turn.actions,
        resultingStateSnapshot: after,
        events: turn.events,
      });
    } catch (error) {
      log.error(`Failed to record turn ${turn.turnNumber} of game ${gameId}: ${String(error)}`);
      return { ok: false, error: "Could not record the turn; the game was not advanced" };
    }
    if (turnCount === null) {
      // No recording for this game (it was discarded, or expired): the turn
      // still stands, but the history will have a hole.
      log.warn(`Game ${gameId} has no recording; turn ${turn.turnNumber} was not recorded`);
    }

    try {
      await saveState(gameId, after);
    } catch (error) {
      log.error(`Failed to save turn ${turn.turnNumber} of game ${gameId}: ${String(error)}`);
      if (turnCount !== null) {
        // Drop the turn we just recorded so the recording matches the state
        // that is still live.
        try {
          await recordings.truncate(gameId, turnCount - 2);
        } catch (rollbackError) {
          log.error(
            `Failed to roll the recording of game ${gameId} back: ${String(rollbackError)}`
          );
        }
      }
      return { ok: false, error: "Could not save the turn; the game was not advanced" };
    }

    if (after.phase === "ended" && before.phase === "active") {
      // The turn itself is committed; a failed archive write is retried later.
      await ensureFinalized(gameId, after);
    }
    transport.broadcastViews(gameId, (recipient) => ({
      type: "TURN_EXECUTED",
      payload: {
        ...viewPayload(after, recipient, turn.events),
        playerId: turn.playerId,
        turnNumber: turn.turnNumber,
        ...(recipient === turn.playerId ? { actions: turn.actions } : {}),
      },
    }));
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Bots
  // -------------------------------------------------------------------------

  function activePlayer(state: GameState): Player {
    return state.players[state.activePlayerIndex];
  }

  function fallbackLoadout(offers: Mission[]): LoadoutSubmission {
    return {
      loadout: DEFAULT_LOADOUT,
      missionIds: offers.slice(0, MISSIONS_PER_PLAYER).map((m) => m.id),
    };
  }

  /** Every bot that has not submitted picks missions and a loadout. */
  function runBotLoadouts(state: GameState, humans: ReadonlySet<string>): GameState {
    for (const player of state.players) {
      if (state.phase !== "loadout") break;
      if (humans.has(player.id) || player.hasSubmittedLoadout) continue;

      let submission: LoadoutSubmission;
      try {
        const choice = bots.chooseLoadout(player.missionOffers, {
          playerCount: state.players.length,
          // The bots spread across the hands they could fly; seeded off the
          // game's own RNG so a recording replays the same table.
          pick: (n) => pickIndex(state, Array.from({ length: n })),
        });
        submission = { loadout: choice.loadout, missionIds: choice.missionIds };
      } catch (error) {
        log.error(
          `Bot ${player.id} failed to choose a loadout, using the default: ${String(error)}`
        );
        submission = fallbackLoadout(player.missionOffers);
      }

      let result = engineSubmitLoadout(state, player.id, submission);
      if (result.error) {
        log.error(`Bot ${player.id} loadout rejected (${result.error}), using the default`);
        result = engineSubmitLoadout(state, player.id, fallbackLoadout(player.missionOffers));
        if (result.error)
          throw new Error(`Default loadout rejected for bot ${player.id}: ${result.error}`);
      }
      state = result.state;
    }
    return state;
  }

  function fallbackDeployment(state: GameState): DeploymentChoice {
    const legal = legalDeploymentPositions(state);
    if (legal.length > 0) return legal[0];
    throw new Error("No legal deployment position on the home rings");
  }

  /** Deploy bots, in turn order, until a human has to deploy or the game starts. */
  function runBotDeployments(
    state: GameState,
    humans: ReadonlySet<string>,
    events: GameEvent[]
  ): GameState {
    while (state.phase === "deployment") {
      const bot = activePlayer(state);
      if (humans.has(bot.id)) break;

      // The bot draws from the game's seeded RNG so live games replay from their seed.
      const pick = (n: number) => pickIndex(state, Array.from({ length: n }));
      let choice: DeploymentChoice;
      try {
        choice = bots.chooseDeployment(viewFor(state, bot.id), pick);
      } catch (error) {
        log.error(`Bot ${bot.id} failed to choose a deployment: ${String(error)}`);
        choice = fallbackDeployment(state);
      }

      let result = deployShip(state, bot.id, choice.sector, choice.ring);
      if (!result.success) {
        log.error(
          `Bot ${bot.id} deployment rejected (${result.error}), placing it on the first legal position`
        );
        const fallback = fallbackDeployment(state);
        result = deployShip(state, bot.id, fallback.sector, fallback.ring);
        if (!result.success)
          throw new Error(`Fallback deployment rejected for bot ${bot.id}: ${result.error}`);
      }
      events.push(...stampEvents(result.events, state.turn));
      state = transitionToActivePhase(result.state);
    }
    return state;
  }

  function decideBotActions(state: GameState, bot: Player): PlayerAction[] {
    if (isDestroyed(bot.ship)) return []; // the engine handles the respawn turn
    try {
      return bots.decideActions(viewFor(state, bot.id)).actions;
    } catch (error) {
      botInvalidTurns++;
      console.error("[bot] AI threw while deciding; passing an empty turn", {
        turn: state.turn,
        botId: bot.id,
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      });
      return [];
    }
  }

  /** Execute bot turns until a human is active or the game ends. Each turn is committed on its own. */
  async function runBotTurns(
    gameId: string,
    state: GameState,
    humans: ReadonlySet<string>
  ): Promise<GameState> {
    // Backstop: without a human seat every player would be played as a bot.
    if (!humansAreRegistered(gameId, state, humans)) return state;

    while (state.phase === "active") {
      const bot = activePlayer(state);
      if (humans.has(bot.id)) break;
      // The game may have been deleted between two turns of this loop.
      if (!(await gameExists(gameId))) {
        log.warn(`Game ${gameId} no longer exists; stopping the bot loop`);
        break;
      }
      const turnNumber = state.turn;

      let actions = decideBotActions(state, bot);
      let result = executeTurn(state, actions);
      if (result.errors && result.errors.length > 0) {
        // The simulator is strict about this; a live game with humans in it must go on.
        botInvalidTurns++;
        console.error("[bot] turn rejected by the engine; passing an empty turn", {
          gameId,
          turn: turnNumber,
          botId: bot.id,
          actions,
          errors: result.errors,
        });
        actions = [];
        result = executeTurn(state, actions);
        if (result.errors && result.errors.length > 0) {
          throw new Error(
            `Empty turn rejected for bot ${bot.id} at T${turnNumber}: ${result.errors.join("; ")}`
          );
        }
      }

      const committed = await commitTurn(gameId, state, result.gameState, {
        turnNumber,
        playerId: bot.id,
        actions,
        events: result.events,
      });
      if (!committed.ok) {
        log.error(`Could not commit bot turn ${turnNumber} of game ${gameId}: ${committed.error}`);
        break;
      }
      state = result.gameState;
    }
    return state;
  }

  /**
   * After a setup-phase change (loadout or deployment): let bots follow, save,
   * start the recording if the game just became active, broadcast the new
   * view to everyone, then run bot turns.
   */
  async function settleSetup(
    gameId: string,
    before: GameState,
    state: GameState,
    humans: ReadonlySet<string>,
    events: GameEvent[] = []
  ): Promise<GameState> {
    if (state.phase === "loadout") state = runBotLoadouts(state, humans);
    if (state.phase === "deployment") state = runBotDeployments(state, humans, events);

    if (!(await gameExists(gameId))) {
      log.warn(`Game ${gameId} was deleted during setup; nothing was saved`);
      return state;
    }
    await saveState(gameId, state);
    if (state.phase === "active" && before.phase !== "active") {
      await recordings.init(gameId, state, humans);
    }
    broadcastView(gameId, state, events);

    if (state.phase === "active") state = await runBotTurns(gameId, state, humans);
    return state;
  }

  // -------------------------------------------------------------------------
  // Fork helpers
  // -------------------------------------------------------------------------

  /** Rewrite every reference to `oldId` so the forking human takes that seat. */
  function renamePlayerEverywhere(
    state: GameState,
    oldId: string,
    newId: string,
    newName: string
  ): GameState {
    const rename = (id: string) => (id === oldId ? newId : id);
    const renameMission = (m: Mission): Mission =>
      missionTargetsPlayer(m) && m.targetPlayerId === oldId ? { ...m, targetPlayerId: newId } : m;
    const renameIntel = (intel: Player["intel"]): Player["intel"] =>
      Object.fromEntries(Object.entries(intel).map(([id, slots]) => [rename(id), slots]));

    return {
      ...state,
      players: state.players.map((p) => ({
        ...p,
        id: rename(p.id),
        name: p.id === oldId ? newName : p.name,
        missions: p.missions.map(renameMission),
        missionOffers: p.missionOffers.map(renameMission),
        intel: renameIntel(p.intel),
      })),
      missiles: state.missiles.map((m) => ({
        ...m,
        ownerId: rename(m.ownerId),
        targetId: rename(m.targetId),
      })),
      winnerId: state.winnerId === undefined ? undefined : rename(state.winnerId),
    };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  return {
    getHumanPlayerIds,
    getBotInvalidTurnCount,

    /**
     * Dry run: what the engine would say to these actions right now, without
     * committing anything. Agents use it to never submit an illegal turn.
     */
    async previewTurn(
      gameId: string,
      playerId: string,
      actions: PlayerAction[]
    ): Promise<PreviewPayload> {
      const state = await loadState(gameId);
      if (!state) return { ok: false, error: "Game not found" };
      if (state.phase !== "active")
        return { ok: false, error: `Game is not active (phase "${state.phase}")` };
      if (activePlayer(state).id !== playerId) return { ok: false, error: "Not your turn" };
      const result = executeTurn(state, actions);
      if (result.errors && result.errors.length > 0) return { ok: false, errors: result.errors };
      return { ok: true, events: filterEventsFor(result.events, playerId) };
    },

    /** Table talk: append a line and tell every seat at the table. */
    async postChat(
      gameId: string,
      playerId: string,
      kind: ChatMessage["kind"],
      text: string
    ): Promise<Result<{ message: ChatMessage }>> {
      const state = await loadState(gameId);
      if (!state) return { ok: false, error: "Game not found" };
      const player = state.players.find((p) => p.id === playerId);
      if (!player) return { ok: false, error: "Not a player in this game" };
      const message: ChatMessage = {
        id: randomUUID(),
        gameId,
        playerId,
        name: player.name,
        kind,
        text,
        turn: state.turn,
        at: new Date().toISOString(),
      };
      await kv.rpush(chatKey(gameId), JSON.stringify(message));
      transport.broadcastViews(gameId, () => ({ type: "CHAT", payload: message }));
      return { ok: true, message };
    },

    /** Every line said at this table so far, oldest first. */
    async listChat(gameId: string): Promise<ChatMessage[]> {
      const raw = await kv.lrange(chatKey(gameId));
      return raw.map((line) => JSON.parse(line) as ChatMessage);
    },

    async createGame(
      gameId: string,
      players: PlayerSpec[],
      humanPlayerIds: Iterable<string>,
      seed?: number,
      /** What the table agreed on before the deal (points to win). */
      options?: GameOptions
    ): Promise<GameState> {
      const state = engineCreateGame(players, seed, options);
      await saveState(gameId, state);
      await setHumanPlayerIds(gameId, humanPlayerIds);
      return state;
    },

    getGame: loadState,

    async isPlayerInGame(gameId: string, playerId: string): Promise<boolean> {
      const state = await loadState(gameId);
      return state !== null && state.players.some((p) => p.id === playerId);
    },

    /**
     * Under the same lock as turn processing: a turn in flight finishes first
     * and no later write can recreate the game (every step re-checks it).
     */
    deleteGame(gameId: string): Promise<void> {
      return withGameLock(gameId, async () => {
        await kv.del(gameKey(gameId), humansKey(gameId), chatKey(gameId));
        await recordings.discard(gameId);
      });
    },

    /** The player's current view, without the event history. */
    async getView(gameId: string, playerId: string): Promise<GameView | null> {
      const state = await loadState(gameId);
      return state ? viewFor(state, playerId) : null;
    },

    /**
     * The player's current view plus the whole (filtered) event history, read
     * under the game lock so state and history are one consistent snapshot.
     *
     * `onSnapshot` runs inside that lock, right after the payload is built: the
     * socket handler joins the room there, so no turn can slip between the
     * snapshot and the join (it would be missing from both).
     */
    getViewWithHistory(
      gameId: string,
      playerId: string,
      onSnapshot?: () => void
    ): Promise<ViewPayload | null> {
      return withGameLock(gameId, async () => {
        const state = await loadState(gameId);
        if (!state) return null;
        const payload = viewPayload(state, playerId, await recordings.loadEvents(gameId));
        onSnapshot?.();
        // Reads of ended games are the retry tick for a failed archive write.
        await ensureFinalized(gameId, state);
        return payload;
      });
    },

    submitLoadout(
      gameId: string,
      playerId: string,
      submission: LoadoutSubmission
    ): Promise<Result<{ view: GameView }>> {
      return withGameLock(gameId, async () => {
        const state = await loadState(gameId);
        if (!state) return { ok: false, error: "Game not found" };
        const result = engineSubmitLoadout(state, playerId, submission);
        if (result.error) return { ok: false, error: result.error };
        const humans = await getHumanPlayerIds(gameId);
        if (!humansAreRegistered(gameId, state, humans))
          return { ok: false, error: NO_HUMANS_ERROR };
        const next = await settleSetup(gameId, state, result.state, humans);
        return { ok: true, view: viewFor(next, playerId) };
      });
    },

    deploy(
      gameId: string,
      playerId: string,
      sector: number,
      ring: number
    ): Promise<Result<{ view: GameView }>> {
      return withGameLock(gameId, async () => {
        const state = await loadState(gameId);
        if (!state) return { ok: false, error: "Game not found" };
        const result = deployShip(state, playerId, sector, ring);
        if (!result.success) return { ok: false, error: result.error };
        const humans = await getHumanPlayerIds(gameId);
        if (!humansAreRegistered(gameId, state, humans))
          return { ok: false, error: NO_HUMANS_ERROR };
        // Deployment events travel with the view; the recording only starts at the active state.
        const events = stampEvents(result.events, state.turn);
        const next = await settleSetup(
          gameId,
          state,
          transitionToActivePhase(result.state),
          humans,
          events
        );
        return { ok: true, view: viewFor(next, playerId) };
      });
    },

    /**
     * A human's turn. `expected` guards against stale or duplicate submissions:
     * it must name the turn and active player the server is actually at.
     */
    submitTurn(
      gameId: string,
      playerId: string,
      actions: PlayerAction[],
      expected: { turn: number; activePlayerId: string }
    ): Promise<Result> {
      return withGameLock(gameId, async () => {
        const state = await loadState(gameId);
        if (!state) return { ok: false, error: "Game not found" };
        if (state.phase !== "active")
          return { ok: false, error: `Game is not active (phase "${state.phase}")` };
        const active = activePlayer(state);
        if (active.id !== playerId) return { ok: false, error: "Not your turn" };
        if (expected.turn !== state.turn || expected.activePlayerId !== active.id) {
          return {
            ok: false,
            error: `Stale turn submission: the game is at turn ${state.turn}, ${active.name} to act`,
          };
        }

        const humans = await getHumanPlayerIds(gameId);
        if (!humansAreRegistered(gameId, state, humans))
          return { ok: false, error: NO_HUMANS_ERROR };

        const turnNumber = state.turn;
        const result = executeTurn(state, actions);
        if (result.errors && result.errors.length > 0) return { ok: false, errors: result.errors };

        // Nothing is broadcast and the game does not advance unless both the
        // recording and the state were written.
        const committed = await commitTurn(gameId, state, result.gameState, {
          turnNumber,
          playerId,
          actions,
          events: result.events,
        });
        if (!committed.ok) return committed;

        await runBotTurns(gameId, result.gameState, humans);
        return { ok: true };
      });
    },

    /** Continue bot turns if a game was left with a bot active (e.g. after a restart). */
    resumeBots(gameId: string): Promise<void> {
      return withGameLock(gameId, async () => {
        const state = await loadState(gameId);
        if (!state || state.phase !== "active") return;
        const humans = await getHumanPlayerIds(gameId);
        if (!humansAreRegistered(gameId, state, humans)) return;
        await runBotTurns(gameId, state, humans);
      });
    },

    /**
     * Dev tool: restore a live game to a recorded snapshot (`-1` = the initial
     * active state) and drop the turns after it.
     *
     * Refused once the game is finished and its recording finalized: that
     * recording is served by the public API, and rewinding would rewrite a
     * published game. Rewind is a live-game tool only.
     */
    rewindGame(
      gameId: string,
      playerId: string,
      turnIndex: number
    ): Promise<Result<{ view: GameView }>> {
      return withGameLock(gameId, async () => {
        const state = await loadState(gameId);
        if (!state) return { ok: false, error: "Game not found" };
        if (state.phase === "ended" && (await recordings.isFinalized(gameId))) {
          return {
            ok: false,
            error: "This game is finished and its recording is published; fork it instead",
          };
        }
        const recording = await recordings.load(gameId);
        if (!recording) return { ok: false, error: "No recording for this game" };
        if (turnIndex < -1 || turnIndex >= recording.turns.length) {
          return {
            ok: false,
            error: `turnIndex ${turnIndex} out of range (-1..${recording.turns.length - 1})`,
          };
        }
        const snapshot =
          turnIndex === -1
            ? recording.initialState
            : recording.turns[turnIndex].resultingStateSnapshot;
        if (snapshot.phase !== "active" && snapshot.phase !== "ended") {
          return { ok: false, error: `Cannot rewind into a "${snapshot.phase}" snapshot` };
        }
        // A snapshot recorded before `pointsToWin` rode on the state was
        // played to the default; give it back the field so the game reads it.
        const restored: GameState = restoreRecordedState({
          ...snapshot,
          phase: "active",
          winnerId: undefined,
        });

        await recordings.truncate(gameId, turnIndex);
        await saveState(gameId, restored);
        transport.broadcastViews(gameId, (recipient) => ({
          type: "TURN_EXECUTED",
          payload: {
            ...viewPayload(restored, recipient, []),
            playerId,
            turnNumber: restored.turn,
            rewind: true,
          },
        }));

        const humans = await getHumanPlayerIds(gameId);
        if (!humansAreRegistered(gameId, restored, humans))
          return { ok: true, view: viewFor(restored, playerId) };
        const next = await runBotTurns(gameId, restored, humans);
        return { ok: true, view: viewFor(next, playerId) };
      });
    },

    /**
     * Dev tool: start a new live game from a **finished** recording, with the
     * caller taking over one of the recorded seats. Everyone else is a bot.
     *
     * Only archived (finalized) recordings can be forked. A live recording
     * holds every player's missions, intel and the RNG state, so forking one
     * would hand the caller a seat with full sight of a game still being
     * played, including their opponents' hidden information.
     */
    async forkGameFromRecording(
      recordingId: string,
      turnIndex: number,
      options: ForkOptions
    ): Promise<Result<{ gameId: string; view: GameView }>> {
      const recording = await recordings.loadArchived(recordingId);
      if (!recording) {
        return { ok: false, error: "Recording not found; only finished recordings can be forked" };
      }
      if (!recording.finalState) {
        return {
          ok: false,
          error: "That recording is not finished; only finished recordings can be forked",
        };
      }
      if (turnIndex < -1 || turnIndex >= recording.turns.length) {
        return {
          ok: false,
          error: `turnIndex ${turnIndex} out of range (-1..${recording.turns.length - 1})`,
        };
      }
      const seat = options.impersonateOriginalPlayerId;
      if (!seat)
        return {
          ok: false,
          error: "impersonateOriginalPlayerId is required: choose the recorded player to take over",
        };

      const snapshot =
        turnIndex === -1
          ? recording.initialState
          : recording.turns[turnIndex].resultingStateSnapshot;
      if (snapshot.phase !== "active" && snapshot.phase !== "ended") {
        return {
          ok: false,
          error: `Cannot fork from a "${snapshot.phase}" snapshot; pick a turn after deployment`,
        };
      }
      if (!snapshot.players.some((p) => p.id === seat)) {
        return { ok: false, error: `Player "${seat}" not found in recording` };
      }
      // Taking a seat renames it to the caller: if the caller already sits in
      // another seat of the recording, the fork would hold two players with
      // the same id.
      if (snapshot.players.some((p) => p.id === options.humanPlayerId && p.id !== seat)) {
        return {
          ok: false,
          error: `You already hold seat "${options.humanPlayerId}" in this recording; fork that seat instead`,
        };
      }
      // Only a bot seat, or the caller's own seat, may be taken over: any other
      // human's seat would expose that player's missions, cargo and intel.
      const seatKind = recording.metadata.playerKinds.find((k) => k.playerId === seat)?.kind;
      if (seat !== options.humanPlayerId && seatKind !== "bot") {
        return {
          ok: false,
          error: `Seat "${seat}" was played by another human; you may only fork a bot seat or your own`,
        };
      }

      const forked = renamePlayerEverywhere(
        // As in `rewind`: a recording from before `pointsToWin` existed was
        // played to the default, so that is what the fork carries on with.
        restoreRecordedState({ ...snapshot, phase: "active", winnerId: undefined }),
        seat,
        options.humanPlayerId,
        options.humanPlayerName
      );
      const gameId = `fork-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const humans = [options.humanPlayerId];
      await saveState(gameId, forked);
      await setHumanPlayerIds(gameId, humans);
      await recordings.init(
        gameId,
        forked,
        new Set(humans),
        `fork from ${recording.recordingId} @ turn ${turnIndex}`
      );
      return { ok: true, gameId, view: viewFor(forked, options.humanPlayerId) };
    },
  };
}
