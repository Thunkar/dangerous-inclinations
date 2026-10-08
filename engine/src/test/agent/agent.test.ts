import { describe, it, expect } from "vitest";
import { PLANET_OUTER_RING, STATION_RING } from "../../models/gravityWells.ts";
import { executeTurn } from "../../game/turns.ts";
import { viewFor } from "../../game/view.ts";
import type { GameState } from "../../models/game.ts";
import {
  buildTurn,
  describeViewForAgent,
  seatOptions,
  type FireIntent,
  type TurnIntent,
} from "../../agent/index.ts";
import {
  ALPHA,
  BETA,
  BH,
  checkEach,
  deliverMission,
  escortMission,
  getPlayer,
  makeTwoPlayerGame,
  withMissions,
  withPlayer,
  withPower,
  withShip,
  cratesAboard,
  alongside,
  piracyMission,
  salvageMission,
  surveyMission,
  LANDING,
} from "../testUtils.ts";
import { brawlerState, laneState, sensorState } from "../game/actionOrder.scenarios.ts";

describe("agent seat tooling", () => {
  const start = () =>
    makeTwoPlayerGame({ wellId: BH, ring: 3, sector: 0 }, { wellId: BH, ring: 4, sector: 0 });

  it("lists the legal burns, the jump, the weapons in range and what can be powered", () => {
    const o = seatOptions(viewFor(start(), "p1"));
    expect(o.velocity).toBe(4);
    expect(o.burns.map((b) => `${b.intensity}-${b.facing}`)).toEqual(
      expect.arrayContaining([
        "soft-prograde",
        "medium-prograde",
        "soft-retrograde",
        "medium-retrograde",
      ])
    );
    // From ring 3 a hard burn inward would leave the rings: not offered.
    expect(o.burns.some((b) => b.intensity === "hard" && b.facing === "retrograde")).toBe(false);
    expect(o.jump).toBeNull();
    const laser = o.weapons.find((w) => w.weapon === "side-0");
    expect(laser?.targetsNow).toEqual(["p2"]); // port laser fires outward: p2 is one ring out
    // Rounds left is the biggest salvo the launcher can fire; nothing else has ammo.
    expect(o.weapons.find((w) => w.weapon === "side-3")?.ammo).toBe(4);
    expect(laser?.ammo).toBeNull();
    // Each powerable subsystem, with every amount it takes: a shield one or two.
    expect(o.power).toEqual([{ id: "side-2", type: "shields", amounts: [1, 2] }]);
  });

  it("builds a salvo from a count and leaves the tile at its minimum cubes", () => {
    const state = start();
    const built = buildTurn(viewFor(state, "p1"), {
      fire: [{ weapon: "side-3", target: "p2", count: 3 }],
    });
    const shot = built.actions.find((a) => a.type === "fire_weapon");
    expect(shot).toMatchObject({ data: { subsystemId: "side-3", count: 3 } });
    // A salvo of any size is one use of the tile, and the launch powers it:
    // the builder has no cubes to place.
    expect(built.actions.some((a) => a.type === "power")).toBe(false);
    expect(executeTurn(state, built.actions).errors).toBeUndefined();
  });

  // Coasts, soft burns, shots in every order and jumps are the loops' below.
  it.each([
    ["a scooping coast", { move: { kind: "coast" as const, scoop: true } }],
    [
      "a rotation and an inward medium burn",
      {
        move: {
          kind: "burn" as const,
          intensity: "medium" as const,
          facing: "retrograde" as const,
        },
      },
    ],
  ])("builds a legal turn for %s", (_label, intent) => {
    const state = start();
    const built = buildTurn(viewFor(state, "p1"), intent);
    const result = executeTurn(state, built.actions);
    expect(result.errors).toBeUndefined();
  });

  it.each([
    ["the fuel", "fuel", [{ type: "dock_sale", data: { sale: "fuel" } }], 0],
    ["nothing", "none", [{ type: "dock_sale", data: { sale: "none" } }], 0],
    ["an item not in the hold", "item-99", [], 1],
  ])("passes %s for the visit through as a dock_sale action", (_label, sell, expected, notes) => {
    const built = buildTurn(viewFor(start(), "p1"), { sell });
    expect(built.actions.filter((a) => a.type === "dock_sale")).toEqual(
      expected.map((e) => expect.objectContaining(e))
    );
    expect(built.notes).toHaveLength(notes);
    expect(executeTurn(start(), built.actions).errors).toBeUndefined();
  });

  /** p1 holds an Escort and drifts from S0 onto S4, where p2 sits with a crate aboard. */
  const escortTable = (withCard = true) => {
    let state = makeTwoPlayerGame(
      { wellId: BH, ring: 3, sector: 0 },
      { wellId: BH, ring: 3, sector: 4 }
    );
    if (withCard) state = withMissions(state, "p1", [escortMission()]);
    state = withMissions(state, "p2", [deliverMission(ALPHA, BETA)]);
    return withPlayer(state, "p2", {
      cargo: cratesAboard(getPlayer(state, "p2").cargo),
    });
  };

  it.each([
    [
      "with an Escort in hand",
      true,
      { markersInHand: 1, carriersNow: ["p2"], carriersAfterCoast: ["p2"] },
    ],
    ["without one", false, null],
  ])("offers the Escort choice after a coast %s", (_label, withCard, expected) => {
    expect(seatOptions(viewFor(escortTable(withCard), "p1")).escort).toEqual(expected);
  });

  it.each<[string, string[], string[], number]>([
    ["a carrier", ["p2"], ["p2"], 0],
    ["the same carrier twice", ["p2", "p2"], ["p2"], 1],
    ["its own ship", ["p1"], [], 1],
    ["a player not at the table", ["p9"], [], 1],
  ])("builds escort_mark actions from %s", (_label, escort, expected, notes) => {
    const state = escortTable();
    const built = buildTurn(viewFor(state, "p1"), { escort });
    expect(
      built.actions.flatMap((a) => (a.type === "escort_mark" ? [a.data.carrierId] : []))
    ).toEqual(expected);
    expect(built.notes).toHaveLength(notes);
    expect(executeTurn(state, built.actions).errors).toBeUndefined();
  });

  it.each<[string, (s: GameState) => GameState, string[]]>([
    ["a carrier on the ring where the ship starts: mark, then coast", (s) => s, ["escort_mark", "coast"]],
    [
      "a carrier on the ring the move ends on: burn, then mark",
      (s) => withShip(s, "p2", { ring: 4, sector: 12 }),
      ["burn", "escort_mark"],
    ],
  ])("places an Escort marker for %s", (_label, patch, order) => {
    const state = patch(escortTable());
    const move = order.includes("burn") ? { kind: "burn" as const, intensity: "soft" as const } : undefined;
    const built = buildTurn(viewFor(state, "p1"), { escort: ["p2"], move });
    expect(
      [...built.actions].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)).map((a) => a.type)
    ).toEqual(order);
    expect(built.notes).toEqual([]);
    expect(executeTurn(state, built.actions).errors).toBeUndefined();
  });

  it.each<[string, (s: GameState) => GameState]>([
    ["a carrier just back from Home", (s) => withPlayer(s, "p2", { recovering: true })],
    ["a carrier on no ring the turn reaches", (s) => withShip(s, "p2", { ring: 2 })],
    ["a carrier with nothing aboard", (s) => withPlayer(s, "p2", { cargo: [] })],
  ])("notes an Escort marker the engine will refuse: %s", (_label, patch) => {
    const state = patch(escortTable());
    const built = buildTurn(viewFor(state, "p1"), { escort: ["p2"] });
    expect(built.notes).toHaveLength(1);
    expect(executeTurn(state, built.actions).errors?.length).toBeGreaterThan(0);
  });

  /** p1 holds a Survey and a Salvage, at `ring` of the black hole facing `facing`. */
  const diveTable = (ring: number, facing: "prograde" | "retrograde" = "prograde") =>
    withMissions(
      makeTwoPlayerGame({ wellId: BH, ring, sector: 0, facing }, { wellId: BH, ring: 4, sector: 12 }),
      "p1",
      [surveyMission(), salvageMission()]
    );
  it.each<[string, () => GameState, Parameters<typeof buildTurn>[1], string[], number]>([
    ["a survey on ring 1 where the ship starts", () => diveTable(1), { survey: true }, ["survey", "coast"], 0],
    [
      "a survey on ring 1 where the move ends",
      () => diveTable(2, "retrograde"),
      { survey: true, move: { kind: "burn", intensity: "soft" } },
      ["burn", "survey"],
      0,
    ],
    ["a survey off ring 1", () => diveTable(3), { survey: true }, ["coast", "survey"], 1],
    [
      "a salvage of the wreck where the ship starts",
      () => ({ ...diveTable(3), wrecks: [{ id: "w", wellId: BH, ring: 3, sector: 0 }] }),
      { salvage: "w" },
      ["salvage", "coast"],
      0,
    ],
    [
      "a salvage of the wreck the coast ends on",
      () => ({ ...diveTable(3), wrecks: [{ id: "w", ...LANDING }] }),
      { salvage: "w" },
      ["coast", "salvage"],
      0,
    ],
    [
      "a salvage of a wreck elsewhere",
      () => ({ ...diveTable(3), wrecks: [{ id: "w", wellId: BH, ring: 3, sector: 12 }] }),
      { salvage: "w" },
      ["coast", "salvage"],
      1,
    ],
    ["a salvage of no wreck on the board", () => diveTable(3), { salvage: "w" }, ["coast"], 1],
  ])("places %s", (_label, build, intent, order, notes) => {
    const state = build();
    const built = buildTurn(viewFor(state, "p1"), intent);
    expect(
      [...built.actions].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)).map((a) => a.type)
    ).toEqual(order);
    expect(built.notes).toHaveLength(notes);
    // A turn the builder notes nothing on is legal; one it notes is refused,
    // except a dropped salvage, which leaves a plain coast.
    const refused = (executeTurn(state, built.actions).errors?.length ?? 0) > 0;
    expect(refused).toBe(notes > 0 && order.length > 1);
  });

  // `salvage: true` names no wreck: where a wreck is, or after the shots for
  // the wreck a kill leaves (a ship is settled the moment it dies).
  it.each<[string, () => GameState, TurnIntent, string[], number, string]>([
    [
      "after a killing shot in the sector the move ends on",
      () => withShip(diveTable(3), "p2", { ...LANDING, hitPoints: 1 }),
      { salvage: true, fire: [{ weapon: "side-0", target: "p2" }] },
      ["coast", "fire_weapon", "salvage"],
      1,
      "wreck_salvaged",
    ],
    [
      "on the wreck where the ship starts",
      () => ({ ...diveTable(3), wrecks: [{ id: "w", wellId: BH, ring: 3, sector: 0 }] }),
      { salvage: true },
      ["salvage", "coast"],
      0,
      "wreck_salvaged",
    ],
    [
      "with no wreck and no shot",
      () => diveTable(3),
      { salvage: true },
      ["coast", "salvage"],
      1,
      "action_skipped",
    ],
  ])("places a salvage naming no wreck %s", (_label, build, intent, order, notes, event) => {
    const state = build();
    const built = buildTurn(viewFor(state, "p1"), intent);
    expect(
      [...built.actions].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)).map((a) => a.type)
    ).toEqual(order);
    expect(built.notes).toHaveLength(notes);
    // Never refused: a salvage that finds no wreck is simply not taken.
    const result = executeTurn(state, built.actions);
    expect(result.errors).toBeUndefined();
    expect(result.events.map((e) => e.type)).toContain(event);
  });

  it.each<[string, () => GameState, { survey: object | null; salvage: object | null }]>([
    [
      "on ring 1 beside a wreck",
      () => ({ ...diveTable(1), wrecks: [{ id: "w", wellId: BH, ring: 1, sector: 0 }] }),
      { survey: { now: true, afterCoast: true }, salvage: { wrecksNow: ["w"], wrecksAfterCoast: [] } },
    ],
    [
      "on ring 3 with nothing near",
      () => diveTable(3),
      { survey: { now: false, afterCoast: false }, salvage: { wrecksNow: [], wrecksAfterCoast: [] } },
    ],
    ["holding neither card", () => withMissions(diveTable(1), "p1", []), { survey: null, salvage: null }],
  ])("offers the survey and the salvage %s", (_label, build, expected) => {
    const o = seatOptions(viewFor(build(), "p1"));
    expect({ survey: o.survey, salvage: o.salvage }).toEqual(expected);
  });

  // Piracy: p1 one coast short of p2 (`alongside`), or in p2's sector from the start.
  const pirateTable = (together: boolean): GameState => {
    const state = alongside([piracyMission()], [deliverMission(ALPHA, BETA, "deliver-p2")]);
    return together ? withShip(state, "p1", LANDING) : state;
  };
  it.each<[string, boolean, TurnIntent["fire"], string[]]>([
    [
      "a victim in the start's sector, shot at too: seize, shot, coast",
      true,
      [{ weapon: "side-0", target: "p2" }],
      ["seize", "fire_weapon", "coast"],
    ],
    ["a victim in the start's sector: seize, then coast", true, [], ["seize", "coast"]],
    ["a victim the coast ends on: coast, then seize", false, [], ["coast", "seize"]],
  ])("places a seizure from %s", (_label, together, fire, order) => {
    const state = pirateTable(together);
    const cargoId = getPlayer(state, "p2").cargo[0].id;
    const built = buildTurn(viewFor(state, "p1"), {
      fire,
      seize: [{ victim: "p2", cargoId }],
    });
    expect(
      [...built.actions].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)).map((a) => a.type)
    ).toEqual(order);
    expect(built.notes).toEqual([]);
    const result = executeTurn(state, built.actions);
    expect(result.errors).toBeUndefined();
    expect(result.events.filter((e) => e.type === "cargo_seized")).toHaveLength(1);
  });

  it.each<[string, (s: GameState) => GameState]>([
    ["a victim nobody's move reaches", (s) => withShip(s, "p2", { sector: 12 })],
    ["a victim just back from Home", (s) => withPlayer(s, "p2", { recovering: true })],
    ["an item not aboard", (s) => withPlayer(s, "p2", { cargo: [] })],
  ])("notes a seizure the engine will refuse: %s", (_label, patch) => {
    const state = patch(pirateTable(false));
    const built = buildTurn(viewFor(state, "p1"), {
      seize: [{ victim: "p2", cargoId: getPlayer(pirateTable(false), "p2").cargo[0].id }],
    });
    expect(built.notes).toHaveLength(1);
    expect(executeTurn(state, built.actions).errors?.length).toBeGreaterThan(0);
  });

  it.each<[string, boolean, number]>([
    ["sharing the sector now", true, 1],
    ["one coast short", false, 0],
  ])("offers the items to seize %s", (_label, together, now) => {
    const options = seatOptions(viewFor(pirateTable(together), "p1")).seize;
    expect(options?.itemsNow).toHaveLength(now);
    expect(options?.itemsAfterCoast).toHaveLength(1 - now);
  });

  it("builds a burn off the rings as asked and leaves the refusal to the engine", () => {
    // No autopilot: the builder does not swap in a legal burn, and it places no
    // cubes (the burn powers the engines). The engine's refusal is what the
    // agent is shown.
    const state = start();
    const built = buildTurn(viewFor(state, "p1"), { move: { kind: "burn", intensity: "hard" } });
    expect(built.actions.map((a) => a.type)).toEqual(["burn"]);
    expect(executeTurn(state, built.actions).errors?.length).toBeGreaterThan(0);
  });

  it("tells an agent that asks to power a tile an action would power anyway", () => {
    const built = buildTurn(viewFor(start(), "p1"), { power: { engines: 3 } });
    expect(built.notes).toHaveLength(1);
    expect(built.actions.some((a) => a.type === "power")).toBe(false);
  });

  it("powers only what the intent names: last turn's cubes come off at the start", () => {
    const state = withPower(start(), "p1", "side-2", 2);
    const coasting = buildTurn(viewFor(state, "p1"), { move: { kind: "coast" } });
    expect(coasting.actions.some((a) => a.type === "power")).toBe(false);
    const walled = buildTurn(viewFor(state, "p1"), {
      power: { "side-2": 2 },
      move: { kind: "burn", intensity: "soft" },
    });
    // Power runs first, then the move.
    expect(walled.actions[0]).toMatchObject({
      type: "power",
      sequence: 1,
      data: { subsystemId: "side-2", amount: 2 },
    });
    expect(walled.actions.find((a) => a.type === "burn")?.sequence).toBe(2);
    expect(executeTurn(state, walled.actions).errors).toBeUndefined();
  });

  it("the digest carries the seat's ship, cards, opponents and legal options", () => {
    const text = describeViewForAgent(viewFor(start(), "p1"), [], { includeRules: false });
    expect(text).toContain("YOUR SHIP: Black Hole R3 S0");
    expect(text).toContain("OPPONENTS:");
    expect(text).toContain("LEGAL THIS TURN:");
    expect(text).toContain("side-0 (laser");
  });

  it("jump options appear only on a departure arc, with the phasing the arc allows", () => {
    const onLane = makeTwoPlayerGame(
      { wellId: BH, ring: 5, sector: 17 },
      { wellId: ALPHA, ring: PLANET_OUTER_RING, sector: 0 }
    );
    const jump = seatOptions(viewFor(onLane, "p1")).jump;
    expect(jump?.destinationWellId).toBe(ALPHA);
    // Sector 17 is the second sector of the 16-19 arc: one back, two forward.
    expect(jump?.adjustment).toEqual({ min: -1, max: 2 });
  });

  it("builds the phased jump asked for, in the arc or out of it", () => {
    const onLane = makeTwoPlayerGame(
      { wellId: BH, ring: 5, sector: 17 },
      { wellId: ALPHA, ring: PLANET_OUTER_RING, sector: 0 }
    );
    const built = buildTurn(viewFor(onLane, "p1"), {
      move: { kind: "jump", destinationWellId: ALPHA, adjustment: 2 },
    });
    expect(built.actions.find((a) => a.type === "well_transfer")?.data).toMatchObject({
      sectorAdjustment: 2,
    });
    expect(executeTurn(onLane, built.actions).errors).toBeUndefined();

    // No autopilot: out of the arc is passed on as asked, for the engine to refuse.
    const tooFar = buildTurn(viewFor(onLane, "p1"), {
      move: { kind: "jump", destinationWellId: ALPHA, adjustment: 3 },
    });
    expect(tooFar.actions.find((a) => a.type === "well_transfer")?.data).toMatchObject({
      sectorAdjustment: 3,
    });
  });

  it("tells a moored seat that a coast holds the berth", () => {
    const docked = makeTwoPlayerGame(
      { wellId: ALPHA, ring: STATION_RING, sector: 0 }, // the station starts here
      { wellId: BH, ring: 4, sector: 0 }
    );
    expect(seatOptions(viewFor(docked, "p1")).moored).toBe(true);
    expect(describeViewForAgent(viewFor(docked, "p1"))).toContain("Moored at a station");
  });
});

