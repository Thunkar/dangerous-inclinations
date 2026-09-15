/**
 * A seat at the table for an agent (or a person at a terminal).
 *
 *   yarn seat                                     menu: server → who sits down → lobby → start / bots / wait → driver
 *   yarn seat lobbies                             every lobby on the server: seats, ids, game id
 *   yarn seat register --name Codex --agent codex [--model gpt-6-astra]   create a player on the server, print its id
 *   yarn seat lobby --player <id> --name "Arena" --bots 1 --max 3        create a lobby (+ bots), print its id
 *   yarn seat join --player <id> --lobby <id>     join a lobby (a new player is at no table yet, so it goes by id)
 *   yarn seat start --as Codex                    start the seat's lobby (host only), print the game id
 *   yarn seat leave --as Codex                    leave the lobby
 *   yarn seat view --as Codex [--rules] [--json] [--turns 2]
 *   yarn seat options --as Codex                  legal moves, as JSON
 *   yarn seat try --as Codex --intent '{...}'     build + dry-run a turn: errors or the events it would cause
 *   yarn seat act --as Codex --intent '{...}'    build, dry-run, submit (an illegal turn is refused, nothing is sent)
 *   yarn seat loadout --as Codex --forward railgun --sides missiles,radiator,laser,shields --missions m1,m2,m3
 *   yarn seat deploy --as Codex --sector 6
 *   yarn seat rules                               the full RULES.md
 *   yarn seat say --as Codex "text" / think "text" / chat
 *   yarn seat wait --as Codex [--timeout 600]     hold a socket open until it is your turn, then print the view
 *   yarn seat agent --as Codex [--driver codex|claude] [--model m] [--turns N] [--quiet-think]
 *
 * Nothing is kept on this machine: players, lobbies and games live on the
 * server. A seat is named with `--as <name>`, which finds a player of that
 * name at one of the server's lobbies (`--lobby <id>` or `--game <id>` narrow
 * it when the name sits at several tables), or with `--player <id>` (or
 * DI_PLAYER). The game is the one the seat's lobby started. A player is a
 * person, or an agent: `{driver: "claude" | "codex", model}` stored with the
 * player and shown to everyone, and `yarn seat agent` plays the seat with
 * that driver. Turns go over the game WebSocket like a browser's; everything
 * else is REST. There is no autopilot: an illegal intent is refused before it
 * is sent and the agent gets the engine's reasons, the legal options and the
 * full rules back, and tries again until its turn is legal.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { homedir, tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type {
  GameEvent,
  GameView,
  PlayerAction,
  ShipLoadout,
} from "@dangerous-inclinations/engine";
import {
  AGENT_INTENT_GUIDE,
  AGENT_RULES_DIGEST,
  buildTurn,
  describeEvent,
  describeMission,
  describeViewForAgent,
  seatOptions,
  type TurnIntent,
} from "@dangerous-inclinations/engine";
import type { ChatMessage, PreviewPayload, ServerGameMessage } from "../src/protocol.ts";

// ---------------------------------------------------------------------------
// Arguments and the seat
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith("--")) ?? "menu";
const positional = args.filter((a) => !a.startsWith("--")).slice(1);
function flag(name: string): string | undefined {
  const i = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i === -1) return undefined;
  const a = args[i];
  if (a.includes("=")) return a.slice(a.indexOf("=") + 1);
  const next = args[i + 1];
  return next !== undefined && !next.startsWith("--") ? next : "true";
}
const has = (name: string) => flag(name) !== undefined;

/** The repository root: RULES.md lives there and the drivers run there so the model can read it. */
const REPO_ROOT = join(new URL(".", import.meta.url).pathname, "..", "..");
const fullRules = (): string => {
  try {
    return readFileSync(join(REPO_ROOT, "RULES.md"), "utf8");
  } catch {
    return "(RULES.md not found)";
  }
};
/** Transcripts of what a driver was asked and answered. Output only; no state lives here. */
const LOG_DIR = join(homedir(), ".config", "dangerous-inclinations", "logs");

/** Which program plays a seat, and with which model. Stored on the server with the player. */
interface AgentInfo {
  driver: "claude" | "codex";
  model: string;
}
const DRIVERS: ReadonlyArray<AgentInfo["driver"]> = ["claude", "codex"];
const DEFAULT_MODEL: Record<AgentInfo["driver"], string> = {
  claude: "claude-fable-5-1",
  codex: "gpt-6-astra",
};
const DRIVER_NAME: Record<AgentInfo["driver"], string> = { claude: "Claude", codex: "Codex" };
const agentLabel = (a?: AgentInfo): string | null => (a ? `${DRIVER_NAME[a.driver]} · ${a.model}` : null);
const isDriver = (s: string | undefined): s is AgentInfo["driver"] =>
  s !== undefined && (DRIVERS as readonly string[]).includes(s);

let SERVER = flag("server") ?? process.env.DI_SERVER ?? "http://localhost:3000";
let PLAYER: string | undefined = flag("player") ?? process.env.DI_PLAYER;
let GAME: string | undefined = flag("game") ?? process.env.DI_GAME;
let LOBBY: string | undefined = flag("lobby");
let seatName: string | undefined = flag("as");
/** The seat's agent record, once the seat is resolved against the server. */
let AGENT: AgentInfo | undefined;

