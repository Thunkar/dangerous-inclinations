/**
 * A seat at the table for an agent (or a person at a terminal).
 *
 *   yarn seat register --as Codex                 create a player identity and remember it
 *   yarn seat lobby --as Codex --name "Arena" --bots 1 --max 3   create a lobby (+ bots), print its id
 *   yarn seat join --as Codex --lobby <id>        join a lobby
 *   yarn seat start --as Codex --lobby <id>       start the game, remember its id
 *   yarn seat view --as Codex [--game <id>] [--rules] [--json] [--turns 2]
 *   yarn seat options --as Codex                  legal moves, as JSON
 *   yarn seat try --as Codex --intent '{...}'     build + dry-run a turn: errors or the events it would cause
 *   yarn seat act --as Codex --intent '{...}' [--fallback]   build, dry-run, submit; --fallback lets the bot play if illegal
 *   yarn seat bot-turn --as Codex                 the engine's bot plays this turn
 *   yarn seat loadout --as Codex --forward railgun --sides missiles,radiator,laser,shields --missions m1,m2,m3 | --auto
 *   yarn seat deploy --as Codex --sector 6 | --auto
 *   yarn seat say --as Codex "text" / think "text" / chat
 *   yarn seat wait --as Codex [--timeout 600]     hold a socket open until it is your turn, then print the view
 *   yarn seat agent --as Codex --driver codex [--model gpt-6-astra] [--turns N] [--quiet-think]
 *
 * Identities live in ~/.config/dangerous-inclinations/seats.json. Turns go over
 * the game WebSocket like a browser's; everything else is REST. An agent can
 * never stall the game: `act --fallback` and the driver hand the turn to the
 * engine's own bot when an intent is illegal twice or the model does not
 * answer in time.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
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
  botChooseDeployment,
  botChooseLoadout,
  botDecideActions,
  describeEvent,
  describeMission,
  describeViewForAgent,
  seatOptions,
  type TurnIntent,
} from "@dangerous-inclinations/engine";
import type { ChatMessage, PreviewPayload, ServerGameMessage } from "../src/protocol.ts";

// ---------------------------------------------------------------------------
// Arguments and identities
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith("--")) ?? "help";
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

const CONFIG_DIR = join(homedir(), ".config", "dangerous-inclinations");
const SEATS_FILE = join(CONFIG_DIR, "seats.json");
interface Seat {
  playerId: string;
  server: string;
  lastGame?: string;
  lastLobby?: string;
}
function loadSeats(): Record<string, Seat> {
  if (!existsSync(SEATS_FILE)) return {};
  return JSON.parse(readFileSync(SEATS_FILE, "utf8")) as Record<string, Seat>;
}
function saveSeats(seats: Record<string, Seat>): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(SEATS_FILE, JSON.stringify(seats, null, 2) + "\n");
}
const seatName = flag("as");
const seats = loadSeats();
const seat: Seat | undefined = seatName ? seats[seatName] : undefined;
const SERVER = flag("server") ?? seat?.server ?? process.env.DI_SERVER ?? "http://localhost:3000";
const PLAYER = flag("player") ?? seat?.playerId ?? process.env.DI_PLAYER;
const GAME = flag("game") ?? seat?.lastGame ?? process.env.DI_GAME;
function remember(patch: Partial<Seat>): void {
  if (!seatName) return;
  seats[seatName] = {
    ...(seats[seatName] ?? { playerId: PLAYER ?? "", server: SERVER }),
    ...patch,
  };
  saveSeats(seats);
}
const log = (s: string) => console.error(`[seat${seatName ? ` ${seatName}` : ""}] ${s}`);
function die(message: string): never {
  console.error(message);
  process.exit(1);
}
function needPlayer(): string {
  return PLAYER ?? die("No player: use --as <name> (after `register`) or --player <id>");
}
function needGame(): string {
  return GAME ?? die("No game: use --game <id> (the id is remembered after `start` or `join`)");
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
// The Codex driver
// ---------------------------------------------------------------------------

function askCodex(
  prompt: string,
  model: string,
  timeoutMs: number
): Record<string, unknown> | null {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const promptFile = join(CONFIG_DIR, `prompt-${process.pid}.txt`);
  const outFile = join(CONFIG_DIR, `answer-${process.pid}.txt`);
  writeFileSync(promptFile, prompt);
  const run = spawnSync(
    "codex",
    [
      "exec",
      "-m",
      model,
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--ephemeral",
      "-o",
      outFile,
      "-",
    ],
    { input: prompt, encoding: "utf8", timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }
  );
  if (run.error) {
    log(`codex failed to run: ${run.error.message}`);
    return null;
  }
  const text = existsSync(outFile) ? readFileSync(outFile, "utf8") : run.stdout;
  // The answer is one JSON object, possibly inside a code fence; take the outermost braces.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    log(`codex gave no JSON (exit ${run.status}); stderr tail: ${run.stderr.slice(-400)}`);
    return null;
  }
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch (e) {
    log(`codex JSON did not parse: ${(e as Error).message}`);
    return null;
  }
}

function transcript(line: string): void {
  mkdirSync(join(CONFIG_DIR, "logs"), { recursive: true });
  appendFileSync(
    join(CONFIG_DIR, "logs", `${GAME ?? "game"}-${seatName ?? PLAYER}.log`),
    `${new Date().toISOString()} ${line}\n`
  );
}

async function turnPrompt(payload: ViewPayload, errors?: string[]): Promise<string> {
  const chat = (await chatLines(12)).filter((m) => m.kind === "say");
  const talk = chat.length
    ? `\nTABLE TALK (recent, public):\n${chat.map((m) => `  T${m.turn} ${m.name}: ${m.text}`).join("\n")}\n`
    : "";
  return `You are playing a seat in Dangerous Inclinations, a hidden-information tabletop space game. Play to win. Be concrete and legal. You cannot run commands or tools here: answer from the text below; the table validates your intent for you and will come back to you once if it is illegal.

${AGENT_RULES_DIGEST}

${digest(payload, { rules: false, turns: 2 })}
${talk}
${AGENT_INTENT_GUIDE}
${errors ? `\nYOUR PREVIOUS INTENT WAS REJECTED BY THE ENGINE:\n${errors.map((e) => `  - ${e}`).join("\n")}\nFix it (use LEGAL THIS TURN above) or reply with a plain coast.\n` : ""}
Reply with ONE JSON object: {"think": "<your reasoning in 1-3 sentences; a human observer reads this>", "say": "<optional table talk heard by everyone, or empty>", "intent": {...}}`;
}

async function driveTurn(
  table: Table,
  payload: ViewPayload,
  model: string,
  quietThink: boolean
): Promise<ViewPayload> {
  const view = payload.view;
  let actions: PlayerAction[] | null = null;
  let think = "";
  let say = "";
  let errors: string[] | undefined;
  for (let attempt = 1; attempt <= 2 && !actions; attempt++) {
    const prompt = await turnPrompt(payload, errors);
    transcript(`PROMPT T${view.turn} attempt ${attempt}\n${prompt}`);
    const answer = askCodex(prompt, model, 240_000);
    transcript(`ANSWER T${view.turn} attempt ${attempt}\n${JSON.stringify(answer)}`);
    if (!answer) {
      errors = ["the model gave no usable answer"];
      continue;
    }
    think = String(answer.think ?? "");
    say = String(answer.say ?? "");
    try {
      const built = buildTurn(view, (answer.intent ?? {}) as TurnIntent);
      for (const n of built.notes) log(`builder: ${n}`);
      const dry = await preview(built.actions);
      if (dry.ok) actions = built.actions;
      else {
        errors = dry.errors ?? [dry.error ?? "rejected"];
        log(`attempt ${attempt} rejected: ${errors.join("; ")}`);
      }
    } catch (e) {
      errors = [(e as Error).message];
      log(`attempt ${attempt} failed to build: ${errors[0]}`);
    }
  }
  if (!actions) {
    actions = botDecideActions(view).actions;
    think = `${think ? think + " " : ""}(The autopilot took this turn: my intent was illegal twice.)`;
    log("falling back to the engine's bot for this turn");
  }
  if (think && !quietThink) await post("think", think);
  if (say) await post("say", say);
  const result = await table.submit(actions, view);
  if (!result.ok) {
    log(`submission rejected (${result.errors.join("; ")}); the bot takes it`);
    const again = await table.submit(botDecideActions(view).actions, view);
    if (!again.ok) throw new Error(`even the bot's turn was rejected: ${again.errors.join("; ")}`);
    return again.payload;
  }
  log(
    `T${view.turn} played: ${result.payload.events.filter((e) => e.turn === view.turn).length} events`
  );
  return result.payload;
}

async function driveLoadout(
  payload: ViewPayload,
  model: string,
  quietThink: boolean
): Promise<void> {
  const view = payload.view;
  const me = view.me!;
  const answer = askCodex(`${AGENT_RULES_DIGEST}\n\n${loadoutPrompt(view)}`, model, 240_000);
  transcript(`LOADOUT ANSWER\n${JSON.stringify(answer)}`);
  const auto = botChooseLoadout(me.missionOffers, {
    playerCount: view.players.length,
    rules: view.rules,
  });
  let loadout: ShipLoadout = auto.loadout;
  let missionIds: string[] = auto.missionIds;
  let think = "(autopilot loadout)";
  if (answer) {
    think = String(answer.think ?? think);
    const l = answer.loadout as { forward?: string; sides?: string[] } | undefined;
    if (l?.forward && l.sides?.length === 4)
      loadout = { forwardSlots: [l.forward], sideSlots: l.sides } as ShipLoadout;
    if (Array.isArray(answer.missionIds) && answer.missionIds.length === 3)
      missionIds = answer.missionIds as string[];
  }
  try {
    await submitLoadout(loadout, missionIds);
  } catch (e) {
    log(`loadout rejected (${(e as Error).message}); the bot's choice goes in`);
    await submitLoadout(auto.loadout, auto.missionIds);
    think += " (The autopilot fixed an illegal loadout.)";
  }
  if (!quietThink) await post("think", think);
  if (answer?.say) await post("say", String(answer.say));
}

async function driveDeploy(
  payload: ViewPayload,
  model: string,
  quietThink: boolean
): Promise<void> {
  const view = payload.view;
  const answer = askCodex(`${AGENT_RULES_DIGEST}\n\n${deployPrompt(view)}`, model, 180_000);
  transcript(`DEPLOY ANSWER\n${JSON.stringify(answer)}`);
  const auto = botChooseDeployment(view, (n) => Math.floor(Math.random() * n)).sector;
  let sector = typeof answer?.sector === "number" ? Math.round(answer.sector) : auto;
  try {
    await submitDeploy(sector);
  } catch (e) {
    log(`deploy at ${sector} rejected (${(e as Error).message}); trying the bot's pick`);
    sector = auto;
    await submitDeploy(sector);
  }
  if (answer?.think && !quietThink) await post("think", String(answer.think));
  if (answer?.say) await post("say", String(answer.say));
}

async function agentLoop(): Promise<void> {
  const driver = flag("driver") ?? "codex";
  if (driver !== "codex")
    die(`Unknown driver ${driver}. Only "codex" is built in; a person plays with view/try/act.`);
  const model = flag("model") ?? "gpt-6-astra";
  const maxTurns = Number(flag("turns") ?? Infinity);
  const quietThink = has("quiet-think");
  const table = await Table.open();
  log(`seated at game ${needGame()} as ${needPlayer()}; driver ${driver} (${model})`);
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
        await driveLoadout(payload, model, quietThink);
        continue;
      }
      if (view.phase === "deployment") {
        await driveDeploy(payload, model, quietThink);
        continue;
      }
      await driveTurn(table, payload, model, quietThink);
      played++;
    }
  } finally {
    table.close();
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  switch (command) {
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
      const name = flag("name") ?? seatName ?? die("--as <name> or --name <name>");
      const { playerId } = await http<{ playerId: string }>(
        "POST",
        "/api/players",
        { playerName: name },
        undefined
      );
      if (seatName) {
        seats[seatName] = { playerId, server: SERVER };
        saveSeats(seats);
      }
      console.log(playerId);
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
      remember({ lastLobby: lobby.lobbyId });
      console.log(lobby.lobbyId);
      return;
    }
    case "join": {
      needPlayer();
      const lobbyId = flag("lobby") ?? seat?.lastLobby ?? die("--lobby <id>");
      await http("POST", "/api/lobbies/join", { lobbyId });
      remember({ lastLobby: lobbyId });
      console.log(`joined ${lobbyId}`);
      return;
    }
    case "start": {
      needPlayer();
      const lobbyId = flag("lobby") ?? seat?.lastLobby ?? die("--lobby <id>");
      const { gameId } = await http<{ gameId: string }>("POST", `/api/lobbies/${lobbyId}/start`);
      remember({ lastGame: gameId });
      console.log(gameId);
      return;
    }
    case "use": {
      remember({ lastGame: flag("game") ?? positional[0] ?? die("use <gameId>") });
      console.log("ok");
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
    case "act":
    case "bot-turn": {
      const table = await Table.open();
      try {
        const payload = await table
          .waitForMyTurn(Number(flag("timeout") ?? 5) * 1000)
          .catch(() => null);
        const view = (payload ?? (await getView())).view;
        if (view.phase !== "active" || view.activePlayerId !== PLAYER)
          die(`Not your turn (phase ${view.phase}, ${nameOf(view)(view.activePlayerId)} to act)`);
        let actions: PlayerAction[];
        if (command === "bot-turn") actions = botDecideActions(view).actions;
        else {
          const intent = parseIntent();
          const built = intent
            ? buildTurn(view, intent)
            : { actions: JSON.parse(flag("actions") ?? "[]") as PlayerAction[], notes: [] };
          for (const n of built.notes) log(`builder: ${n}`);
          const dry = await preview(built.actions);
          if (!dry.ok) {
            const errors = dry.errors ?? [dry.error ?? "rejected"];
            if (!has("fallback"))
              die(`ILLEGAL, nothing submitted:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
            log(`illegal (${errors.join("; ")}); the bot plays this turn`);
            built.actions = botDecideActions(view).actions;
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
      const me = view.me ?? die("not seated");
      if (has("auto")) {
        const c = botChooseLoadout(me.missionOffers, {
          playerCount: view.players.length,
          rules: view.rules,
        });
        await submitLoadout(c.loadout, c.missionIds);
        console.log(`auto: ${JSON.stringify(c.loadout)} missions ${c.missionIds.join(",")}`);
        return;
      }
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
      const { view } = await getView();
      const sector = has("auto")
        ? botChooseDeployment(view, (n) => Math.floor(Math.random() * n)).sector
        : Number(flag("sector") ?? die("--sector <n> or --auto"));
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