/**
 * The builder places what the agent asked (rotate, shots marked "before", the
 * move, the rest, with the scan as early as it reaches) and does not change it.
 * Over every `when` for every shot, with and without a rotation, a compensation
 * and a scan, the turn it builds is accepted by the engine exactly when it
 * notes nothing: a turn the engine refuses always comes with the reason.
 */
describe("agent: the built turn in every order", () => {
  const WHEN = [undefined, "before", "after"] as const;
  type Table = {
    name: string;
    build: () => GameState;
    shots: (compensate: boolean) => FireIntent[];
    scans: Array<string | undefined>;
    moves: NonNullable<TurnIntent["move"]>[];
  };
  const tables: Table[] = [
    {
      name: "railgun bow",
      build: brawlerState,
      shots: (compensate) => [
        { weapon: "forward-0", target: "p2", compensateRecoil: compensate },
        { weapon: "side-0", target: "p4" },
        { weapon: "side-3", target: "p5", count: 2 },
      ],
      scans: [undefined],
      moves: [{ kind: "coast" }, { kind: "burn", intensity: "soft" }],
    },
    {
      name: "sensor bow",
      build: sensorState,
      shots: () => [
        { weapon: "side-0", target: "p3" },
        { weapon: "side-1", target: "p3" },
        { weapon: "side-3", target: "p4", count: 2 },
      ],
      scans: [undefined, "p2"],
      moves: [{ kind: "coast" }, { kind: "burn", intensity: "soft" }],
    },
    {
      name: "on the lane",
      build: laneState,
      shots: (compensate) => [
        { weapon: "forward-0", target: "p3", compensateRecoil: compensate },
        { weapon: "side-3", target: "p3", count: 2 },
      ],
      scans: [undefined],
      moves: [{ kind: "coast" }, { kind: "jump", destinationWellId: ALPHA }],
    },
  ];
  const whens = (n: number): Array<Array<FireIntent["when"]>> =>
    n === 0 ? [[]] : whens(n - 1).flatMap((rest) => WHEN.map((w) => [w, ...rest]));

  /** Every intent a table builds, labelled. */
  const intentsOf = (t: Table): Array<[string, TurnIntent]> =>
    whens(t.shots(false).length).flatMap((when) =>
      [false, true].flatMap((rotate) =>
        t.moves.flatMap((move) =>
          (t.shots(true).some((f) => f.compensateRecoil) ? [false, true] : [false]).flatMap(
            (compensate) =>
              t.scans.map((scan): [string, TurnIntent] => [
                `when ${when.map((w) => w ?? "-").join("/")}${rotate ? ", rotate" : ""}, ${move.kind}${compensate ? ", compensated" : ""}${scan ? ", scan" : ""}`,
                {
                  fire: t.shots(compensate).map((f, i) => ({ ...f, when: when[i] })),
                  rotate,
                  move,
                  ...(scan ? { scan: { target: scan } } : {}),
                },
              ])
          )
        )
      )
    );

  it.each(tables)("$name: refused exactly when noted, and both happen", (table) => {
    const refused = new Set<boolean>();
    checkEach(
      intentsOf(table),
      ([label]) => label,
      ([, intent]) => {
        const state = table.build();
        const built = buildTurn(viewFor(state, "p1"), intent);
        const result = executeTurn(state, built.actions);
        refused.add(result.errors !== undefined);
        expect({ refused: result.errors !== undefined, notes: built.notes }).toMatchObject({
          refused: built.notes.length > 0,
        });
      }
    );
    expect(refused).toEqual(new Set([true, false]));
  });

  it.each<[string, () => GameState, TurnIntent]>([
    // p2 is two sectors ahead; after the coast it is behind.
    [
      "a railgun only the start reaches",
      brawlerState,
      { fire: [{ weapon: "forward-0", target: "p2" }] },
    ],
    // p2 is two sectors astern; after the coast it is six.
    ["a scan only the start reaches", sensorState, { scan: { target: "p2" } }],
    // The lane needs prograde facing: the builder rotates for it.
    ["a jump facing retrograde", laneState, { move: { kind: "jump", destinationWellId: ALPHA } }],
  ])("places %s where the engine accepts it, with nothing to note", (_label, build, intent) => {
    const state = build();
    const built = buildTurn(viewFor(state, "p1"), intent);
    expect(built.notes).toEqual([]);
    expect(executeTurn(state, built.actions).errors).toBeUndefined();
  });

  it("scans before the shots, so they roll against the sensor's range", () => {
    const state = sensorState();
    const built = buildTurn(viewFor(state, "p1"), {
      fire: [{ weapon: "side-0", target: "p3" }],
      scan: { target: "p2" },
    });
    const sequenceOf = (type: string) => built.actions.find((a) => a.type === type)?.sequence;
    expect(sequenceOf("scan")).toBeLessThan(sequenceOf("fire_weapon")!);
    expect(executeTurn(state, built.actions).errors).toBeUndefined();
  });

  it.each<[string, () => GameState, NonNullable<TurnIntent["move"]>]>([
    [
      "a burn that names the facing the ship has",
      brawlerState,
      { kind: "burn", intensity: "soft", facing: "prograde" },
    ],
    [
      "a jump, which faces prograde",
      () => withShip(laneState(), "p1", { facing: "prograde" }),
      { kind: "jump", destinationWellId: ALPHA },
    ],
  ])("drops a rotation asked for alongside %s, and says so", (_label, build, move) => {
    const state = build();
    const built = buildTurn(viewFor(state, "p1"), { rotate: true, move });
    expect(built.notes).toHaveLength(1);
    expect(built.actions.some((a) => a.type === "rotate")).toBe(false);
    expect(executeTurn(state, built.actions).errors).toBeUndefined();
  });
});
