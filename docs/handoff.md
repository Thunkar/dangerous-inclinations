# Handoff — 19 Sep 2026

Thirteen commits on `main`, unpushed. Build, 795 engine tests, 1077 smoke checks
and lint (25 pre-existing warnings, 0 errors) all green. **The balance gate has
four outliers**, which is the thing to pick up next.

## What changed, and what it did

Oldest first. Only the rule changes are listed with numbers; the rest are UI or
wording and the commit message carries the why.

| commit | change |
|---|---|
| `a260c5c` | "Daring" renamed to secondary everywhere. No rule change. |
| `ed1defb` | **No weapon fires in the opening round.** |
| `9590f6d` | Turn transport (replay the last 10 turns), 1x/2x/4x playback, longer floating marks. |
| `8be75a6` | Deck findings recorded in CLAUDE.md. |
| `f6274b5` | Garbage Disposal wording: "dump a load" → jettison. |
| `5a6f5b0` | **Nobody scans in the opening round either.** `weaponsAreLive` → `isOpeningRound`. |
| `2ba5a4e` | Rotate/Burn/Jump and the burn levels are disabled unless the mat can actually do it. |
| `05b5840` | Ammo shown per launcher, as missile pips, under the fuel track. |
| `8372a07` | **Planets get a fourth ring.** |
| `8ee61d6` | Methodology finding: the bots keep cards uniformly, which skews hull numbers. |
| `b739f28` | **Two decks: 3 primaries keep 1, 3 secondaries keep 2.** |
| `a91ceae` | Benchmark reports the errand kept rather than a hand shape that is now a rule. |
| `a7aa136` | **Secondaries become three stacks; everyone takes one of each.** |

### The opening round reaches nobody

Everyone deploys on one ring, so before anyone has moved the table is a firing
line — and point blank means the neighbour two sectors away is in range of
everything. Scanning is the same problem without the damage: the sensor's range
on the deployment ring is most of the table and what it turns up stays turned
up.

One predicate, `isOpeningRound(turn)`, read by the validators, the bots, the
agent's options and the UI chips. `FIRST_TURN` exists because deployment hands
the board over at turn 1, not 0 — writing the rule against 0 made it a no-op in
every real game while the tests, which build their own states, passed.

### Planets get a fourth ring

The station sat on the innermost planet ring, so every ring a ship could sit on
was slower than it and a ship arriving behind the station could never gain. The
planner's own fastest route to a dock was seven turns of burning back and forth
between the outer two rings to kill time; 0 of 24 arrival phases had a route
that dipped inside the station's ring, because there was nothing to dip into.

Planet rings are now `6/4/2/1` (the black hole's own sequence minus its inner
ring), station on ring 2, lanes on ring 4. The old three rings are unchanged and
just renumbered; the only new thing is a faster lane inside the station.

Turns to dock, median/p90/worst, and turns spent coasting:

| fuel aboard | before | after |
|---|---|---|
| 12 | 3/6/7 · 0.0 waiting | 3/4/5 · 0.1 |
| 6 | 4/7/8 · 1.1 | 3/5/6 · 0.7 |
| 4 | 5/8/8 · 2.0 | 4/6/7 · 1.5 |
| 3 | 5/8/9 · 2.9 | 5/8/9 · 2.9 |

Unchanged when the tank is nearly empty and the dive is unaffordable, better
everywhere else. Station on ring 3 was measured and is worse at every fuel
level. Rounds went 37/39/39 → 33/33/33 at 3/2/4 seats.

### Two decks

Dealing five from one pile and keeping any three looked like a choice and was
not: primaries are most of the pile, so 94% of hands at three seats could take
three of them, and three primaries is the only shape with a spare (four points
out of six means any two will do). Over 4,000 deals, 2P+1S was the best hand
available 1–2% of the time, and the second-best hand sat 10 points behind the
best.

Now: three primaries keep one, three secondaries keep two. Every hand is four
points on the nose, so **all three cards have to come in — there is no spare**.

This fixed Destroy without touching it. 200 games at three seats, seat 1's own
choice winning 30%:

| seat 1's primary | wins | its card completed |
|---|---|---|
| Destroy | 35% | 54% |
| Intercept | 31% | 50% |
| Deliver | 26% | 32% |

