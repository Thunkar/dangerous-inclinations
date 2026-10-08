/**
 * End-to-end smoke test for the game service: one human and two bots through
 * loadout, deployment and ten turns, then a hand-built board where the human's
 * turns power, fire, scan, repair, name a dock sale and mark an Escort, with no
 * Redis and no sockets. Persistence is an in-memory Kv and the transport just
 * records what would have been sent, which is exactly what we want to inspect.
 *
 * It asserts the hidden-information contract of docs/protocol.md: nothing the
 * human receives may contain another player's missions, the RNG state, or the
 * identity of a face-down tile.
 *
 *   node --experimental-transform-types --import ./scripts/engine-source-loader.mjs scripts/smoke.ts
 */
import type { Cargo, GameRecording, GameState, PlayerAction } from "@dangerous-inclinations/engine";
import {
  DEFAULT_LOADOUT,
  DEFAULT_SHIP_APPEARANCE,
  DEPLOYMENT_GAP,
  HOME_RINGS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MISSIONS_PER_PLAYER,
  MISSION_OFFERS_PER_PLAYER,
  PRIMARIES_PER_PLAYER,
  RECORDING_SCHEMA_VERSION,
  SECONDARIES_PER_PLAYER,
  isPrimaryType,
  legalDeploymentsAgainst,
  placedShipPositions,
  samePosition,
  ringVelocity,
  wrapSector,
  type EscortMission,
  type GameEvent,
  type MissionType,
  type ShipLoadout,
} from "@dangerous-inclinations/engine";

/**
 * A loadout that can fly any hand the deal produces: the sensor array and a gun
 * are the only tiles a card asks for (Intercept and Destroy), so the smoke run
 * never has to care which three cards it kept.
 */
const SMOKE_LOADOUT: ShipLoadout = {
  forwardSlots: ["sensor_array"],
  sideSlots: ["laser", "laser", "shields", "missiles"],
};
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "@fastify/websocket";
import { memoryKv } from "../src/services/kv.ts";
import {
  createRecordingArchive,
  createRecordingService,
  type RecordingArchive,
} from "../src/services/recordingService.ts";
import {
  createGameService,
  engineBots,
  serializeGame,
  StaleGameError,
  type BotStrategy,
  type GameTransport,
} from "../src/services/gameService.ts";
import { checkPlayerAccess } from "../src/services/playerService.ts";
import {
  ForkSchema,
  LoadoutSubmissionSchema,
  PreviewSchema,
  SubmitTurnSchema,
} from "../src/schemas/game.ts";
import { answerSubmission, connectedMessage } from "../src/websocket/submission.ts";
// Board-building helpers for the canned position (they import no test runner).
import {
  BH,
  escortMission,
  makeGameState,
  makePlayer,
  surveyMission,
  withShip,
  withSub,
} from "../../engine/src/test/testUtils.ts";
import { CreatePlayerSchema } from "../src/schemas/player.ts";
import { CreateLobbySchema } from "../src/schemas/lobby.ts";
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
// The human sits second so bots place both before and after it (placing runs in
// reverse turn order: the last seat first).
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
const SECRET_KEYS = [
  "rngState",
  "rngSeed",
  "nextEntityId",
  "forcedRollValue",
  "resultingStateSnapshot",
  "initialState",
];

/** A wreck on the wire is where it lies and nothing else. */
const WRECK_KEYS = ["id", "wellId", "ring", "sector"];
/** Events about the board everyone sees: none may be addressed to anyone. */
const PUBLIC_EVENTS: ReadonlyArray<GameEvent["type"]> = [
  "wreck_left",
  "wreck_salvaged",
  "escort_marked",
  "escort_released",
  "stations_moved",
];

