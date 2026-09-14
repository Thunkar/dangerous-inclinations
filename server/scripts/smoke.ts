/**
 * End-to-end smoke test for the game service: one human and two bots through
 * loadout, deployment and ten turns, with no Redis and no sockets. Persistence
 * is an in-memory Kv and the transport just records what would have been sent,
 * which is exactly what we want to inspect.
 *
 * It asserts the hidden-information contract of docs/protocol.md: nothing the
 * human receives may contain another player's missions, the RNG state, or the
 * identity of a face-down tile.
 *
 *   node --experimental-transform-types --import ./scripts/engine-source-loader.mjs scripts/smoke.ts
 *
 * Add STUB_AI=1 while engine/src/ai is mid-rewrite (see engine-source-loader.mjs).
 */
import type { GameRecording } from "@dangerous-inclinations/engine";
import { DEFAULT_LOADOUT, MISSIONS_PER_PLAYER } from "@dangerous-inclinations/engine";
import type { WebSocket } from "@fastify/websocket";
import { memoryKv } from "../src/services/kv.ts";
import { createRecordingService, type RecordingArchive } from "../src/services/recordingService.ts";
import { createGameService, type GameTransport } from "../src/services/gameService.ts";
import { checkStatusAccess } from "../src/services/playerService.ts";
import { SubmitTurnSchema } from "../src/schemas/game.ts";
import {
  broadcastViews as roomBroadcastViews,
  getConnectedPlayers,
  registerConnection,
  releaseConnection,
  unregisterConnection,
} from "../src/websocket/rooms.ts";
import type { ServerGameMessage } from "../src/protocol.ts";

const HUMAN = "human-ada";
const BOT_A = "bot-alpha";
const BOT_B = "bot-beta";
// The human sits second so bots both deploy before and after it.
const SPECS = [
  { id: BOT_A, name: "Bot Alpha" },
  { id: HUMAN, name: "Ada" },
  { id: BOT_B, name: "Bot Beta" },
];
const GAME_ID = "smoke-game";
const SEED = 20260914;
const TURNS = 10;

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

const failures: string[] = [];
let checks = 0;

function check(ok: boolean, label: string): void {
  checks++;
  if (!ok) failures.push(label);
}

/** Every key path in a JSON value, for "this must not appear anywhere" checks. */
function* walk(value: unknown, path = "$"): Generator<{ path: string; key: string; value: unknown }> {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* walk(value[i], `${path}[${i}]`);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      yield { path: `${path}.${key}`, key, value: child };
      yield* walk(child, `${path}.${key}`);
    }
  }
}

/** Server-authoritative fields that must never cross the wire. */
const SECRET_KEYS = ["rngState", "rngSeed", "nextEntityId", "resultingStateSnapshot", "initialState"];

let hiddenOpponentSlots = 0;
let visibleOpponentSlots = 0;
let ownSlotsSeen = 0;