Destroy was the worst primary under one deck and is the best under two: a hand
used to spend three primaries competing for the same turns, and now one errand
has the game to itself while the secondaries ask for nothing aboard.

### Secondaries as three stacks

A hand keeps two secondaries and they must differ. Dealing three off a shuffled
pile does not guarantee that is possible — 7% of seats got three of a kind — and
the obvious patch (put one back, draw again) has a hole exactly at six seats,
where 6 × 3 consumes all eighteen cards and leaves nothing to draw from.

So the secondaries are three stacks, one per card, and every player takes one off
each. Distinctness holds by construction, no redraw rule, no deck sized to the
player count, one sentence at the table. Verified: 0 malformed deals across 2–6
seats.

**The price**, and it is the open problem below: the secondary offer is now the
same for everybody, so the choice is which one to leave — and those three have to
be worth roughly the same or it is not a choice.

## Where the gate stands

Four outliers, up from one before the stacks change:

| hull | outright | |
|---|---|---|
| compressor + racks×2 + shields + radiator | 55% | outlier |
| Hauler · aggressive (preset) | 46% | outlier |
| compressor + lasers×2 + shields + radiator | 43% | outlier |
| compressor + missiles×2 + radiator + shields | 42% | outlier |
| compressor + shields×2 + radiators×2 (the pacifist) | 36% | — |

Seat 1's own-hand bar is somewhere around 25–30%, down from 33% before the
stacks and 39% before the two decks.

Two readings. The compressor family is flagged again, but **the pacifist is no
longer the worst offender** — the armed compressor hulls are, which is the
reverse of the old picture and consistent with guns becoming worth carrying.
And every seat now gets the same two secondaries, so hand luck stops
differentiating players and what is left is the mat and the random primary; a
forced strong mat therefore shows up harder against a bar that is mostly a
coin-flip on which errand you drew.

If that reading is right, the fix is not the compressor. It is that the
secondary choice has to become a real one.

## Open: the third secondary

Garbage Disposal does not work and the designer wants alternatives. Three
proposals were made and none landed; this section is the constraints and the
dead ends so the next attempt starts further along.

### Why it fails

The three secondaries look like small versions of the three ways to play: Board
is a small Destroy, Survey is a small Intercept, and Garbage is a small Deliver.
A small haul is just a worse haul — and worse, it borrows **Survey's
geography**: the same dive to Black Hole Ring 1, with the order forced (station
first) and a hold that must stay clear in between. It is dominated by the card
sitting next to it.

Measured, 120 games at three seats:

| | got the load / chit | completed |
|---|---|---|
| Garbage | 78% | 42% |
| Survey | 151% (many chances) | 89% |

Wasted dives — diving before loading — are only 4%, so it is **not** the
ordering. Garbage already loads at **any** station (`pickupPlanetId: "any"`), so
it is not the pickup either. The cost is needing the load aboard at the moment
of the dive.

Benchmark completion per 100 kept, across 3–6 seats: Survey 75, Board 58,
**Garbage 23**.

### What a replacement must satisfy

1. One sentence, checkable with tokens on the table.
2. No tile required — a secondary asks for nothing aboard.
3. Nobody can block it.
4. Not Survey's geography (the dive to Black Hole Ring 1) and not Board's
   (co-location with a rival). Those are taken.
5. Close enough in value to the other two that dropping one is a decision,
   because every player is now offered all three.

### Already tried and cut

Ambush, Salvage, Breach and Grand Tour were cut before this session. **Their
definitions are not recoverable from git** — only the line in CLAUDE.md
survives — so avoid anything tour-, salvage- or ambush-shaped without asking.

Proposed this session and not liked: Shakedown (end a turn above the redline and
survive), Skim (end a turn on a planet's Ring 1), Crossfire (end a turn with two
rivals within 3 sectors on your ring).

### One idea that is impossible, for the record

"End two consecutive turns in the same sector" cannot be done.
`getAdjustmentRange` brakes only to `-(velocity - 1)` and `MIN_FORWARD_MOVEMENT`
is 1, so every ship moves at least one sector every turn. The sole exception is
a moored ship, which does not drift — making the card trivial rather than hard.