const log = (s: string) => console.error(`[seat${seatName ? ` ${seatName}` : ""}] ${s}`);
function die(message: string): never {
  console.error(message);
  process.exit(1);
}
function needPlayer(): string {
  return (
    PLAYER ??
    die(
      "No seat: --as <name> (a player at one of the server's lobbies) or --player <id>. `yarn seat` creates one."
    )
  );
}
function needGame(): string {
  return GAME ?? die("No game: this seat's lobby has not started yet (or pass --game <id>)");
}

// ---------------------------------------------------------------------------
// HTTP and WebSocket
// ---------------------------------------------------------------------------

async function http<T>(
  method: string,
  path: string,
  body?: unknown,
  playerId = PLAYER
): Promise<T> {
  const res = await fetch(`${SERVER}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(playerId ? { "x-player-id": playerId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* plain text */
  }
  if (!res.ok) {
    const err = (data as { error?: string; errors?: string[] }) ?? {};
    throw new Error(
      `${method} ${path} → ${res.status}: ${err.error ?? text}${err.errors ? ` (${err.errors.join("; ")})` : ""}`
    );
  }
  return data as T;
}

interface ViewPayload {
  view: GameView;
  events: GameEvent[];
}
const getView = () => http<ViewPayload>("GET", `/api/games/${needGame()}`);

/** One game socket: turns go through it, and holding it open keeps the game alive. */
class Table {
  private ws!: WebSocket;
  private handlers = new Set<(m: ServerGameMessage) => void>();
  latest: ViewPayload | null = null;

  static async open(): Promise<Table> {
    const t = new Table();
    const url = `${SERVER.replace(/^http/, "ws")}/ws/game?playerId=${encodeURIComponent(needPlayer())}&roomId=${encodeURIComponent(needGame())}`;
    t.ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      t.ws.addEventListener("open", () => resolve());
      t.ws.addEventListener("error", () => reject(new Error(`cannot open ${url}`)));
    });
    t.ws.addEventListener("message", (ev) => {
      const m = JSON.parse(String(ev.data)) as ServerGameMessage;
      if (m.type === "GAME_VIEW" || m.type === "TURN_EXECUTED")
        t.latest = { view: m.payload.view, events: m.payload.events };
      for (const h of t.handlers) h(m);
    });
    return t;
  }
  on(handler: (m: ServerGameMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  close(): void {
    this.ws.close();
  }
  /** Resolve when it is our move (or the game is over), with the freshest view. */
  waitForMyTurn(timeoutMs: number): Promise<ViewPayload> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`no turn for us within ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
      const check = (p: ViewPayload | null) => {
        if (!p) return false;
        const v = p.view;
        const me = v.players.find((x) => x.id === PLAYER);
        const mine =
          v.phase === "ended" ||
          (v.phase === "active" && v.activePlayerId === PLAYER) ||
          (v.phase === "loadout" && me && !me.hasSubmittedLoadout) ||
          (v.phase === "deployment" && v.activePlayerId === PLAYER);
        if (mine) {
          clearTimeout(timer);
          off();
          resolve(p);
          return true;
        }
        return false;
      };
      const off = this.on((m) => {
        if (m.type === "GAME_VIEW" || m.type === "TURN_EXECUTED")
          check({ view: m.payload.view, events: m.payload.events });
      });
      check(this.latest);
    });
  }
  /** Submit a turn and resolve with the outcome. */
  submit(
    actions: PlayerAction[],
    view: GameView
  ): Promise<{ ok: true; payload: ViewPayload } | { ok: false; errors: string[] }> {
    return new Promise((resolve) => {
      const off = this.on((m) => {
        if (m.type === "TURN_EXECUTED" && m.payload.playerId === PLAYER) {
          off();
          resolve({ ok: true, payload: { view: m.payload.view, events: m.payload.events } });
        } else if (m.type === "TURN_ERROR") {
          off();
          resolve({
            ok: false,
            errors: [m.payload.error, ...(m.payload.errors ?? [])].filter(Boolean) as string[],
          });
        }
      });
      this.ws.send(
        JSON.stringify({
          type: "SUBMIT_TURN",
          payload: { actions, turn: view.turn, activePlayerId: view.activePlayerId },
        })
      );
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers shared by commands and the driver
// ---------------------------------------------------------------------------

const nameOf = (view: GameView) => (id: string) =>
  view.players.find((p) => p.id === id)?.name ?? id;

function digest(payload: ViewPayload, opts: { rules?: boolean; turns?: number } = {}): string {
  return describeViewForAgent(payload.view, payload.events, {
    includeRules: opts.rules ?? false,
    recentTurns: opts.turns ?? 1,
  });
}

async function chatLines(limit = 12): Promise<ChatMessage[]> {
  const { messages } = await http<{ messages: ChatMessage[] }>(
    "GET",
    `/api/games/${needGame()}/chat`
  );
  return messages.slice(-limit);
}

async function post(kind: "say" | "think", text: string): Promise<void> {
  if (!text.trim()) return;
  await http("POST", `/api/games/${needGame()}/chat`, { text: text.trim().slice(0, 2000), kind });
}

function parseIntent(): TurnIntent | null {
  const raw = flag("intent") ?? (flag("file") ? readFileSync(flag("file")!, "utf8") : undefined);
  return raw ? (JSON.parse(raw) as TurnIntent) : null;
}

async function preview(actions: PlayerAction[]): Promise<PreviewPayload> {
  return http<PreviewPayload>("POST", `/api/games/${needGame()}/preview`, { actions });
}

function describeEvents(events: GameEvent[], view: GameView): string {
  return events.map((e) => `  ${describeEvent(e, nameOf(view))}`).join("\n");
}

// ---------------------------------------------------------------------------
// Loadout and deployment helpers
// ---------------------------------------------------------------------------

function loadoutPrompt(view: GameView): string {
  const me = view.me!;
  const offers = me.missionOffers
    .map(
      (m) =>
        `  - ${m.id}: ${describeMission(m, nameOf(view))}${m.type === "destroy_ship" ? " (2 points)" : ""}`
    )
    .join("\n");
  return `LOADOUT PHASE. Choose 3 of your 5 mission cards and a hull: 1 forward tile (railgun | sensor_array | missiles) and 4 side tiles (laser | shields | radiator | fuel_compressor | ballistic_rack | missiles; repeats allowed).
Your offers:
${offers}
Presets that work: Hauler = sensor_array / shields,radiator,fuel_compressor,laser; Raider = railgun / missiles,radiator,fuel_compressor,shields; Scout = sensor_array / shields,laser,laser,fuel_compressor; Hunter = railgun / missiles,radiator,laser,shields.
Intercept and Survey need a sensor array. Reply with ONE JSON object: {"think": "...", "say": "...", "missionIds": ["id","id","id"], "loadout": {"forward": "sensor_array", "sides": ["shields","laser","laser","fuel_compressor"]}}`;
}

function deployPrompt(view: GameView): string {
  const taken = view.players
    .filter((p) => p.hasDeployed && p.ship)
    .map((p) => `${p.name} S${p.ship!.sector}`);
  return `DEPLOYMENT PHASE. Place your ship on Black Hole Ring 4 (drifts 2 sectors a turn; a soft burn outward reaches ring 5, the lane ring). Lanes out of the black hole leave from ring 5 sectors 0-3 (to Beta), 8-11 (to Gamma), 16-19 (to Alpha). Taken sectors: ${taken.join(", ") || "none"}. Your sector becomes your Home (where you respawn).
Reply with ONE JSON object: {"think": "...", "say": "...", "sector": <0-23>}`;
}

async function submitLoadout(loadout: ShipLoadout, missionIds: string[]): Promise<void> {
  await http("POST", `/api/games/${needGame()}/loadout`, { loadout, missionIds });
}
async function submitDeploy(sector: number): Promise<void> {
  await http("POST", `/api/games/${needGame()}/deploy`, { sector });
}

// ---------------------------------------------------------------------------
// The drivers: a model answers one prompt with one JSON object
// ---------------------------------------------------------------------------

type Driver = AgentInfo;

/**
 * Ask the model once. Codex runs `codex exec` and Claude runs `claude -p`,
 * both in the repository with read-only tools so the model can open RULES.md
 * itself. The answer is the outermost JSON object in the reply, or null.
 */
function askModel(prompt: string, drv: Driver, timeoutMs: number): Record<string, unknown> | null {
  const outFile = join(tmpdir(), `di-seat-answer-${process.pid}.txt`);
  if (existsSync(outFile)) writeFileSync(outFile, "");
  const argv =
    drv.driver === "codex"
      ? [
          "exec",
          "-m",
          drv.model,
          "--sandbox",
          "read-only",
          "--skip-git-repo-check",
          "--ephemeral",
          "-o",
          outFile,
          "-",
        ]
      : [
          "-p",
          "--model",
          drv.model,
          "--output-format",
          "json",
          "--tools",
          "Read,Grep,Glob",
          "--allowedTools",
          "Read,Grep,Glob",
          "--no-session-persistence",
        ];
  // A nested Claude Code session refuses to start unless it is told it is not nested.
  const env = { ...process.env };
  delete env.CLAUDECODE;
  const run = spawnSync(drv.driver, argv, {
    input: prompt,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    cwd: REPO_ROOT,
    env,
  });
  if (run.error) {
    log(`${drv.driver} failed to run: ${run.error.message}`);
    return null;
  }
  let text = drv.driver === "codex" && existsSync(outFile) ? readFileSync(outFile, "utf8") : run.stdout;
  if (drv.driver === "claude") {
    // `--output-format json` wraps the reply: {"type":"result","result":"<the model's text>",...}
    try {
      const wrapped = JSON.parse(text) as { result?: string; is_error?: boolean };
      if (typeof wrapped.result === "string") text = wrapped.result;
    } catch {
      /* not wrapped: use the raw text */
    }
  }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    log(`${drv.driver} gave no JSON (exit ${run.status}); stderr tail: ${run.stderr.slice(-400)}`);
    transcript(`RAW ${drv.driver} reply without JSON (exit ${run.status})\n${text.slice(0, 2000)}\n${run.stderr.slice(-1000)}`);
    return null;
  }
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch (e) {
    log(`${drv.driver} JSON did not parse: ${(e as Error).message}`);
    return null;
  }
}

function transcript(line: string): void {
  mkdirSync(LOG_DIR, { recursive: true });
  appendFileSync(
    join(LOG_DIR, `${GAME ?? "game"}-${seatName ?? PLAYER}.log`),
    `${new Date().toISOString()} ${line}\n`
  );
}

async function turnPrompt(payload: ViewPayload, errors?: string[], attempt = 1): Promise<string> {
  const chat = (await chatLines(12)).filter((m) => m.kind === "say");
  const talk = chat.length
    ? `\nTABLE TALK (recent, public):\n${chat.map((m) => `  T${m.turn} ${m.name}: ${m.text}`).join("\n")}\n`
    : "";
  const help =
    attempt >= 2
      ? `\nTHE FULL RULES:\n${fullRules()}\n\nLEGAL OPTIONS AS DATA:\n${JSON.stringify(seatOptions(payload.view))}\n`
      : "";
  const rejected = errors
    ? `\nYOUR PREVIOUS INTENT (attempt ${attempt - 1}) WAS REJECTED BY THE ENGINE:\n${errors.map((e) => `  - ${e}`).join("\n")}\nRead LEGAL THIS TURN carefully and answer with an intent the engine will accept. A plain coast ({"move":{"kind":"coast"}}) is always legal.\n`
    : "";
  return `You are playing a seat in Dangerous Inclinations, a hidden-information tabletop space game. Play to win. Be concrete and legal. The working directory is the game's repository: RULES.md there is the complete rulebook, read it whenever the brief below is not enough. Do not run the game yourself; the table validates your intent and comes back to you if it is illegal.

${AGENT_RULES_DIGEST}

${digest(payload, { rules: false, turns: 2 })}
${talk}
${AGENT_INTENT_GUIDE}
${help}${rejected}
Reply with ONE JSON object: {"think": "<your reasoning in 1-3 sentences; a human observer reads this>", "say": "<optional table talk heard by everyone, or empty>", "intent": {...}}`;
}
async function driveTurn(
  table: Table,
  payload: ViewPayload,
  drv: Driver,
  quietThink: boolean
): Promise<ViewPayload> {
  const view = payload.view;
  let errors: string[] | undefined;
  for (let attempt = 1; ; attempt++) {
    const prompt = await turnPrompt(payload, errors, attempt);
    transcript(`PROMPT T${view.turn} attempt ${attempt}\n${prompt}`);
    const answer = askModel(prompt, drv, 240_000);
    transcript(`ANSWER T${view.turn} attempt ${attempt}\n${JSON.stringify(answer)}`);
    if (!answer) {
      errors = ["the model gave no usable answer (answer with one JSON object and nothing else)"];
      log(`attempt ${attempt}: no usable answer`);
      continue;
    }
    const think = String(answer.think ?? "");
    const say = String(answer.say ?? "");
    let actions: PlayerAction[];
    try {
      const built = buildTurn(view, (answer.intent ?? {}) as TurnIntent);
      for (const n of built.notes) log(`builder: ${n}`);
      const dry = await preview(built.actions);
      if (!dry.ok) {
        errors = dry.errors ?? [dry.error ?? "rejected"];
        log(`attempt ${attempt} rejected: ${errors.join("; ")}`);
        if (attempt % 5 === 0) await post("say", `(still working out a legal turn: ${errors[0]})`);
        continue;
      }
      actions = built.actions;
    } catch (e) {
      errors = [(e as Error).message];
      log(`attempt ${attempt} failed to build: ${errors[0]}`);
      continue;
    }
    if (think && !quietThink)
      await post("think", attempt > 1 ? `${think} (legal on attempt ${attempt})` : think);
    if (say) await post("say", say);
    const result = await table.submit(actions, view);
    if (!result.ok) {
      errors = result.errors;
      log(`submission rejected: ${errors.join("; ")}`);
      continue;
    }
    log(
      `T${view.turn} played on attempt ${attempt}: ${result.payload.events.filter((e) => e.turn === view.turn).length} events`
    );
    return result.payload;
  }
}
async function driveLoadout(
  payload: ViewPayload,
  drv: Driver,
  quietThink: boolean
): Promise<void> {
  const view = payload.view;
  let error: string | undefined;
  for (let attempt = 1; ; attempt++) {
    const prompt = `${AGENT_RULES_DIGEST}\n\nTHE FULL RULES:\n${fullRules()}\n\n${loadoutPrompt(view)}${
      error
        ? `\n\nYOUR PREVIOUS CHOICE WAS REJECTED: ${error}. Choose again; every tile must fit its slot (forward: railgun, sensor_array or missiles; side: laser, shields, radiator, fuel_compressor, ballistic_rack or missiles) and you keep exactly 3 of the 5 offers by their ids.`
        : ""
    }`;
    const answer = askModel(prompt, drv, 240_000);
    transcript(`LOADOUT ANSWER attempt ${attempt}\n${JSON.stringify(answer)}`);
    if (!answer) {
      error = "no usable answer (one JSON object, nothing else)";
      continue;
    }
    const l = answer.loadout as { forward?: string; sides?: string[] } | undefined;
    const missionIds = Array.isArray(answer.missionIds) ? (answer.missionIds as string[]) : [];
    if (!l?.forward || l.sides?.length !== 4 || missionIds.length !== 3) {
      error = "the answer needs loadout.forward, exactly 4 loadout.sides and exactly 3 missionIds";
      log(`loadout attempt ${attempt}: ${error}`);
      continue;
    }
    try {
      await submitLoadout(
        { forwardSlots: [l.forward], sideSlots: l.sides } as ShipLoadout,
        missionIds
      );
    } catch (e) {
      error = (e as Error).message;
      log(`loadout attempt ${attempt} rejected: ${error}`);
      continue;
    }
    if (answer.think && !quietThink) await post("think", String(answer.think));
    if (answer.say) await post("say", String(answer.say));
    log(`loadout accepted on attempt ${attempt}`);
    return;
  }
}
async function driveDeploy(
  payload: ViewPayload,
  drv: Driver,
  quietThink: boolean
): Promise<void> {
  const view = payload.view;
  let error: string | undefined;
  for (let attempt = 1; ; attempt++) {
    const prompt = `${AGENT_RULES_DIGEST}\n\n${deployPrompt(view)}${
      error ? `\n\nYOUR PREVIOUS CHOICE WAS REJECTED: ${error}. Pick a free sector 0-23.` : ""
    }`;
    const answer = askModel(prompt, drv, 180_000);
    transcript(`DEPLOY ANSWER attempt ${attempt}\n${JSON.stringify(answer)}`);
    if (!answer || typeof answer.sector !== "number") {
      error = "the answer needs a numeric sector";
      continue;
    }
    try {
      await submitDeploy(Math.round(answer.sector));
    } catch (e) {
      error = (e as Error).message;
      log(`deploy attempt ${attempt} rejected: ${error}`);
      continue;
    }
    if (answer.think && !quietThink) await post("think", String(answer.think));
    if (answer.say) await post("say", String(answer.say));
    return;
  }
}
/** Which driver plays this seat: the flag, else the agent record stored with the player. */
function chooseDriver(): Driver {
  const name = flag("driver") ?? AGENT?.driver;
  if (!isDriver(name))
    die(
      name
        ? `Unknown driver ${name}: claude or codex.`
        : `${seatName ?? PLAYER} is not an agent seat. Pass --driver claude|codex, or play it with view/try/act.`
    );
  const model = flag("model") ?? (AGENT?.driver === name ? AGENT.model : DEFAULT_MODEL[name]);
  return { driver: name, model };
}

async function agentLoop(): Promise<void> {
  const drv = chooseDriver();
  const maxTurns = Number(flag("turns") ?? Infinity);
  const quietThink = has("quiet-think");
  const table = await Table.open();
  log(`seated at game ${needGame()} as ${needPlayer()}; driver ${agentLabel(drv)}`);
  let played = 0;
  try {
    while (played < maxTurns) {
      const payload = await table.waitForMyTurn(2 * 60 * 60 * 1000);
      const view = payload.view;
      if (view.phase === "ended") {
        log(`game over: ${nameOf(view)(view.winnerId ?? "")} wins`);
        break;
      }
      if (view.phase === "loadout") {
        await driveLoadout(payload, drv, quietThink);
        continue;
      }
      if (view.phase === "deployment") {
        await driveDeploy(payload, drv, quietThink);
        continue;
      }
      await driveTurn(table, payload, drv, quietThink);
      played++;
    }
  } finally {
    table.close();
  }
}

// ---------------------------------------------------------------------------
// Lobbies, the seat on the server, and the interactive menu
// ---------------------------------------------------------------------------

interface LobbySummary {
  lobbyId: string;
  lobbyName: string;
  maxPlayers: number;
  currentPlayers: number;
  gameStarted: boolean;
  createdAt: string;
}
interface SeatInfo {
  playerId: string;
  playerName: string;
  isBot: boolean;
  agent?: AgentInfo;
}
interface LobbyDetail {
  lobbyId: string;
  lobbyName: string;
  maxPlayers: number;
  hostPlayerId: string;
  players: SeatInfo[];
  gameId?: string;
}
interface PlayerRecord {
  playerId: string;
  playerName: string;
  agent?: AgentInfo;
}

const listLobbies = () => http<LobbySummary[]>("GET", "/api/lobbies", undefined, undefined);
const lobbyDetail = (id: string) =>
  http<LobbyDetail>("GET", `/api/lobbies/${id}`, undefined, undefined);
const allLobbies = async (): Promise<LobbyDetail[]> =>
  Promise.all((await listLobbies()).map((l) => lobbyDetail(l.lobbyId)));

/** "Codex (Codex · gpt-6-astra)", "Bot 1 (bot)", "thunkar". */
function seatLabel(p: SeatInfo, lobby?: LobbyDetail): string {
  const kind = p.isBot ? "bot" : agentLabel(p.agent);
  const host = lobby && lobby.hostPlayerId === p.playerId ? ", host" : "";
  return `${p.playerName}${kind || host ? ` (${[kind, host.replace(", ", "")].filter(Boolean).join(", ")})` : ""}`;
}

/**
 * Fill in PLAYER, LOBBY, GAME, seatName and AGENT from the server. With
 * `--player` the player's own status says where it sits; with `--as <name>`
 * the seat is the non-bot player of that name at one of the lobbies.
 */
async function resolveSeat(opts: { narrow: boolean }): Promise<void> {
  if (PLAYER) {
    const status = await http<{ player: PlayerRecord; lobby: LobbyDetail | null }>(
      "GET",
      `/api/players/${PLAYER}/status`
    ).catch((e: Error) =>
      die(
        `Player ${PLAYER} is unknown to ${SERVER} (${e.message}). Was Redis reset? \`yarn seat\` creates a new seat.`
      )
    );
    seatName ??= status.player.playerName;
    AGENT = status.player.agent;
    if (status.lobby) {
      LOBBY ??= status.lobby.lobbyId;
      GAME ??= status.lobby.gameId;
    }
    return;
  }
  if (!seatName) return;
  const wanted = seatName.toLowerCase();
  const matches = (await allLobbies())
    .flatMap((lobby) =>
      lobby.players
        .filter((p) => !p.isBot && p.playerName.toLowerCase() === wanted)
        .map((seat) => ({ lobby, seat }))
    )
    .filter(
      (m) =>
        !opts.narrow ||
        ((!LOBBY || m.lobby.lobbyId === LOBBY) && (!GAME || m.lobby.gameId === GAME))
    );
  if (matches.length === 0)
    die(
      `No seat named ${seatName} at any lobby on ${SERVER}. \`yarn seat\` creates a player and joins a lobby; --player <id> names a seat directly.`
    );
  if (matches.length > 1)
    die(
      `${matches.length} seats are named ${seatName}:\n${matches
        .map((m) => `  ${seatLabel(m.seat)}  player ${m.seat.playerId}  at ${m.lobby.lobbyName} (lobby ${m.lobby.lobbyId})`)
        .join("\n")}\nNarrow it with --lobby <id> or --game <id>, or use --player <id>.`
    );
  const [m] = matches;
  PLAYER = m.seat.playerId;
  seatName = m.seat.playerName;
  AGENT = m.seat.agent;
  LOBBY ??= m.lobby.lobbyId;
  GAME ??= m.lobby.gameId;
}

async function printLobbies(): Promise<LobbyDetail[]> {
  const details = await allLobbies();
  if (details.length === 0) {
    console.log("No lobbies on this server.");
    return [];
  }
  details.forEach((d, i) => {
    const state = d.gameId ? `STARTED  game ${d.gameId}` : `open ${d.players.length}/${d.maxPlayers}`;
    console.log(`${String(i + 1).padStart(2)}) ${d.lobbyName}  [${state}]  lobby ${d.lobbyId}`);
    for (const p of d.players)
      console.log(`      ${seatLabel(p, d)}${p.isBot ? "" : `  player ${p.playerId}`}`);
  });
  return details;
}

function printFollowUps(lobby: LobbyDetail): void {
  const who = agentLabel(AGENT);
  console.log(
    `\nSeated as ${seatName}${who ? ` (${who})` : ""} at ${lobby.lobbyName}${GAME ? `, game ${GAME}` : ""}.`
  );
  console.log(`Player ${PLAYER}. The seat is found on the server by name; nothing is stored here.`);
  const as = `--as ${JSON.stringify(seatName)}`;
  console.log(`  yarn seat view ${as}            what this seat sees, with the legal moves`);
  console.log(`  yarn seat wait ${as}            block until it is your turn`);
  console.log(`  yarn seat try ${as} --intent '{"move":{"kind":"coast"}}'`);
  console.log(`  yarn seat act ${as} --intent '{...}' --think "..." --say "..."`);
  console.log(`  yarn seat chat ${as}`);
  if (AGENT) console.log(`  yarn seat agent ${as}           ${who} plays this seat`);
  else console.log(`  yarn seat agent ${as} --driver claude|codex   let a model play this seat`);
  console.log(
    `If the name sits at several tables add --lobby ${lobby.lobbyId}, or use --player ${PLAYER}.`
  );
}

/** Interactive: server → who sits down → a lobby → start, bots or wait → the driver. */
async function menu(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  const ask = async (q: string, fallback = ""): Promise<string> => {
    const a = (await rl.question(fallback ? `${q} [${fallback}]: ` : `${q}: `)).trim();
    return a || fallback;
  };
  const pick = async (q: string, n: number): Promise<number | null> => {
    const a = await ask(q);
    const i = Number(a);
    return Number.isInteger(i) && i >= 1 && i <= n ? i - 1 : null;
  };
  const item = (i: number, text: string) => console.log(`${String(i).padStart(2)}) ${text}`);
  const attempt = async (what: string, run: () => Promise<unknown>): Promise<boolean> => {
    try {
      await run();
      return true;
    } catch (e) {
      console.log(`Could not ${what}: ${(e as Error).message}`);
      return false;
    }
  };
  try {
    SERVER = await ask("Server", SERVER);
    try {
      await http("GET", "/api/health", undefined, undefined);
    } catch (e) {
      console.log(`Cannot reach ${SERVER}: ${(e as Error).message}`);
      return;
    }

    // 1. Who sits down: a new player (agent or person), or back to a seat already at a table.
    const seated = (await allLobbies()).flatMap((lobby) =>
      lobby.players.filter((p) => !p.isBot).map((seat) => ({ lobby, seat }))
    );
    console.log("\nWho sits down?");
    item(1, `a new Claude agent (${DEFAULT_MODEL.claude})`);
    item(2, `a new Codex agent (${DEFAULT_MODEL.codex})`);
    item(3, "a new person at this terminal");
    seated.forEach((s, i) =>
      item(
        i + 4,
        `back as ${seatLabel(s.seat)} at ${s.lobby.lobbyName}${s.lobby.gameId ? " (started)" : ""}`
      )
    );
    const who = await pick("Choose", 3 + seated.length);
    if (who === null) return;
    let lobby: LobbyDetail | null = null;
    if (who < 3) {
      const driver = who === 0 ? "claude" : who === 1 ? "codex" : null;
      const name = await ask("Name", driver ? DRIVER_NAME[driver] : userInfo().username);
      const agent = driver ? { driver, model: await ask("Model", DEFAULT_MODEL[driver]) } : undefined;
      const created = await http<PlayerRecord>(
        "POST",
        "/api/players",
        { playerName: name, ...(agent ? { agent } : {}) },
        undefined
      );
      PLAYER = created.playerId;
      seatName = created.playerName;
      AGENT = created.agent;
      console.log(`Created ${seatLabel({ ...created, isBot: false })}: player ${PLAYER}.`);
    } else {
      const s = seated[who - 3];
      PLAYER = s.seat.playerId;
      seatName = s.seat.playerName;
      AGENT = s.seat.agent;
      lobby = s.lobby;
    }

    // 2. A lobby: join one that is open, or create one.
    while (!lobby) {
      console.log("\nLobbies on this server:");
      const details = await printLobbies();
      const n = details.length;
      item(n + 1, "create a lobby");
      item(n + 2, "refresh");
      const choice = await pick("Choose", n + 2);
      if (choice === null) return;
      if (choice === n + 1) continue;
      if (choice === n) {
        const name = await ask("Lobby name", "Arena");
        const max = Number(await ask("Seats", "3"));
        const bots = Number(await ask("Bots to add", "0"));
        const created = await http<{ lobbyId: string }>("POST", "/api/lobbies", {
          lobbyName: name,
          maxPlayers: max,
        });
        for (let i = 0; i < bots; i++) await http("POST", `/api/lobbies/${created.lobbyId}/bot`, {});
        lobby = await lobbyDetail(created.lobbyId);
        console.log(`Created ${lobby.lobbyName}; you are the host.`);
        continue;
      }
      const chosen = details[choice];
      if (chosen.gameId) {
        console.log("That table has already started; pick an open lobby or create one.");
        continue;
      }
      if (await attempt("join", () => http("POST", "/api/lobbies/join", { lobbyId: chosen.lobbyId }))) {
        lobby = await lobbyDetail(chosen.lobbyId);
        console.log(`Joined ${lobby.lobbyName}.`);
      }
    }
    LOBBY = lobby.lobbyId;

    // 3. At the table: start it, seat bots, or wait for the host.
    for (;;) {
      const d = await lobbyDetail(LOBBY);
      lobby = d;
      console.log(`\n${d.lobbyName} (${d.players.length}/${d.maxPlayers})${d.gameId ? ` — STARTED, game ${d.gameId}` : ""}`);
      for (const p of d.players) console.log(`  ${seatLabel(p, d)}${p.playerId === PLAYER ? "  ← you" : ""}`);
      if (d.gameId) {
        GAME = d.gameId;
        break;
      }
      const host = d.hostPlayerId === PLAYER;
      const options = host
        ? ["start the game now", "add a bot", "wait for someone else to start it", "leave the lobby"]
        : ["wait for the host to start it", "leave the lobby"];
      options.forEach((o, i) => item(i + 1, o));
      const w = await pick("Choose", options.length);
      if (w === null) continue;
      const chosen = options[w];
      if (chosen === "start the game now") {
        await attempt("start (2-4 seats, host only)", async () => {
          const { gameId } = await http<{ gameId: string }>("POST", `/api/lobbies/${LOBBY}/start`);
          GAME = gameId;
        });
        if (GAME) break;
      } else if (chosen === "add a bot") {
        await attempt("add a bot", () => http("POST", `/api/lobbies/${LOBBY}/bot`, {}));
      } else if (chosen === "leave the lobby") {
        await attempt("leave", () => http("POST", `/api/lobbies/${LOBBY}/leave`));
        console.log(`Left ${d.lobbyName}. Player ${PLAYER} still exists on the server.`);
        return;
      } else {
        process.stdout.write("waiting for the game to start");
        for (;;) {
          const again = await lobbyDetail(LOBBY);
          if (again.gameId) {
            GAME = again.gameId;
            console.log(` started: game ${GAME}`);
            break;
          }
          process.stdout.write(".");
          await new Promise((r) => setTimeout(r, 3000));
        }
        break;
      }
    }

    // 4. Play.
    printFollowUps(lobby);
    if (!AGENT) return;
    const go = await ask(`Start the ${agentLabel(AGENT)} driver for this seat now? (y/N)`, "N");
    if (go.toLowerCase().startsWith("y")) {
      rl.close();
      await agentLoop();
    }
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Commands that need no seat: they only read the server or create a player. */
const SEATLESS = new Set(["menu", "lobbies", "help", "rules", "guide", "register"]);

async function main(): Promise<void> {
  // `join` may name a seat that is not at the target lobby yet.
  if (!SEATLESS.has(command)) await resolveSeat({ narrow: command !== "join" });
  switch (command) {
    case "menu":
      await menu();
      return;
    case "lobbies":
      await printLobbies();
      return;
    case "help":
      console.log(
        readFileSync(new URL(import.meta.url))
          .toString()
          .split("*/")[0]
          .replace(/^\/\*\*\n/, "")
          .replace(/^ \* ?/gm, "")
      );
      return;
    case "register": {
      const name = flag("name") ?? seatName ?? die("register --name <name> [--agent claude|codex] [--model m]");
      const driver = flag("agent");
      if (driver !== undefined && !isDriver(driver)) die(`--agent must be claude or codex, not ${driver}`);
      const agent = isDriver(driver) ? { driver, model: flag("model") ?? DEFAULT_MODEL[driver] } : undefined;
      const created = await http<PlayerRecord>(
        "POST",
        "/api/players",
        { playerName: name, ...(agent ? { agent } : {}) },
        undefined
      );
      log(`created ${seatLabel({ ...created, isBot: false })} on ${SERVER}`);
      console.log(created.playerId);
      return;
    }
    case "lobby": {
      needPlayer();
      const lobby = await http<{ lobbyId: string }>("POST", "/api/lobbies", {
        lobbyName: flag("name") ?? "Arena",
        maxPlayers: Number(flag("max") ?? 3),
      });
      for (let i = 0; i < Number(flag("bots") ?? 0); i++)
        await http("POST", `/api/lobbies/${lobby.lobbyId}/bot`, {});
      console.log(lobby.lobbyId);
      return;
    }
    case "join": {
      needPlayer();
      const lobbyId = flag("lobby") ?? die("--lobby <id>");
      await http("POST", "/api/lobbies/join", { lobbyId });
      console.log(`joined ${lobbyId}`);
      return;
    }
    case "start": {
      needPlayer();
      const lobbyId = LOBBY ?? die("this seat is not at a lobby (or pass --lobby <id>)");
      const { gameId } = await http<{ gameId: string }>("POST", `/api/lobbies/${lobbyId}/start`);
      console.log(gameId);
      return;
    }
    case "leave": {
      needPlayer();
      const lobbyId = LOBBY ?? die("this seat is not at a lobby");
      await http("POST", `/api/lobbies/${lobbyId}/leave`);
      console.log(`left ${lobbyId}`);
      return;
    }
    case "view": {
      const payload = await getView();
      if (has("json")) console.log(JSON.stringify(payload, null, 2));
      else console.log(digest(payload, { rules: has("rules"), turns: Number(flag("turns") ?? 1) }));
      return;
    }
    case "options": {
      const { view } = await getView();
      console.log(JSON.stringify(seatOptions(view), null, 2));
      return;
    }
    case "guide":
      console.log(AGENT_RULES_DIGEST, "\n\n", AGENT_INTENT_GUIDE);
      return;
    case "try": {
      const { view } = await getView();
      const intent = parseIntent();
      const actions = intent
        ? buildTurn(view, intent)
        : { actions: JSON.parse(flag("actions") ?? "[]") as PlayerAction[], notes: [] };
      for (const n of actions.notes) console.log(`builder: ${n}`);
      const dry = await preview(actions.actions);
      if (dry.ok) console.log(`LEGAL. It would cause:\n${describeEvents(dry.events ?? [], view)}`);
      else
        console.log(`ILLEGAL:\n${(dry.errors ?? [dry.error]).map((e) => `  - ${e}`).join("\n")}`);
      if (has("show")) console.log(JSON.stringify(actions.actions, null, 2));
      process.exitCode = dry.ok ? 0 : 2;
      return;
    }
    case "rules":
      console.log(fullRules());
      return;
    case "act": {
      const table = await Table.open();
      try {
        const payload = await table
          .waitForMyTurn(Number(flag("timeout") ?? 5) * 1000)
          .catch(() => null);
        const view = (payload ?? (await getView())).view;
        if (view.phase !== "active" || view.activePlayerId !== PLAYER)
          die(`Not your turn (phase ${view.phase}, ${nameOf(view)(view.activePlayerId)} to act)`);
        let actions: PlayerAction[];
        {
          const intent = parseIntent();
          const built = intent
            ? buildTurn(view, intent)
            : { actions: JSON.parse(flag("actions") ?? "[]") as PlayerAction[], notes: [] };
          for (const n of built.notes) log(`builder: ${n}`);
          const dry = await preview(built.actions);
          if (!dry.ok) {
            const errors = dry.errors ?? [dry.error ?? "rejected"];
            die(`ILLEGAL, nothing submitted:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
          }
          actions = built.actions;
        }
        const result = await table.submit(actions, view);
        if (!result.ok) die(`Rejected: ${result.errors.join("; ")}`);
        const mine = result.payload.events.filter((e) => e.turn === view.turn);
        console.log(`Turn ${view.turn} played.\n${describeEvents(mine, result.payload.view)}`);
        if (flag("think")) await post("think", flag("think")!);
        if (flag("say")) await post("say", flag("say")!);
      } finally {
        table.close();
      }
      return;
    }
    case "loadout": {
      const { view } = await getView();
      if (!view.me) die("not seated");
      if (!flag("forward") && !flag("missions")) {
        console.log(loadoutPrompt(view));
        return;
      }
      const loadout = {
        forwardSlots: [flag("forward")!],
        sideSlots: flag("sides")!.split(","),
      } as ShipLoadout;
      await submitLoadout(loadout, flag("missions")!.split(","));
      console.log("loadout accepted");
      return;
    }
    case "deploy": {
      const sector = Number(flag("sector") ?? die("--sector <n>"));
      await submitDeploy(sector);
      console.log(`deployed at Black Hole R4 S${sector}`);
      return;
    }
    case "say":
    case "think":
      await post(command, positional.join(" ") || flag("text") || die("nothing to say"));
      console.log("posted");
      return;
    case "chat": {
      const lines = await chatLines(Number(flag("last") ?? 50));
      for (const m of lines)
        console.log(`T${m.turn} ${m.name}${m.kind === "think" ? " (thinking)" : ""}: ${m.text}`);
      return;
    }
    case "wait": {
      const table = await Table.open();
      try {
        const payload = await table.waitForMyTurn(Number(flag("timeout") ?? 3600) * 1000);
        console.log(digest(payload, { rules: has("rules"), turns: Number(flag("turns") ?? 2) }));
      } finally {
        if (!has("hold")) table.close();
        else await new Promise(() => {});
      }
      return;
    }
    case "agent":
      await agentLoop();
      return;
    default:
      die(`Unknown command ${command}. Try: yarn seat help`);
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