let hiddenOpponentSlots = 0;
let wrecksSeen = 0;
let escortMarkersSeen = 0;
let holdItemsSeen = 0;
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

  for (const wreck of view.wrecks) {
    wrecksSeen++;
    const keys = Object.keys(wreck).sort();
    check(
      keys.length === WRECK_KEYS.length && WRECK_KEYS.every((k) => keys.includes(k)),
      `${where}: wreck ${wreck.id} carries only its position (${keys.join(", ")})`,
    );
  }
  for (const player of view.players) {
    escortMarkersSeen += player.escortedBy.length;
    check(
      player.escortedBy.every((id) => view.players.some((p) => p.id === id)),
      `${where}: ${player.id}'s Escort markers name seats at the table`,
    );
  }

  for (const player of view.players) {
    if (player.id === HUMAN) {
      // Positive control: redaction must not blank out the recipient's own loadout.
      check(player.isMe === true, `${where}: the human's own entry is flagged isMe`);
      if (player.hasSubmittedLoadout) {
        ownSlotsSeen += player.slots.length;
        check(
          player.slots.every((s) => s.type !== null && s.knownVia === "own"),
          `${where}: the human sees all of its own subsystems`,
        );
      }
      continue;
    }
    const keys = Object.keys(player);
    for (const forbidden of ["missions", "missionOffers", "intel", "cargo", "loadout"]) {
      check(!keys.includes(forbidden), `${where}: opponent ${player.id} exposes "${forbidden}"`);
    }
    for (const item of player.hold) {
      holdItemsSeen++;
      const itemKeys = Object.keys(item).sort().join(",");
      // An item is its kind and an opaque token: nothing says which card it is for.
      check(
        itemKeys === "cargoId,kind" && /^item-\d+$/.test(item.cargoId),
        `${where}: opponent ${player.id}'s hold item is a kind and an opaque token (${JSON.stringify(item)})`,
      );
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
    if (PUBLIC_EVENTS.includes(event.type)) {
      check(event.privateTo === undefined, `${where}: "${event.type}" is public`);
    }
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

/** A reply the socket sends only to the human (CONNECTED, TURN_ERROR): recorded and inspected the same way. */
function recordReply(message: ServerGameMessage | null): ServerGameMessage | null {
  if (message) record(HUMAN, message);
  return message;
}

/** A raw SUBMIT_TURN from the human, through the socket's own handler. */
function submitRaw(service: typeof games, gameId: string, body: unknown): Promise<ServerGameMessage | null> {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return answerSubmission(service, gameId, HUMAN, raw).then(recordReply);
}

function submitTurnMessage(actions: unknown[], turn: number, activePlayerId = HUMAN) {
  return { type: "SUBMIT_TURN", payload: { actions, turn, activePlayerId } };
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
/** One primary and any two secondaries: a legal hand. */
function handFrom(cards: ReadonlyArray<{ id: string; type: MissionType }>): string[] {
  const primary = cards.filter((m) => isPrimaryType(m.type)).slice(0, PRIMARIES_PER_PLAYER);
  const secondaries = cards
    .filter((m) => !isPrimaryType(m.type))
    .slice(0, SECONDARIES_PER_PLAYER);
  return [...primary, ...secondaries].map((m) => m.id);
}

const offers = loadoutView.me.missionOffers;
check(
  offers.length === MISSION_OFFERS_PER_PLAYER,
  `the human is offered ${MISSION_OFFERS_PER_PLAYER} missions (got ${offers.length})`
);

const cosmetic = { ...DEFAULT_SHIP_APPEARANCE, paint: "#344149", secondaryPaint: "#b6a27b" };
check(
  LoadoutSubmissionSchema.safeParse({
    loadout: SMOKE_LOADOUT,
    missionIds: ["x"],
    appearance: cosmetic,
  }).success,
  "appearance passes the wire schema"
);
check(
  !LoadoutSubmissionSchema.safeParse({
    loadout: SMOKE_LOADOUT,
    missionIds: ["x"],
    appearance: { ...cosmetic, accent: "#ffffff" },
  }).success,
  "the wire schema rejects a custom identity accent"
);
check(
  LoadoutSubmissionSchema.safeParse({ loadout: SMOKE_LOADOUT, missionIds: ["x"] }).success,
  "a submission without appearance passes (seat agents paint nothing)"
);
const loadoutResult = await games.submitLoadout(GAME_ID, HUMAN, {
  loadout: SMOKE_LOADOUT,
  appearance: cosmetic,
  // A hand is one primary and two secondaries (RULES §Missions).
  missionIds: handFrom(offers),
});
if (!loadoutResult.ok) fail(`human loadout rejected: ${loadoutResult.error}`);

const afterLoadout = await games.getView(GAME_ID, HUMAN);
if (!afterLoadout) fail("no view after the loadout phase");
check(
  afterLoadout.me?.appearance?.paint === cosmetic.paint,
  "appearance persists through the service"
);
check(
  afterLoadout.players.find((p) => p.id === HUMAN)?.appearance?.paint === cosmetic.paint,
  "public views include submitted paint"
);
check(afterLoadout.me?.missions.length === MISSIONS_PER_PLAYER, "the human keeps its own 3 missions in its view");
check(afterLoadout.phase === "deployment", `bots submit their loadouts too (phase ${afterLoadout.phase})`);
check(
  afterLoadout.players.every((p) => p.hasSubmittedLoadout),
  "every player has a loadout once the human submits",
);
console.log(`smoke: loadouts done, phase ${afterLoadout.phase}`);

// --- Deployment --------------------------------------------------------------
check(
  afterLoadout.players.find((p) => p.id === BOT_B)?.hasDeployed === true,
  "the last seat placed first, on its own",
);
check(
  afterLoadout.players.find((p) => p.id === BOT_A)?.hasDeployed !== true,
  "the first seat places last",
);
check(afterLoadout.activePlayerId === HUMAN, `the human is next to deploy (got ${afterLoadout.activePlayerId})`);

// Everyone deploys on a Black Hole deployment ring, three sectors clear of every
// ship already placed. The legal set is the engine's, read from the view. The
// human takes the outer one, from which a hard burn leaves the rings.
const placed = placedShipPositions(afterLoadout);
const legalNow = legalDeploymentsAgainst(placed);
const OUTER = HOME_RINGS[HOME_RINGS.length - 1];
const onOuter = legalNow.find((p) => p.ring === OUTER);
if (!onOuter) fail("no legal position on the outer deployment ring");

// Two sectors from a ship already placed: inside the gap, so refused.
const tooClose = {
  wellId: onOuter.wellId,
  ring: OUTER,
  sector: wrapSector(placed[0].sector + DEPLOYMENT_GAP - 1),
};
check(
  !legalNow.some((p) => samePosition(p, tooClose)),
  "the engine's legal set excludes a position two sectors from a placed ship",
);
const crowded = await games.deploy(GAME_ID, HUMAN, tooClose.sector, tooClose.ring);
check(
  !crowded.ok && typeof crowded.error === "string" && crowded.error.length > 0,
  "a deployment inside the three-sector gap is refused with the engine's reason",
);

const deployResult = await games.deploy(GAME_ID, HUMAN, onOuter.sector, onOuter.ring);
if (!deployResult.ok) fail(`human deployment rejected: ${deployResult.error}`);

const afterDeploy = await games.getView(GAME_ID, HUMAN);
if (!afterDeploy) fail("no view after deployment");
check(afterDeploy.phase === "active", `the game is active once everyone deployed (phase ${afterDeploy.phase})`);
check(afterDeploy.players.every((p) => p.hasDeployed), "every player deployed");
check(
  afterDeploy.me?.home?.ring === OUTER && afterDeploy.me?.home?.sector === onOuter.sector,
  "a human deployment on the outer ring reaches the board",
);
console.log(`smoke: deployment done, turn ${afterDeploy.turn}, ${afterDeploy.activePlayerId} to act`);

// --- Preview and table talk ---------------------------------------------------
{
  const dry = await games.previewTurn(GAME_ID, HUMAN, []);
  check(dry.ok === true && Array.isArray(dry.events), "a preview of an empty (coast) turn is legal and returns the events it would produce");
  const before = await games.getView(GAME_ID, HUMAN);
  check(before!.turn === afterDeploy.turn, "a preview commits nothing");
  // Positive control: a soft burn from the outer deployment ring stays on the board.
  const soft = await games.previewTurn(GAME_ID, HUMAN, [
    { type: "burn", playerId: HUMAN, sequence: 1, data: { burnIntensity: "soft", sectorAdjustment: 0 } },
  ]);
  check(soft.ok === true, `a preview of a soft burn is legal (${soft.errors?.join("; ") ?? soft.error ?? ""})`);
  const bad = await games.previewTurn(GAME_ID, HUMAN, [
    { type: "burn", playerId: HUMAN, sequence: 1, data: { burnIntensity: "hard", sectorAdjustment: 0 } },
  ]);
  check(
    bad.ok === false && (bad.errors?.length ?? 0) > 0,
    "a preview of a hard burn off the outermost ring reports the engine's errors",
  );
  const notMine = await games.previewTurn(GAME_ID, BOT_A, []);
  check(notMine.ok === false, "a preview by the wrong seat is refused");
  const said = await games.postChat(GAME_ID, HUMAN, "say", "good luck, all");
  const thought = await games.postChat(GAME_ID, HUMAN, "think", "going for the Alpha crate first");
  check(said.ok && thought.ok, "players can say and think at the table");
  const chat = await games.listChat(GAME_ID);
  check(
    chat.length === 2 && chat[0].kind === "say" && chat[1].kind === "think" && chat[1].turn === afterDeploy.turn,
    "table talk is stored in order with its kind and turn",
  );
  const stranger = await games.postChat(GAME_ID, "nobody", "say", "hi");
  check(!stranger.ok, "only seated players talk at the table");
}

// --- Socket replies (CONNECTED, TURN_ERROR) -------------------------------------
recordReply(connectedMessage(GAME_ID));
check(messageCounts.get("CONNECTED") === 1, "CONNECTED is inspected like every other message");

const stale = await submitRaw(games, GAME_ID, submitTurnMessage([], 999));
check(stale?.type === "TURN_ERROR", "a stale SUBMIT_TURN is answered with TURN_ERROR");

const wrongSeat = await games.submitTurn(GAME_ID, BOT_A, [], { turn: afterDeploy.turn, activePlayerId: BOT_A });
check(!wrongSeat.ok, "a turn submitted for someone else's seat is rejected");

const notJson = await submitRaw(games, GAME_ID, "{ not json");
check(notJson?.type === "TURN_ERROR", "a SUBMIT_TURN that is not JSON is answered with TURN_ERROR");
const malformed = await submitRaw(
  games,
  GAME_ID,
  submitTurnMessage([{ playerId: HUMAN, type: "self_destruct", data: {} }], afterDeploy.turn),
);
check(
  malformed?.type === "TURN_ERROR" && (malformed.payload.errors?.length ?? 0) > 0,
  "a malformed action is answered with TURN_ERROR and the schema's reasons",
);
const illegal = await submitRaw(
  games,
  GAME_ID,
  submitTurnMessage(
    [{ playerId: HUMAN, type: "burn", sequence: 1, data: { burnIntensity: "hard", sectorAdjustment: 0 } }],
    afterDeploy.turn,
  ),
);
check(
  illegal?.type === "TURN_ERROR" && (illegal.payload.errors?.length ?? 0) > 0,
  "an illegal turn is answered with TURN_ERROR and the engine's reasons",
);
check((await games.getView(GAME_ID, HUMAN))!.turn === afterDeploy.turn, "a refused turn does not advance the game");

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

  const refused = await submitRaw(games, GAME_ID, submitTurnMessage([], view.turn));
  if (refused?.type === "TURN_ERROR") {
    fail(`turn ${view.turn} rejected: ${refused.payload.error ?? refused.payload.errors?.join("; ")}`);
  }
  played++;
}
check(played > 0, "the human played at least one turn");
check(ownSlotsSeen > 0, "the human's own subsystems were checked at least once");

// --- Recording ---------------------------------------------------------------
const recording = await recordings.load(GAME_ID);
check(recording !== null, "a recording was started when the game became active");
check(
  recording !== null && recording.schemaVersion === RECORDING_SCHEMA_VERSION,
  `the recording uses schema v${RECORDING_SCHEMA_VERSION}`
);
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

// The timeline: the list carries no views, and every turn's frames pass the
// same checks as a socket message to the human.
const timeline = await games.listTurns(GAME_ID, HUMAN);
check(timeline !== null && timeline.length > 0, "the timeline lists the game's turns");
check(
  timeline !== null && timeline.every((t, i) => i === 0 || t.index > timeline[i - 1].index),
  "the timeline is oldest first",
);
for (const { path, key } of walk(timeline)) {
  if (key === "view" || SECRET_KEYS.includes(key)) failures.push(`timeline: carries "${key}" at ${path}`);
}
for (const [n, summary] of (timeline ?? []).entries()) {
  const frames = await games.turnFrames(GAME_ID, HUMAN, summary.index);
  check(frames !== null && frames.events.length === summary.eventCount, `timeline turn ${n}: frames match the list`);
  if (!frames) continue;
  inspectHumanMessage({ type: "GAME_VIEW", payload: { view: frames.from, events: frames.events } }, 10_000 + 2 * n);
  inspectHumanMessage({ type: "GAME_VIEW", payload: { view: frames.to, events: [] } }, 10_001 + 2 * n);
}
check((await games.turnFrames(GAME_ID, HUMAN, 1_000_000)) === null, "a turn past the end has no frames");

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
    { playerId: HUMAN, type: "power", sequence: 1, data: { subsystemId: "side-2", amount: 2 } },
    { playerId: HUMAN, type: "power", sequence: 2, data: { subsystemId: "forward-0" } },
    { playerId: HUMAN, type: "coast", sequence: 3, data: { activateScoop: true } },
  ]),
  "a well-formed power + coast turn is accepted, with or without an amount",
);
check(
  accepts([
    { playerId: HUMAN, type: "coast", sequence: 1, data: { activateScoop: false } },
    { playerId: HUMAN, type: "repair", data: { subsystemId: "engines" } },
  ]),
  "a cold repair is accepted beside the turn (the table sends one whenever it plans a cold turn)",
);
check(
  !accepts([{ playerId: HUMAN, type: "repair", data: {} }]),
  "a repair that names no subsystem is rejected",
);
check(
  accepts([
    { playerId: HUMAN, type: "coast", sequence: 1, data: { activateScoop: false } },
    { playerId: HUMAN, type: "dock_sale", data: { sale: "fuel" } },
  ]),
  "a dock sale is accepted beside the turn",
);
check(
  !accepts([{ playerId: HUMAN, type: "dock_sale", data: { job: "crates" } }]),
  "a dock sale that names no sale is rejected",
);
check(
  accepts([
    { playerId: HUMAN, type: "coast", sequence: 1, data: { activateScoop: false } },
    { playerId: HUMAN, type: "escort_mark", sequence: 2, data: { carrierId: "bot-1" } },
  ]),
  "an Escort marker is accepted in the sequence",
);
check(
  !accepts([{ playerId: HUMAN, type: "escort_mark", data: {} }]),
  "an Escort marker that names no carrier is rejected",
);
check(
  accepts([
    { playerId: HUMAN, type: "coast", sequence: 1, data: { activateScoop: false } },
    { playerId: HUMAN, type: "seize", data: { victimId: "bot-1", cargoId: "item-0" } },
  ]),
  "a seizure is accepted beside the turn",
);
check(
  !accepts([{ playerId: HUMAN, type: "seize", data: { victimId: "bot-1" } }]),
  "a seizure that names no item is rejected",
);
check(
  accepts([
    { playerId: HUMAN, type: "survey", sequence: 1, data: {} },
    { playerId: HUMAN, type: "coast", sequence: 2, data: { activateScoop: false } },
    { playerId: HUMAN, type: "salvage", sequence: 3, data: { wreckId: "wreck-1" } },
  ]),
  "a survey and a salvage are accepted in the sequence",
);
check(
  accepts([{ playerId: HUMAN, type: "salvage", sequence: 1, data: {} }]),
  "a salvage that names no wreck is accepted (the first wreck in the sector)",
);
check(
  !accepts([{ playerId: HUMAN, type: "salvage", sequence: 1, data: { wreckId: "" } }]),
  "a salvage that names an empty wreck id is rejected",
);
check(
  !accepts([{ playerId: HUMAN, type: "survey", sequence: 1, data: { ring: 1 } }]),
  "a survey with a payload is rejected",
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
  !accepts([{ playerId: HUMAN, type: "power", sequence: 1, data: { subsystemId: "side-2", amount: 1.5 } }]),
  "a fractional power amount is rejected",
);
check(
  !accepts([{ playerId: HUMAN, type: "well_transfer", data: { destinationWellId: "planet-alpha" } }]),
  "a well_transfer without its sectorAdjustment is rejected",
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
// The same check guards reading a status and renaming a player.
const ownStatus = checkPlayerAccess(HUMAN, HUMAN);
check(ownStatus.ok && ownStatus.playerId === HUMAN, "a player may read its own status and rename itself");
const otherStatus = checkPlayerAccess(HUMAN, BOT_A);
check(!otherStatus.ok && otherStatus.code === 403, "reading or renaming another player is a 403");
const anonStatus = checkPlayerAccess(undefined, HUMAN);
check(!anonStatus.ok && anonStatus.code === 401, "a player request without x-player-id is a 401");

// --- Agent seats (who plays a seat is public, and only known drivers count) ---
const agentSeat = CreatePlayerSchema.safeParse({ playerName: "Codex", agent: { driver: "codex", model: "gpt-6-astra" } });
check(agentSeat.success && agentSeat.data.agent?.driver === "codex", "a player may be created as a Codex agent with its model");
check(CreatePlayerSchema.safeParse({ playerName: "Ada" }).success, "a person needs no agent field");
check(
  !CreatePlayerSchema.safeParse({ playerName: "X", agent: { driver: "skynet", model: "t-800" } }).success,
  "an unknown agent driver is rejected",
);
check(!CreatePlayerSchema.safeParse({ playerName: "X", agent: { driver: "claude" } }).success, "an agent without a model is rejected");
check(
  !CreatePlayerSchema.safeParse({ playerName: "X", playerId: "2f0c6f1e-3b1a-4d2e-9c1f-6a7b8c9d0e1f" }).success,
  "a client cannot choose its own player id",
);

// --- Request bounds -------------------------------------------------------------
const coastAction = { playerId: HUMAN, type: "coast", sequence: 1, data: { activateScoop: false } };
check(PreviewSchema.safeParse({ actions: [coastAction] }).success, "a preview of one action passes the schema");
check(
  !PreviewSchema.safeParse({ actions: Array.from({ length: 65 }, () => coastAction) }).success,
  "a preview of more actions than a SUBMIT_TURN may carry is refused",
);
check(
  ForkSchema.safeParse({ recordingId: "r", turnIndex: -1, impersonateOriginalPlayerId: BOT_A }).success,
  "a fork naming its seat passes the schema",
);
check(!ForkSchema.safeParse({ recordingId: "r", turnIndex: -1 }).success, "a fork must name the seat it takes");

// --- Table size (the seats are the only thing a lobby settles) ---------------
const lobbyBody = { lobbyName: "Smoke", maxPlayers: 3 };
check(CreateLobbySchema.safeParse(lobbyBody).success, "a lobby may be created for a legal number of seats");
for (const seats of [MIN_PLAYERS - 1, MAX_PLAYERS + 1, 3.5, "3", null]) {
  check(
    !CreateLobbySchema.safeParse({ ...lobbyBody, maxPlayers: seats }).success,
    `a lobby of ${seats} seats is refused`,
  );
}

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
  // The same finished game written under older rules: refused, never migrated.
  const stale = { ...archived, recordingId: "smoke-stale", schemaVersion: 2 } as unknown as GameRecording;
  // The same game with the human's Escort marker on Bot Alpha.
  const escort: EscortMission = { id: "smoke-escort", type: "escort", isCompleted: false, markedPlayerId: BOT_A };
  const escorted: GameRecording = {
    ...archived,
    recordingId: "smoke-escorted",
    initialState: {
      ...archived.initialState,
      players: archived.initialState.players.map((p) =>
        p.id === HUMAN ? { ...p, missions: [...p.missions, escort] } : p,
      ),
    },
  };
  const archive: RecordingArchive = {
    list: async () => [],
    load: async (id) => [archived, stale, escorted].find((r) => r.recordingId === id) ?? null,
    write: async () => {},
  };
  const forkKv = memoryKv();
  const forkGames = createGameService({
    kv: forkKv,
    recordings: createRecordingService(forkKv, archive),
    transport: { broadcastViews: () => {} },
  });

  const outsider = "human-grace";
  const botSeat = await forkGames.forkGameFromRecording("smoke-archived", -1, {
    impersonateOriginalPlayerId: BOT_A,
    humanPlayerId: outsider,
    humanPlayerName: "Grace",
  });
  check(botSeat.ok, `a bot seat of a finished recording can be forked (${botSeat.ok ? "" : botSeat.error})`);

  const markedSeat = await forkGames.forkGameFromRecording("smoke-escorted", -1, {
    impersonateOriginalPlayerId: BOT_A,
    humanPlayerId: outsider,
    humanPlayerName: "Grace",
  });
  if (markedSeat.ok) {
    const forked = await forkGames.getGame(markedSeat.gameId);
    const marker = forked?.players
      .find((p) => p.id === HUMAN)
      ?.missions.find((m): m is EscortMission => m.type === "escort");
    check(marker?.markedPlayerId === outsider, "forking a marked seat moves the Escort marker to the new player");
    check(
      markedSeat.view.players.find((p) => p.id === outsider)?.escortedBy.includes(HUMAN) === true,
      "the forked view shows the Escort marker on the new player",
    );
  } else {
    check(false, `a marked bot seat can be forked (${markedSeat.error})`);
  }

  const ownSeat = await forkGames.forkGameFromRecording("smoke-archived", -1, {
    impersonateOriginalPlayerId: HUMAN,
    humanPlayerId: HUMAN,
    humanPlayerName: "Ada",
  });
  check(ownSeat.ok, `a player may fork its own seat (${ownSeat.ok ? "" : ownSeat.error})`);

  if (ownSeat.ok) {
    const forkView = await forkGames.getView(ownSeat.gameId, HUMAN);
    check(
      forkView?.me?.appearance?.paint === cosmetic.paint,
      "forking a recording preserves appearance"
    );
  }

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

  const staleFork = await forkGames.forkGameFromRecording("smoke-stale", -1, {
    impersonateOriginalPlayerId: BOT_A,
    humanPlayerId: outsider,
    humanPlayerName: "Grace",
  });
  check(!staleFork.ok, "forking a recording made under older rules is refused");

  // The archive on disk leaves a recording made under older rules out of its list.
  const shelf = await mkdtemp(join(tmpdir(), "di-smoke-"));
  try {
    const disk = createRecordingArchive(shelf);
    await disk.write(archived);
    await disk.write(stale);
    const listed = await disk.list();
    check(
      listed.length === 1 && listed[0].recordingId === archived.recordingId,
      "the recordings list leaves out a recording made under older rules",
    );
  } finally {
    await rm(shelf, { recursive: true, force: true });
  }
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
    transport: { broadcastViews: () => {} },
    log: { info: () => {}, warn: () => {}, error: () => {} },
  });
  await gameGames.createGame(gameId, SPECS, [HUMAN], SEED);
  const first = await gameGames.getView(gameId, HUMAN);
  await gameGames.submitLoadout(gameId, HUMAN, {
    loadout: SMOKE_LOADOUT,
    missionIds: handFrom(first!.me!.missionOffers),
  });
  const deployed = await gameGames.getView(gameId, HUMAN);
  const spot = legalDeploymentsAgainst(placedShipPositions(deployed!))[0];
  await gameGames.deploy(gameId, HUMAN, spot.sector, spot.ring);
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