function inspectHumanMessage(message: ServerGameMessage, index: number): void {
  const where = `message ${index} (${message.type})`;

  for (const { path, key } of walk(message)) {
    if (SECRET_KEYS.includes(key)) failures.push(`${where}: leaked "${key}" at ${path}`);
  }
  checks++;

  if (message.type !== "GAME_VIEW" && message.type !== "TURN_EXECUTED") return;
  const { view, events } = message.payload;

  check(view.me === null || view.me.id === HUMAN, `${where}: view.me is the recipient`);

  for (const player of view.players) {
    if (player.id === HUMAN) {
      // Positive control: redaction must not blank out the recipient's own mat.
      check(player.isMe === true, `${where}: the human's own entry is flagged isMe`);
      if (player.hasSubmittedLoadout) {
        ownSlotsSeen += player.slots.length;
        check(
          player.slots.every((s) => s.type !== null && s.knownVia === "own"),
          `${where}: the human sees all of its own tiles`,
        );
      }
      continue;
    }
    const keys = Object.keys(player);
    for (const forbidden of ["missions", "missionOffers", "intel", "cargo", "loadout"]) {
      check(!keys.includes(forbidden), `${where}: opponent ${player.id} exposes "${forbidden}"`);
    }
    for (const slot of player.slots) {
      if (slot.type === null) {
        hiddenOpponentSlots++;
        check(slot.knownVia === null, `${where}: opponent ${player.id} slot ${slot.id} is face-down but has knownVia`);
      } else {
        visibleOpponentSlots++;
        check(
          slot.knownVia === "revealed" || slot.knownVia === "scanned",
          `${where}: opponent ${player.id} slot ${slot.id} shows type "${slot.type}" via "${slot.knownVia}"`,
        );
      }
    }
  }

  for (const event of events) {
    check(
      !event.privateTo || event.privateTo.includes(HUMAN),
      `${where}: private event "${event.type}" not addressed to the human`,
    );
  }

  if (message.type === "TURN_EXECUTED") {
    const hasActions = "actions" in message.payload && message.payload.actions !== undefined;
    check(
      hasActions === (message.payload.playerId === HUMAN),
      `${where}: actions included iff the human acted (actor ${message.payload.playerId}, actions ${hasActions})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const toHuman: ServerGameMessage[] = [];
const messageCounts = new Map<string, number>();

const transport: GameTransport = {
  sendToPlayer(_gameId, playerId, message) {
    record(playerId, message);
  },
  broadcastViews(_gameId, build) {
    // Every player is treated as connected so bot messages are built too.
    for (const spec of SPECS) record(spec.id, build(spec.id));
  },
};

function record(playerId: string, message: ServerGameMessage): void {
  messageCounts.set(message.type, (messageCounts.get(message.type) ?? 0) + 1);
  if (playerId !== HUMAN) return;
  // Serialize exactly as the socket would, then inspect the result.
  const onTheWire = JSON.parse(JSON.stringify(message)) as ServerGameMessage;
  toHuman.push(onTheWire);
  inspectHumanMessage(onTheWire, toHuman.length - 1);
}

const kv = memoryKv();
const recordings = createRecordingService(kv, null);
const games = createGameService({ kv, recordings, transport });

function fail(message: string): never {
  console.error(`\nsmoke: ${message}`);
  process.exit(1);
}

console.log("smoke: creating the game (1 human, 2 bots)");
await games.createGame(GAME_ID, SPECS, [HUMAN], SEED);

// --- Loadout -----------------------------------------------------------------
const loadoutView = await games.getView(GAME_ID, HUMAN);
if (!loadoutView?.me) fail("no view for the human after createGame");
check(loadoutView.phase === "loadout", "game starts in the loadout phase");
const offers = loadoutView.me.missionOffers;
check(offers.length === 5, `the human is offered 5 missions (got ${offers.length})`);

const loadoutResult = await games.submitLoadout(GAME_ID, HUMAN, {
  loadout: DEFAULT_LOADOUT,
  missionIds: offers.slice(0, MISSIONS_PER_PLAYER).map((m) => m.id),
});
if (!loadoutResult.ok) fail(`human loadout rejected: ${loadoutResult.error}`);

const afterLoadout = await games.getView(GAME_ID, HUMAN);
if (!afterLoadout) fail("no view after the loadout phase");
check(afterLoadout.me?.missions.length === MISSIONS_PER_PLAYER, "the human keeps its own 3 missions in its view");
check(afterLoadout.phase === "deployment", `bots submit their loadouts too (phase ${afterLoadout.phase})`);
check(
  afterLoadout.players.every((p) => p.hasSubmittedLoadout),
  "every player has a loadout once the human submits",
);
console.log(`smoke: loadouts done, phase ${afterLoadout.phase}`);

// --- Deployment --------------------------------------------------------------
check(
  afterLoadout.players.find((p) => p.id === BOT_A)?.hasDeployed === true,
  "the bot before the human deployed on its own",
);
check(afterLoadout.activePlayerId === HUMAN, `the human is next to deploy (got ${afterLoadout.activePlayerId})`);

// Everyone deploys on Black Hole Ring 4; any sector nobody has taken yet.
const free = new Set(Array.from({ length: 24 }, (_, i) => i));
for (const p of afterLoadout.players) {
  if (p.ship && p.hasDeployed) free.delete(p.ship.sector);
}
const deployResult = await games.deploy(GAME_ID, HUMAN, [...free][0]);
if (!deployResult.ok) fail(`human deployment rejected: ${deployResult.error}`);

const afterDeploy = await games.getView(GAME_ID, HUMAN);
if (!afterDeploy) fail("no view after deployment");
check(afterDeploy.phase === "active", `the game is active once everyone deployed (phase ${afterDeploy.phase})`);
check(afterDeploy.players.every((p) => p.hasDeployed), "every player deployed");
console.log(`smoke: deployment done, turn ${afterDeploy.turn}, ${afterDeploy.activePlayerId} to act`);

// --- Stale submission --------------------------------------------------------
const stale = await games.submitTurn(GAME_ID, HUMAN, [], { turn: 999, activePlayerId: HUMAN });
check(!stale.ok, "a stale SUBMIT_TURN is rejected");

const wrongSeat = await games.submitTurn(GAME_ID, BOT_A, [], { turn: afterDeploy.turn, activePlayerId: BOT_A });
check(!wrongSeat.ok, "a turn submitted for someone else's seat is rejected");

// --- Turns -------------------------------------------------------------------
let played = 0;
for (let i = 0; i < TURNS; i++) {
  const view = await games.getView(GAME_ID, HUMAN);
  if (!view) fail("game disappeared mid-run");
  if (view.phase !== "active") {
    console.log(`smoke: game ended after ${played} human turns (winner ${view.winnerId ?? "none"})`);
    break;
  }
  if (view.activePlayerId !== HUMAN) fail(`turn ${view.turn}: expected the human to be active, got ${view.activePlayerId}`);

  const result = await games.submitTurn(GAME_ID, HUMAN, [], { turn: view.turn, activePlayerId: HUMAN });
  if (!result.ok) fail(`turn ${view.turn} rejected: ${result.error ?? result.errors?.join("; ")}`);
  played++;
}
check(played > 0, "the human played at least one turn");
check(ownSlotsSeen > 0, "the human's own tiles were checked at least once");

// --- Recording ---------------------------------------------------------------
const recording = await recordings.load(GAME_ID);
check(recording !== null, "a recording was started when the game became active");
check(recording !== null && recording.schemaVersion === 2, "the recording uses schema v2");
check(
  recording !== null && recording.turns.every((t) => Array.isArray(t.events)),
  "every recorded turn carries its events",
);
check(
  recording !== null && recording.turns.length >= played,
  `the recording holds every executed turn (${recording?.turns.length ?? 0} for ${played} human turns)`,
);

const history = await games.getViewWithHistory(GAME_ID, HUMAN);
check(history !== null && history.events.length > 0, "the filtered event history is non-empty");
check(
  history !== null && history.events.every((e) => !e.privateTo || e.privateTo.includes(HUMAN)),
  "the event history is filtered for the human",
);

// --- Action validation (malformed payloads never reach the engine) -----------
// The socket handler answers TURN_ERROR whenever this parse fails, so a
// malformed action fails the whole submission instead of becoming a coast.
function accepts(actions: unknown[]): boolean {
  return SubmitTurnSchema.safeParse({
    type: "SUBMIT_TURN",
    payload: { actions, turn: 1, activePlayerId: HUMAN },
  }).success;
}

const goodBurn = { playerId: HUMAN, type: "burn", sequence: 1, data: { burnIntensity: "soft", sectorAdjustment: 0 } };
check(accepts([goodBurn]), "a well-formed burn is accepted");
check(
  accepts([
    { playerId: HUMAN, type: "allocate_energy", data: { subsystemId: "engines", amount: 2 } },
    { playerId: HUMAN, type: "coast", sequence: 1, data: { activateScoop: true } },
  ]),
  "a well-formed energy + coast turn is accepted",
);
check(
  !accepts([{ ...goodBurn, data: { burnIntensity: "soft", sectorAdjustment: "0" } }]),
  'a burn with sectorAdjustment "0" (string) is rejected',
);
check(!accepts([{ ...goodBurn, data: { burnIntensity: "soft", sectorAdjustment: 1.5 } }]), "a fractional sectorAdjustment is rejected");
check(!accepts([{ ...goodBurn, data: { burnIntensity: "ludicrous", sectorAdjustment: 0 } }]), "an unknown burn intensity is rejected");
check(!accepts([{ ...goodBurn, data: { burnIntensity: "soft" } }]), "a burn missing sectorAdjustment is rejected");
check(!accepts([{ ...goodBurn, sequence: 0 }]), "sequence 0 is rejected (clients number from 1)");
check(!accepts([{ ...goodBurn, playerId: "" }]), "an empty playerId is rejected");
check(!accepts([{ ...goodBurn, extra: true }]), "an action with unknown fields is rejected");
check(!accepts([goodBurn, { ...goodBurn, data: { burnIntensity: "soft", sectorAdjustment: null } }]), "one bad action rejects the whole submission");
check(
  !accepts([{ playerId: HUMAN, type: "rotate", sequence: 1, data: { targetFacing: "sideways" } }]),
  "an unknown facing is rejected",
);
check(
  !accepts([{ playerId: HUMAN, type: "allocate_energy", data: { subsystemId: "engines", amount: 1.5 } }]),
  "a fractional energy amount is rejected",
);
check(
  !accepts([{ playerId: HUMAN, type: "deploy_ship", data: { wellId: "planet-alpha", sector: 3 } }]),
  "deploy_ship is rejected inside SUBMIT_TURN",
);
check(!accepts([{ playerId: HUMAN, type: "self_destruct", data: {} }]), "an unknown action type is rejected");
check(
  !SubmitTurnSchema.safeParse({ type: "SUBMIT_TURN", payload: { actions: [], turn: "1", activePlayerId: HUMAN } }).success,
  "a non-numeric turn is rejected",
);

// --- Status access (a player only ever reads its own view) -------------------
const ownStatus = checkStatusAccess(HUMAN, HUMAN);
check(ownStatus.ok && ownStatus.playerId === HUMAN, "a player may read its own status");
const otherStatus = checkStatusAccess(HUMAN, BOT_A);
check(!otherStatus.ok && otherStatus.code === 403, "asking for another player's status is a 403");
const anonStatus = checkStatusAccess(undefined, HUMAN);
check(!anonStatus.ok && anonStatus.code === 401, "a status request without x-player-id is a 401");

// --- Forking (finished recordings only, and only a seat you may take) --------
const liveFork = await games.forkGameFromRecording(GAME_ID, -1, {
  impersonateOriginalPlayerId: BOT_A,
  humanPlayerId: HUMAN,
  humanPlayerName: "Ada",
});
check(!liveFork.ok, "forking the recording of a game still being played is refused");

if (recording) {
  // The same game, but finished and archived: that one may be forked.
  const archived: GameRecording = {
    ...recording,
    recordingId: "smoke-archived",
    finalState: recording.turns[recording.turns.length - 1].resultingStateSnapshot,
    metadata: {
      ...recording.metadata,
      endReason: "victory",
      playerKinds: [
        { playerId: BOT_A, kind: "bot" },
        { playerId: HUMAN, kind: "human" },
        { playerId: BOT_B, kind: "bot" },
      ],
    },
  };
  const archive: RecordingArchive = {
    list: async () => [],
    load: async (id) => (id === archived.recordingId ? archived : null),
    write: async () => {},
  };
  const forkKv = memoryKv();
  const forkGames = createGameService({
    kv: forkKv,
    recordings: createRecordingService(forkKv, archive),
    transport: { sendToPlayer: () => {}, broadcastViews: () => {} },
  });

  const outsider = "human-grace";
  const botSeat = await forkGames.forkGameFromRecording("smoke-archived", -1, {
    impersonateOriginalPlayerId: BOT_A,
    humanPlayerId: outsider,
    humanPlayerName: "Grace",
  });
  check(botSeat.ok, `a bot seat of a finished recording can be forked (${botSeat.ok ? "" : botSeat.error})`);

  const ownSeat = await forkGames.forkGameFromRecording("smoke-archived", -1, {
    impersonateOriginalPlayerId: HUMAN,
    humanPlayerId: HUMAN,
    humanPlayerName: "Ada",
  });
  check(ownSeat.ok, `a player may fork its own seat (${ownSeat.ok ? "" : ownSeat.error})`);

  const stolenSeat = await forkGames.forkGameFromRecording("smoke-archived", -1, {
    impersonateOriginalPlayerId: HUMAN,
    humanPlayerId: outsider,
    humanPlayerName: "Grace",
  });
  check(!stolenSeat.ok, "another human's seat cannot be impersonated");

  const duplicateId = await forkGames.forkGameFromRecording("smoke-archived", -1, {
    impersonateOriginalPlayerId: BOT_A,
    humanPlayerId: HUMAN,
    humanPlayerName: "Ada",
  });
  check(!duplicateId.ok, "impersonating a seat while already holding another is refused (duplicate player ids)");

  const missingRecording = await forkGames.forkGameFromRecording("does-not-exist", -1, {
    impersonateOriginalPlayerId: BOT_A,
    humanPlayerId: outsider,
    humanPlayerName: "Grace",
  });
  check(!missingRecording.ok, "forking an unknown recording is refused");
}

// --- Room membership (one player, several tabs) ------------------------------
const OPEN = 1;
const CLOSED = 3;

function fakeSocket() {
  const sent: string[] = [];
  return { readyState: OPEN as number, sent, send: (data: string) => sent.push(data) };
}
const asSocket = (s: ReturnType<typeof fakeSocket>) => s as unknown as WebSocket;

const ROOM = "tabs-game";
const tabA = fakeSocket();
const tabB = fakeSocket();
registerConnection("game", ROOM, HUMAN, asSocket(tabA));
registerConnection("game", ROOM, HUMAN, asSocket(tabB));
roomBroadcastViews("game", ROOM, (id) => ({ type: "PING", id }));
check(tabA.sent.length === 1 && tabB.sent.length === 1, "every tab of a player receives the broadcast");

tabA.readyState = CLOSED;
unregisterConnection("game", ROOM, HUMAN, asSocket(tabA));
check(getConnectedPlayers("game", ROOM).has(HUMAN), "closing one tab leaves the player connected (no game deletion)");
roomBroadcastViews("game", ROOM, (id) => ({ type: "PING", id }));
check(tabB.sent.length === 2 && tabA.sent.length === 1, "the surviving tab keeps receiving, the closed one does not");

// A third tab joining buffers until its own initial view has been sent.
const joining = fakeSocket();
registerConnection("game", ROOM, HUMAN, asSocket(joining), { buffered: true });
roomBroadcastViews("game", ROOM, (id) => ({ type: "TURN_EXECUTED", id }));
check(joining.sent.length === 0, "a joining socket holds turn messages until its GAME_VIEW is sent");
releaseConnection("game", ROOM, HUMAN, asSocket(joining));
check(joining.sent.length === 1, "held messages are delivered once the handshake completes");

joining.readyState = CLOSED;
tabB.readyState = CLOSED;
unregisterConnection("game", ROOM, HUMAN, asSocket(joining));
unregisterConnection("game", ROOM, HUMAN, asSocket(tabB));
check(!getConnectedPlayers("game", ROOM).has(HUMAN), "the player only counts as gone once every tab is closed");

// --- Turn commits are all-or-nothing -----------------------------------------
// A separate little game, with a Kv that can be broken on demand: a failed
// write must leave the game exactly where it was.
async function freshGame(archive: RecordingArchive | null = null) {
  const gameKv = memoryKv();
  const gameRecordings = createRecordingService(gameKv, archive);
  const gameId = "smoke-atomic";
  const gameGames = createGameService({
    kv: gameKv,
    recordings: gameRecordings,
    transport: { sendToPlayer: () => {}, broadcastViews: () => {} },
    log: { info: () => {}, warn: () => {}, error: () => {} },
  });
  await gameGames.createGame(gameId, SPECS, [HUMAN], SEED);
  const first = await gameGames.getView(gameId, HUMAN);
  await gameGames.submitLoadout(gameId, HUMAN, {
    loadout: DEFAULT_LOADOUT,
    missionIds: first!.me!.missionOffers.slice(0, MISSIONS_PER_PLAYER).map((m) => m.id),
  });
  const deployed = await gameGames.getView(gameId, HUMAN);
  const used = new Set(deployed!.players.filter((p) => p.hasDeployed && p.ship).map((p) => p.ship!.sector));
  const freeSector = [...Array(24).keys()].find((sector) => !used.has(sector))!;
  await gameGames.deploy(gameId, HUMAN, freeSector);
  return { kv: gameKv, games: gameGames, recordings: gameRecordings, gameId };
}

{
  const atomic = await freshGame();
  const at = await atomic.games.getView(atomic.gameId, HUMAN);
  const recordedBefore = (await atomic.recordings.load(atomic.gameId))!.turns.length;
  const saveState = atomic.kv.set.bind(atomic.kv);
  atomic.kv.set = async (key, value) => {
    if (key === `game:${atomic.gameId}`) throw new Error("smoke: simulated Redis failure");
    return saveState(key, value);
  };
  const broken = await atomic.games.submitTurn(atomic.gameId, HUMAN, [], { turn: at!.turn, activePlayerId: HUMAN });
  atomic.kv.set = saveState;

  check(!broken.ok, "a turn whose state write fails is reported as an error");
  const unchanged = await atomic.games.getView(atomic.gameId, HUMAN);
  check(unchanged!.turn === at!.turn && unchanged!.activePlayerId === HUMAN, "the failed turn did not advance the game");
  check(
    (await atomic.recordings.load(atomic.gameId))!.turns.length === recordedBefore,
    "the failed turn left no trace in the recording",
  );
  const retried = await atomic.games.submitTurn(atomic.gameId, HUMAN, [], { turn: at!.turn, activePlayerId: HUMAN });
  check(retried.ok, "the same turn succeeds once the write works again");
}

// --- Rewind is a live-game tool ----------------------------------------------
{
  const archived: GameRecording[] = [];
  const archive: RecordingArchive = {
    list: async () => [],
    load: async (id) => archived.find((r) => r.recordingId === id) ?? null,
    write: async (r) => {
      archived.push(r);
    },
  };
  const live = await freshGame(archive);
  const at = await live.games.getView(live.gameId, HUMAN);
  await live.games.submitTurn(live.gameId, HUMAN, [], { turn: at!.turn, activePlayerId: HUMAN });
  check((await live.games.rewindGame(live.gameId, HUMAN, -1)).ok, "a live game can be rewound");

  const ended = { ...(await live.games.getGame(live.gameId))!, phase: "ended" as const, winnerId: HUMAN };
  await live.kv.set(`game:${live.gameId}`, JSON.stringify(ended));
  await live.recordings.finalize(live.gameId, ended, "victory");
  check(archived.length === 1, "the finished game was archived");
  check(!(await live.games.rewindGame(live.gameId, HUMAN, -1)).ok, "a finished, published game cannot be rewound");
}

// --- Report ------------------------------------------------------------------
console.log(`\nsmoke: ${toHuman.length} messages to the human`);
for (const [type, count] of [...messageCounts].sort()) console.log(`  ${type.padEnd(14)} ${count}`);
console.log(`  opponent slots: ${hiddenOpponentSlots} face-down, ${visibleOpponentSlots} face-up`);
console.log(`  own slots seen in full: ${ownSlotsSeen}`);
console.log(`  bot turns rejected by the engine: ${games.getBotInvalidTurnCount()}`);

const unique = [...new Set(failures)];
if (unique.length > 0) {
  console.error(`\nsmoke: FAILED — ${unique.length} of ${checks} checks`);
  for (const failure of unique.slice(0, 40)) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`\nsmoke: OK — ${checks} checks passed`);
