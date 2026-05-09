# Movement Planner

The movement planner answers a single, very load-bearing question:

> _Given a ship at orbital position **O** with fuel **F**, and a target **T**, what is the shortest action sequence that gets the ship from **O** to **T**?_

This is used by:

- **Bots** — to pursue mission goals (destroy targets, deliver cargo, intercept transmissions) and to position for combat.
- **The UI** — to preview routes for human players, including alternatives ("fastest" / "economical" / "balanced").
- **Tests and tooling** — to reason about reachability, fuel cost, and turn cost without re-running the whole engine.

Because the same code is used by the AI _and_ by the UI, it has to be both **correct** (never tells you a route exists when it doesn't) and **expressive** (handles every kind of target the game throws at it).

---

## What "target" means

The planner accepts two flavours of target:

| Flavour | Use case | Position over time |
|---|---|---|
| **Static** | A fixed orbital position the bot wants to reach (e.g. a deployment point, a sector chosen in the UI, a transfer-point hop). | Constant. |
| **Dynamic** | A target that moves with time. Stations advance one sector‑per‑round; intercept points lead a moving ship; future extensions could include hostile ships. | A function `positionAt(turn) → OrbitalPosition`. |

These flavours share an interface — [`PlannerTarget`](targets.ts) — so consumers don't care which one they're using:

```ts
interface PlannerTarget {
  positionAt(turn: number): OrbitalPosition
  isMatch?(pos: OrbitalPosition, turn: number): boolean
  describe?(): string
}
```

`staticTarget(pos)` and `orbitingTarget(start, sectorsPerRound)` are the two builders we ship; consumers can write their own (e.g. `pursueShip(ship, predictedTrajectory)`).

---

## Two algorithms, one API

```text
                     ┌────────────────────────────────────┐
                     │          MovementPlan              │
                     │  origin → … → destination          │
                     └────────────────────────────────────┘
                              ▲                  ▲
                              │                  │
                ┌─────────────┴────┐   ┌─────────┴─────────────┐
                │  planMovement    │   │ planMovementToTarget  │
                │  (reverse BFS)   │   │  (forward BFS)        │
                │                  │   │                       │
                │  • static only   │   │  • static or dynamic  │
                │  • faster        │   │  • slightly slower    │
                │  • used by UI    │   │  • used by bots for   │
                │                  │   │    station meet-ups   │
                └──────────────────┘   └───────────────────────┘
```

### Why two?

- **Reverse BFS** ([`planner.ts`](planner.ts)) starts at the destination and expands backwards through possible predecessors. This is faster for static destinations because we can prune the search the moment we reach the origin. But it requires a single, time-invariant destination — you have to know what you're starting from on day one.
- **Forward BFS** ([`forward.ts`](forward.ts)) starts at the origin and expands successors layer by layer, asking the target "are we matching at this turn?" at every layer. Time inside the planner is _equal to layer depth_, so dynamic targets just answer the question.

If you only care about static targets, prefer `planMovement`. If you have a moving station, prefer `planMovementToTarget` with `orbitingTarget`. Both produce the same `MovementPlan` type, so downstream code is identical.

---

## Time and rounds: the contract that nearly broke everything

The single most important rule in this module is _what one planner-turn means_, because if you get this wrong, dynamic targets fail in subtle ways. Here it is:

> **One planner turn = one bot action = one game round.**

Why? Because each player gets exactly one action per round, and stations only advance at round-end (`isNewRound === true` in the engine's turn loop). So from any one bot's perspective, every action it takes corresponds to one full round elapsing — no matter where in the rotation it sits.

The off-by-one that bites you is _when_ the round-end happens relative to the bot's match check:

```text
   Round R, bot's k-th action:
   ├── Bot acts (rotate / burn / coast / well_transfer)
   ├── Match check fires       ◄── station still at S(k-1) advances
   ├── Other players act
   └── Round-end                ◄── station advances → S(k)
   Round R+1:
   ├── Bot acts (k+1-th action)
   ├── Match check fires       ◄── station now at S(k)
   └── …
```

So at the bot's k-th action (k ≥ 1), the station has moved exactly `k − 1` times from the position it had when planning began. `orbitingTarget` encodes this directly:

```ts
positionAt(turn: number) {
  const advances = Math.max(0, turn - 1)
  return { ...start, sector: (start.sector + sectorsPerRound * advances) % 24 }
}
```

This is the bug we shipped a fix for: an earlier version did `floor(turn / playerCount) * sectorsPerRound`, which is wrong twice over (it tries to express turns in "game turns" when they're already in bot turns, and it forgets that round-end happens after the match check). The result: bots at R1 same-ring as a station would coast forever, always 4 sectors behind, because their planner thought the station was stationary.

---

## How forward BFS finds a meet (visual walkthrough)

The hard case the planner has to handle: bot at R1 S8 retrograde, station starts at R1 S16, both have orbital velocity 4. Pure-coasting trails forever — the relative velocity is 0.

```text
Layer 0 (origin)             {R1 S8 ret}
                                  │
                                  │ getSuccessors(...)        match check at layer 1
                                  ▼                            station = S16 (no advance yet)
Layer 1                  ┌─ R1 S12 ret  (coast)               miss: 12 ≠ 16
                         ├─ R2 S15 pro  (burn pro soft +3)    miss
                         ├─ R2 S5  pro  (burn pro soft −3)    miss
                         └─ … many more  (burn pro / ret / hard / well_transfer)
                                  │
                                  │ expand each                match check at layer 2
                                  ▼                            station = S20 (1 advance)
Layer 2                  …  among them: R1 S20 ret             ◄── MATCH!
                              (came via R2 detour:
                               burn pro to R2 S15, then
                               burn ret to R1 S20)
```

The two-step detour _felt_ clever the first time we saw it, but it's exactly what the BFS finds without any special-casing: rotation is free in-turn, so successors at every layer include burns in both directions; the ring detour just falls out of normal expansion. The match check at each layer asks the target where it is _at that layer_, which is what makes dynamic targets work.

For comparison, the **reverse BFS** (used for static targets) expands like this:

```text
Layer 0 (destination)        {R1 S12 fixed}
                                  │
                                  │ getPredecessors(...)
                                  ▼
Layer 1                  ┌─ R1 S8  (coast: 8 + 4 = 12)        ◄── origin → return!
                         ├─ R2 S?  (came via burn pro …)
                         └─ …
```

It finds the origin at layer 1 → 1-turn coast. If our target had been a station at S12 _that moves_, the reverse BFS would still find this 1-turn coast even though the station won't be at S12 anymore by then. That's the bug forward BFS prevents.

---

## The mass dimension

Both algorithms also track **reaction mass** alongside turns. This matters because:

- Burns cost mass (1 / 2 / 3 for soft / medium / hard, plus 1 per sector of adjustment).
- Well transfers cost 3 mass (refunded if a fuel compressor is installed — but the refund is applied by the engine, not the planner).
- Coasting with a fuel scoop installed _recovers_ mass equal to the ring's velocity. This makes the edge-weight graph have **negative weights** in the mass dimension.

Negative weights break ordinary shortest-path. The reverse BFS handles this with a Pareto frontier: at each `(position, turn)` we keep _all_ entries that aren't dominated by a (lower turns AND lower mass) entry. The forward BFS handles it more simply with a coarse mass bucket — fine for our small-state-space problem (≤12 turns × ≤720 oriented positions).

Mass is also the reason planning can return `null`: a path that exists in pure-time terms might be infeasible because the bot doesn't have the fuel.

---

## Files

| File | Role |
|---|---|
| [`index.ts`](index.ts) | Public exports + ship-state convenience wrappers (`planFromShip`, `planStationMeetUp`, `estimateTurnsToTarget`). |
| [`planner.ts`](planner.ts) | Reverse BFS for static targets. Also `planMovementAlternatives`, `isReachable`, `getReachablePositions`. |
| [`forward.ts`](forward.ts) | Forward, time-layered BFS. The thing dynamic targets need. |
| [`targets.ts`](targets.ts) | `PlannerTarget` interface + `staticTarget`, `orbitingTarget` builders. |
| [`predecessors.ts`](predecessors.ts) | Reverse-direction expansion: "what positions can reach _this_ position in one turn?". Used by reverse BFS. |
| [`successors.ts`](successors.ts) | Forward-direction expansion: "what positions can _this_ position reach in one turn?". Used by forward BFS. |
| [`types.ts`](types.ts) | `OrbitalPosition`, `OrientedPosition`, `MovementStep`, `MovementPlan`, etc. |

---

## Conventions

- **Rotation is free.** The engine treats rotate as a separate action that can be combined with burn/coast in the same turn, so the planner emits successors and predecessors with both facings — the ship rotates implicitly when it needs to.
- **Match checks fire at layer ≥ 1.** Layer 0 represents the bot _before_ taking any action. We never claim the bot has met a target without taking at least one action, because in the engine the match check (cargo pickup, etc.) only fires after an action.
- **`null` means infeasible.** If the planner returns `null`, no path exists within the supplied `maxTurns` and `availableMass`. Callers that want a "best effort" path even when infeasible should ask for one explicitly (e.g. relax the budget).
- **Plans are emitted origin→destination.** Even though the static planner searches in reverse, the returned `MovementPlan.steps` always reads in execution order.

---

## Adding a new target type

Suppose you want to plan a path that intercepts an enemy ship at a predicted position 4 turns from now. Write a `PlannerTarget`:

```ts
export function interceptAt(
  wellId: GravityWellId,
  predictedPositions: OrbitalPosition[],
): PlannerTarget {
  return {
    positionAt: (turn) => predictedPositions[Math.min(turn, predictedPositions.length - 1)],
    describe: () => `intercept@${wellId}`,
  }
}
```

Pass it to `planMovementToTarget(origin, interceptAt(...), options)` and you're done. The forward BFS will check the predicted position at each layer and return the shortest meet.

If the match condition isn't a strict spatial equality (e.g. _shadow_: be in same ring, same well, within ±3 sectors), override `isMatch`:

```ts
isMatch: (pos, turn) => {
  const t = predictedPositions[Math.min(turn, predictedPositions.length - 1)]
  return pos.wellId === t.wellId
    && pos.ring === t.ring
    && circularDistance(pos.sector, t.sector) <= 3
}
```

---

## Performance notes

The forward BFS's worst-case search space is `(positions × mass-buckets)` per layer — bounded because positions are finite (≤ 720 across all wells with both facings) and mass is clamped. Empirically the BFS terminates in a sub-millisecond for realistic ship states.

Two changes turned out to matter for sim throughput. They're independent and stack roughly multiplicatively: an A/B at 20 sequential games shows 113 s pre-optimisation → 54 s with lazy planning alone → 14 s with both.

### Lazy planning

Mission ranking is the dominant per-turn cost. Every turn the bot has to decide *which* mission to pursue, and the obvious way to do that is "compute a real plan for each mission, pick the cheapest." With 3 missions per bot, that's three BFS invocations per bot per turn — and only one plan ever gets used (the chosen one).

The fix is to **rank with a cheap heuristic, plan only the winner**. `computeMissionGoals` ([behaviors/missions.ts](../behaviors/missions.ts)) now uses a planner-free `cheapTurnEstimate` to score missions; once `selectCurrentGoal` picks one, `attachPlanToGoal` runs the real BFS for that single goal.

#### How `cheapTurnEstimate` works

The function asks "roughly how many bot-turns from this ship to that orbital position?" — and answers it from geometry alone. Two cases:

**Same well.** Distance is ring distance plus the shorter way around the ring (cyclic sector distance), divided by an "average" sector velocity:

```ts
const ringDiff = Math.abs(ship.ring - target.ring)        // ring layers between
const rawDelta = Math.abs(ship.sector - target.sector)
const sectorDiff = Math.min(rawDelta, 24 - rawDelta)      // shorter direction
return ringDiff + Math.ceil(sectorDiff / 3)
```

The numbers come from the game's actual ring velocities:

| Ring | BH velocity | Planet velocity |
|------|-------------|-----------------|
| 1    | 8           | 4               |
| 2    | 6           | 2               |
| 3    | 4           | 1               |
| 4    | 2           | —               |
| 5    | 1           | —               |

A bot in the middle rings averages ~3 sectors of orbital advance per turn (the simple arithmetic mean across rings is closer to 4, but ranking accuracy doesn't matter here, only *consistency*; we picked 3 to bias toward overestimating, which is the safer error). Each `+1` to ring distance counts as one full burn-turn — that's roughly right too: a ring change costs one burn action, regardless of intensity.

**Cross-well.** A flat penalty:

```ts
return 8 + ringDiff
```

The `8` covers two things implicitly: a few turns to maneuver to the well-transfer point, plus the well_transfer + landing-side approach. We don't bother modelling the source-side trip in detail because the chosen-goal planner will figure it out exactly. The `+ ringDiff` then acknowledges that arrival-side rings still vary in cost.

#### Why "approximate" is fine

The heuristic only has to rank goals consistently enough that the bot picks a sane one — it doesn't drive movement. Once a goal is chosen, the real BFS plans the actual path with full fidelity, including station orbit, fuel constraints, and ring transitions. A small ranking error (saying mission A is 12 turns when it's actually 9) does no harm: the bot still pursues a mission it can complete, and the planner gives it a correct route.

The bias matters more than the precision: we deliberately overestimate (using `Math.ceil` on the sector divide, picking 3 sectors/turn instead of 4, adding a +15 combat buffer to destroy missions in `scoreMissionCost`). When the planner is the limiting resource, "overestimate" is the right way to be wrong — it nudges selection toward easier missions, which is exactly what helps the bot win more games.

### Integer position keys

The forward BFS's `Map<key, Node>` is consulted twice per node expansion (one `get`, one `set`). Originally we keyed it on a template-literal string like `"blackhole:3:5:prograde|−2"`; now we use a bit-packed integer (`positionKeyInt`) so the key is just a number:

```text
   bit  0     facing  (1 bit)   prograde / retrograde
   bits 1-5   sector  (5 bits)  0-23
   bits 6-8   ring    (3 bits)  1-5
   bits 9-12  well    (4 bits)  interned via Object lookup
```

A controlled A/B (lazy planning kept identical, only the key encoding changed) measured **54 s → 14 s** for 20 sequential games — about 3.9× faster.

The original framing of this change as "string-hash overhead" was wrong, or at best incomplete. The hashing itself is fast either way; the real costs are:

1. **String allocation per lookup.** The template literal allocates a fresh string on every node expansion — tens of millions of allocations per game. That's the biggest single cost: GC pressure, not arithmetic.
2. **V8's Smi fast path.** Small-integer keys (Smi) live in a different specialised path inside V8's `Map` implementation than strings do. Strings get atomized/canonicalised before lookup; Smis don't.
3. **Collision comparisons.** When two keys hash to the same bucket, V8 falls back to equality checks. For strings that's char-by-char; for Smis it's a single value compare.

Of those, (1) dominates. We didn't replace a slow hash with a fast hash — we replaced a path that allocated with one that didn't.

### Bench numbers (M-series Mac, 4 bots × 500 max turns)

20 sequential games (single worker — measures planner cost directly, no parallelism noise):

| Sim configuration                            | Time | Speedup |
|----------------------------------------------|------|---------|
| Pre-redesign (eager planning, string keys)   | 113 s | —       |
| + lazy planning                              | 54 s  | 2.1×    |
| + integer position keys (final)              | 14 s  | 3.9× more, 8.0× total |

500 parallel games (8 workers, real-world throughput):

| Sim configuration                | Time / 500 games | Games/sec |
|----------------------------------|------------------|-----------|
| Pre-redesign                     | ~555 s           | 0.9       |
| Final (lazy + int keys)          | **~59 s**        | **8.5**   |

Win rate stays at ~98% across all rows; the changes are pure performance.

### Where time still goes

After both optimizations, the CPU profile shows `planMovementToTarget` ~37%, `getSuccessors` ~23%, `planMovement` ~16%. Further gains would come from:

- **Plan reuse across turns**: most of the time the bot is mid-execution of a plan from the previous turn — the first step has applied and the rest is still valid. A persistent per-bot plan slot would cut planner calls dramatically. Tradeoff: requires inter-turn state, which is invasive in the engine's current pure-function reducer model.
- **Successor object pooling**: `getSuccessors` allocates an array of objects per call. A pre-allocated buffer or a generator-style API would cut GC pressure further, at the cost of API ergonomics.

Neither is needed for current throughput (~8 games/sec on 8 workers handles a 5,000-game batch in ~10 minutes). Revisit if simulation budgets grow.