// --- Real submissions on a canned board -----------------------------------------
// Black hole ring 3 past the opening round: Bot Beta shares the human's sector
// with one hull point left, Bot Alpha waits one coast ahead carrying data, and
// a wreck already lies on the board. One human turn powers the shields, fires
// at Bot Beta, coasts onto Bot Alpha, scans it, names a dock sale and marks it
// with an Escort; the next repairs a broken subsystem on a cold ship. Every turn goes in as a raw SUBMIT_TURN through
// the socket's handler, and every message out passes the checks above. The
// bots coast: the position is what is under test, not their play.
{
  const CANNED = "smoke-canned";
  const cannedGames = createGameService({
    kv,
    recordings,
    transport,
    bots: { ...engineBots, decideActions: () => ({ actions: [] }) },
  });
  // createGame registers the human seat; the board is then replaced.
  await cannedGames.createGame(CANNED, SPECS, [HUMAN], SEED);

  const here = { wellId: BH, ring: 3, sector: 5 };
  const ahead = { ...here, sector: wrapSector(here.sector + ringVelocity(BH, here.ring)) };
  // Item ids are opaque tokens on the wire, as the deal hands them out.
  const survey = { ...surveyMission("smoke-survey"), dataCargoId: "item-0" };
  const data: Cargo = {
    id: survey.dataCargoId,
    kind: "data",
    missionId: survey.id,
    deliveryPlanetId: "any",
    isPickedUp: true,
  };
  let board: GameState = makeGameState(
    [
      makePlayer(HUMAN, here, SMOKE_LOADOUT, { name: "Ada", missions: [escortMission("smoke-escort-card")] }),
      makePlayer(BOT_A, ahead, DEFAULT_LOADOUT, {
        name: "Bot Alpha",
        missions: [survey],
        cargo: [data],
      }),
      makePlayer(BOT_B, here, DEFAULT_LOADOUT, { name: "Bot Beta" }),
    ],
    { wrecks: [{ id: "smoke-wreck", wellId: BH, ring: 2, sector: 20 }] },
  );
  board = withShip(board, BOT_B, { hitPoints: 1 });
  await kv.set(`game:${CANNED}`, serializeGame(board));
  // The recording starts with the board, as it would when a game turns active.
  await recordings.init(CANNED, board, new Set([HUMAN]));

  const firstTurn = board.turn;
  const act = (actions: Array<Omit<PlayerAction, "playerId">>) => actions.map((a) => ({ ...a, playerId: HUMAN }));
  const fullTurn = act([
    { type: "power", sequence: 1, data: { subsystemId: "side-2" } },
    { type: "fire_weapon", sequence: 2, data: { subsystemId: "side-0", targetPlayerId: BOT_B, criticalTarget: "engines" } },
    { type: "coast", sequence: 3, data: { activateScoop: false } },
    { type: "scan", sequence: 4, data: { targetPlayerId: BOT_A, peekSlot: "forward-0" } },
    { type: "dock_sale", data: { sale: "none" } },
    { type: "escort_mark", sequence: 5, data: { carrierId: BOT_A } },
  ] as Array<Omit<PlayerAction, "playerId">>);

  const preview = await cannedGames.previewTurn(CANNED, HUMAN, fullTurn as PlayerAction[]);
  check(preview.ok, `the canned turn previews legal (${preview.errors?.join("; ") ?? preview.error ?? ""})`);

  const sentBefore = toHuman.length;
  const refused = await submitRaw(cannedGames, CANNED, submitTurnMessage(fullTurn, firstTurn));
  check(refused === null, `power, fire, scan, dock sale and Escort go through the socket (${JSON.stringify(refused)})`);
  const executed = toHuman
    .slice(sentBefore)
    .find((m) => m.type === "TURN_EXECUTED" && m.payload.playerId === HUMAN);
  const seen = new Set(executed?.type === "TURN_EXECUTED" ? executed.payload.events.map((e) => e.type) : []);
  for (const type of [
    "subsystem_powered",
    "weapon_fired",
    "ship_destroyed",
    "wreck_left",
    "scanned",
    "scan_result",
    "escort_marked",
  ] as const) {
    check(seen.has(type), `the human's canned turn shows "${type}"`);
  }
  if (executed?.type === "TURN_EXECUTED") {
    const { view } = executed.payload;
    check(view.wrecks.length === 2, `the new wreck joins the one on the board (${view.wrecks.length})`);
    check(
      view.players.find((p) => p.id === BOT_A)?.escortedBy.includes(HUMAN) === true,
      "Bot Alpha carries the human's Escort marker in the view",
    );
  }

  // The next turn: a broken subsystem on a cold ship, repaired.
  const between = await cannedGames.getView(CANNED, HUMAN);
  check(
    between?.phase === "active" && between.activePlayerId === HUMAN && between.turn === firstTurn + 1,
    `the bots played and the human is to act again (turn ${between?.turn}, ${between?.activePlayerId})`,
  );
  let cold = (await cannedGames.getGame(CANNED))!;
  cold = withSub(cold, HUMAN, "side-3", { isBroken: true });
  cold = withShip(cold, HUMAN, { heat: { ...cold.players.find((p) => p.id === HUMAN)!.ship.heat, currentHeat: 0 } });
  await kv.set(`game:${CANNED}`, serializeGame(cold));
  const sentBeforeRepair = toHuman.length;
  const repairRefused = await submitRaw(
    cannedGames,
    CANNED,
    submitTurnMessage(
      act([
        { type: "coast", sequence: 1, data: { activateScoop: false } },
        { type: "repair", data: { subsystemId: "side-3" } },
      ] as Array<Omit<PlayerAction, "playerId">>),
      cold.turn,
    ),
  );
  check(repairRefused === null, `a cold repair goes through the socket (${JSON.stringify(repairRefused)})`);
  const repaired = toHuman
    .slice(sentBeforeRepair)
    .find((m) => m.type === "TURN_EXECUTED" && m.payload.playerId === HUMAN);
  check(
    repaired?.type === "TURN_EXECUTED" && repaired.payload.events.some((e) => e.type === "subsystem_repaired"),
    "the cold turn shows the repair",
  );
  check(wrecksSeen > 0, "wrecks were inspected on the wire");
  check(escortMarkersSeen > 0, "Escort markers were inspected on the wire");
  check(holdItemsSeen > 0, "rivals' hold items were inspected on the wire");
}