### Cheapest repair if replacement stalls

Make the load ride free like a data chit: same journey, no hold tax, no clash
with a Deliver crate. One field. Expectation is it still lands third of three,
because the geography is still Survey's.

## Proposed, not built: missile salvos and multi-target point defence

The designer's idea: let a launcher fire **any number of its missiles in one
salvo**, and let a rack **intercept more than one incoming missile in a turn**.

### How it works today

**Missiles** — either slot, 2 cubes, 2 damage, turret arc, 4 ammo. A tile acts
once a turn, so one missile a turn. Each missile flies 3 steps a turn for 3
turns, then expires.

**Ballistic rack** — side slot, 2 cubes, 2 damage, ±1 ring and ±1 sector, and it
also intercepts: a powered, unbroken, **unused** rack rolls a d10 and destroys
the missile on 2+. The `usedThisTurn` check means **one interception per rack per
turn** — the first missile to arrive consumes it and the rest get through.

### Why the two halves belong together

A four-missile salvo against a rack that intercepts once is 4:1. Salvos alone
would make point defence *less* relevant, not more, which is the opposite of the
intent. Letting the rack roll once per incoming missile keeps it meaningful and
turns "do I dump the magazine" into a real gamble.

### The detail that needs deciding first

**What does a salvo cost in heat?** Using a tile costs its cubes in heat, and the
missiles tile holds 2. If a salvo is one tile use, four missiles cost 2 heat —
almost certainly too cheap, since a railgun shot costs 4 for one 4-damage hit.
Heat per missile launched is the obvious alternative and makes the size of the
salvo a heat decision, which is the game's core tension. Decide this before
measuring, because it changes what is being measured.

### What to measure

Destructions per game; the missile hulls' win rate against the bar; ammo spent
per game; the share of launched missiles intercepted; and whether the rack
becomes worth a side slot (today it is carried by two of the six presets). The
bots will need teaching — `firingOptions` in `ai/behaviors/combat.ts` proposes
one shot per weapon.

## The four tuning dimensions

The designer named four questions the suite should answer. It answers two.

| dimension | covered? |
|---|---|
| Are logical loadouts (fitted to the cards) balanced? | Yes — the six presets, forced on seat 1 |
| Are illogical loadouts bad? | **No** — nothing forces a mat that fights its cards |
| Can something outside the box compete (sensors + missiles hunting)? | **No** — not in the preset list |
| Are extreme loadouts unfairly competitive? | Yes — the sixteen extreme hulls |

The two gaps are the same gap: the forced-hull list in the balance suite is
hand-written. Adding a mismatched set (sensor bow with a Destroy hand, compressor
with an Intercept hand) and an off-book set (sensors + missiles×2, railgun with
no interception) as two more sections would close it. Worth doing before the next
balance pass, since "is a clever build viable" is currently unmeasured.

## Traps for whoever picks this up

- **The bots pick their primary uniformly at random on purpose.** A scorer that
  takes the best hand makes the benchmark restate the scorer, and a plan the bots
  never choose is a plan nobody can measure. Read the note on `selectBotMissions`
  in `ai/behaviors/loadout.ts` before "fixing" it. The secondaries *are* chosen —
  the bot avoids pairing Garbage with a Deliver, because both want the one crate
  the hold takes, and that is the engine's arithmetic rather than an opinion.
- **A forced hull is dropped when the deal has no hand it can fly.** Check the
  hull actually stuck before trusting a column — it silently falls back to the
  bot's own mat, and that diluted a measurement earlier in this session.
- **The gate's outlier test is relative to seat 1's own-hand bar.** A falling bar
  manufactures outliers without any hull improving. Always read the bar before
  reacting to a flag; this caught us twice.
- **`yarn balance --quick` is 40 games a row** and far too noisy to draw
  conclusions from. Use the full run.
- **`docs/benchmark.md` stamps the rules it ran under**, including the map and
  the deal. Two pages are only comparable if those headers match.
- Seat order at 4–6 seats looks uneven in the most recent runs (seat 2 at 11–12%
  at five and six seats). May be noise at these sample sizes; worth one
  confirming run before treating it as real.