// --- A live game saved under older rules is refused -----------------------------
{
  const staleKv = memoryKv();
  const staleGames = createGameService({
    kv: staleKv,
    recordings: createRecordingService(staleKv, null),
    transport: { broadcastViews: () => {} },
  });
  await staleGames.createGame("smoke-old", SPECS, [HUMAN], SEED);
  const current = (await staleGames.getGame("smoke-old"))!;
  check(current.phase === "loadout", "a game saved under the current rules loads");
  for (const [label, stored] of [
    ["an older schema version", JSON.stringify({ schemaVersion: RECORDING_SCHEMA_VERSION - 1, state: current })],
    ["no schema version", JSON.stringify(current)],
  ] as const) {
    await staleKv.set("game:smoke-old", stored);
    let refusedWith: unknown = null;
    try {
      await staleGames.getGame("smoke-old");
    } catch (error) {
      refusedWith = error;
    }
    check(refusedWith instanceof StaleGameError, `a live game with ${label} is refused, not loaded`);
    const reply = await answerSubmission(staleGames, "smoke-old", HUMAN, JSON.stringify(submitTurnMessage([], 1)));
    check(
      reply?.type === "TURN_ERROR" && typeof reply.payload.error === "string",
      `a turn for a live game with ${label} is answered with TURN_ERROR`,
    );
  }
}

// --- A bot whose AI fails still submits a legal loadout ----------------------
// The fallback hull and hand must be accepted by the engine whatever the deal,
// or the human's own loadout submission fails and the game is stuck.
{
  const failingAi: Array<[string, BotStrategy["chooseLoadout"]]> = [
    [
      "throws",
      () => {
        throw new Error("smoke: simulated AI failure");
      },
    ],
    [
      "is refused",
      (botOffers) => ({
        loadout: SMOKE_LOADOUT,
        missionIds: botOffers.filter((m) => isPrimaryType(m.type)).map((m) => m.id),
      }),
    ],
  ];
  for (const [how, chooseLoadout] of failingAi) {
    for (let seed = 1; seed <= 12; seed++) {
      const fallbackKv = memoryKv();
      const fallbackGames = createGameService({
        kv: fallbackKv,
        recordings: createRecordingService(fallbackKv, null),
        transport: { broadcastViews: () => {} },
        bots: { ...engineBots, chooseLoadout },
        log: { info: () => {}, warn: () => {}, error: () => {} },
      });
      const gameId = `smoke-fallback-${seed}`;
      await fallbackGames.createGame(gameId, SPECS, [HUMAN], seed);
      const first = await fallbackGames.getView(gameId, HUMAN);
      let outcome: string;
      try {
        const submitted = await fallbackGames.submitLoadout(gameId, HUMAN, {
          loadout: SMOKE_LOADOUT,
          missionIds: handFrom(first!.me!.missionOffers),
        });
        const after = await fallbackGames.getView(gameId, HUMAN);
        outcome = submitted.ok ? `phase ${after?.phase}` : `refused: ${submitted.error}`;
        if (submitted.ok && after?.players.some((p) => !p.hasSubmittedLoadout)) outcome = "a bot has no loadout";
      } catch (error) {
        outcome = `threw: ${String(error)}`;
      }
      check(
        outcome === "phase deployment",
        `seed ${seed}: when the bot AI ${how}, the fallback loadout is accepted (${outcome})`,
      );
    }
  }
}

// --- Report ------------------------------------------------------------------
console.log(`\nsmoke: ${toHuman.length} messages to the human`);
for (const [type, count] of [...messageCounts].sort()) console.log(`  ${type.padEnd(14)} ${count}`);
console.log(`  opponent slots: ${hiddenOpponentSlots} face-down, ${visibleOpponentSlots} face-up`);
console.log(`  own slots seen in full: ${ownSlotsSeen}`);
console.log(`  wrecks seen: ${wrecksSeen}, Escort markers seen: ${escortMarkersSeen}, rival hold items seen: ${holdItemsSeen}`);
console.log(`  bot turns rejected by the engine: ${games.getBotInvalidTurnCount()}`);

const unique = [...new Set(failures)];
if (unique.length > 0) {
  console.error(`\nsmoke: FAILED, ${unique.length} of ${checks} checks`);
  for (const failure of unique.slice(0, 40)) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`\nsmoke: OK, ${checks} checks passed`);
