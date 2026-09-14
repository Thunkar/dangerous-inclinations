# Rule experiments — night of 14/15 September 2026

Written for the designer. Every row below is 100 bot-vs-bot games on the **same 100 seeds**
(same hands, same dice, same deployment order), 3 bots unless stated, capped at 400 player-turns
with a tiebreak (most completed missions, then hull) so no game is thrown away. The bots are
identical in every row; they only read the rule knobs that change what is legal or valuable
(shield cap, spent cubes, Destroy's worth). Every number comes from typed engine events.

One bot bug was found and fixed on the way: bots assumed a full 10-cube reactor when planning,
so under "spent shields" they burned cubes they no longer had and 15–30% of games aborted on an
illegal turn. Those rows were rerun after the fix; every row in the table finished cleanly.

Vocabulary: **fin** = games won outright; **tie** = decided at the cap; **kills/g** = ships destroyed
per game; **destroy / deliver / intercept / survey** = cards completed across the 100 games;
**gun seats** = share of bot seats that took a railgun or missile hull; **gun win** = win rate of
those seats; **coast** = share of acting turns that were a coast (no burn, no jump); **idle** =
coasts with no scoop and no shot; **shields=4** = share of acting turns ending with four cubes on
shields; **sh4 acting** = of those, the share that also burned, jumped, scooped or fired;
**soaked** = share of weapon damage shields absorbed; **energy used** = mean cubes allocated at the
end of a turn (reactor holds 10); **heat@chk** = mean heat at the end-of-turn check (dissipation 5,
7 with a radiator); **lost turns** = player-turns spent respawning or recovering.

## Your questions first

**1. "Is coasting that common?"** No, and the premise that shields at 4 leave nothing but a coast
does not hold on the reactor side. Under the current rules (baseline row):

| | baseline, 3 bots |
|---|---|
| Turns that coast | 32% |
| …of which idle (no scoop, no shot) | 3% |
| Turns that scoop (3 cubes) | 25% |
| Turns that burn / jump | 50% / 18% |
| Turns ending with 4 cubes on shields | 58% |
| …of which also moved, scooped or fired | 96% |
| Mean cubes allocated at end of turn | 5.4 of 10 |
| Mean heat at the check | 3.1 of 5 |

Four shield cubes plus a hard burn and a turn is 8 cubes; plus a scoop is 7; plus a railgun is
8. The reactor is half empty on an average turn. What a full shield really competes with is a
**weapons-heavy** turn (railgun 4 + laser 2 + shields 4 = 10, no movement) and, if the shield is
hit, the **heat check**: 4 absorbed points are 4 heat on top of the turn's own heat. So players
will pin shields at 4 on most turns and still act; they will drop them on the turn they want to
shoot with everything or burn hard after being hit. That matches what the bots do (58% of turns at
4, 62% powered). The rule that would make holding 4 cubes a real decision is not "shields cost
energy" but "shield cubes that absorb stay spent until you dock" (row `shields_on_dock`) or a
lower cap (row `shields_cap2`); their effects are in the matrix.

**2. Death costs two turns** (respawn turn + one recovery turn). It is in every row. Turns lost to
it are 0–3% of all player-turns even in the bloodiest configuration (2.6 kills per 4-player game),
and 2-player games show no snowball: seat wins are 52/48 at baseline and 97% of games still finish
with the full combat combo. The cost is felt by the victim without deciding the game.

**3. The shield heat indicator is back.** The status block's heat bar shows carried heat, the heat
this turn's plan will add, and a hatched worst-case segment for the cubes on shields; when the
worst case crosses dissipation it prints "shields would cost −N hull if hit".

## The matrix

| run | fin | tie | rounds | kills/g | hull dmg/g | destroy | deliver | intercept | survey | gun seats | gun win | coast | idle | firing | shields=4 | sh4 acting | shields on | soaked | energy used | heat@chk | heat dmg | lost turns |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline | 100% | 0% | 27 | 0.2 | 10.3 | 0 | 336 | 130 | 78 | 57% | 16% | 32% | 3% | 8% | 58% | 96% | 62% | 51% | 5.4 | 3.147 | 1% | 0% |
| shields_on_dock | 100% | 0% | 29 | 0.5 | 13.3 | 1 | 340 | 125 | 78 | 57% | 22% | 34% | 5% | 8% | 52% | 96% | 61% | 44% | 5.2 | 3.052 | 1% | 1% |
| shields_cap2 | 99% | 1% | 30 | 0.8 | 22.1 | 1 | 339 | 128 | 78 | 57% | 20% | 33% | 3% | 11% | 0% | 0% | 62% | 44% | 4.3 | 3.17 | 0% | 1% |
| crit_through | 100% | 0% | 30 | 0.3 | 11.9 | 0 | 337 | 131 | 78 | 57% | 18% | 32% | 3% | 8% | 57% | 96% | 61% | 48% | 5.4 | 3.152 | 1% | 1% |
| dock_repair1 | 100% | 0% | 28 | 0.3 | 10.7 | 1 | 335 | 130 | 78 | 57% | 17% | 33% | 4% | 8% | 57% | 95% | 61% | 50% | 5.4 | 3.133 | 1% | 1% |
| hull8 | 100% | 0% | 30 | 0.4 | 10.6 | 1 | 340 | 128 | 79 | 57% | 17% | 32% | 3% | 8% | 57% | 96% | 60% | 52% | 5.4 | 3.131 | 1% | 1% |
| destroy2 | 93% | 7% | 36 | 0.6 | 20.2 | 30 | 291 | 38 | 99 | 91% | 29% | 40% | 4% | 13% | 61% | 96% | 66% | 62% | 5.5 | 3.196 | 1% | 0% |
| routes3 | 100% | 0% | 18 | 0.1 | 4.9 | 0 | 131 | 197 | 161 | 27% | 10% | 30% | 3% | 6% | 73% | 97% | 76% | 34% | 6.2 | 3.315 | 0% | 0% |
| combo_shields_destroy | 100% | 0% | 33 | 1 | 22 | 45 | 264 | 37 | 95 | 91% | 30% | 39% | 6% | 15% | 48% | 96% | 63% | 50% | 5.2 | 3.112 | 0% | 1% |
| combo_full | 99% | 1% | 33 | 1.1 | 22.6 | 56 | 244 | 37 | 94 | 91% | 31% | 40% | 7% | 16% | 48% | 96% | 63% | 50% | 5.2 | 3.126 | 1% | 2% |
| combo_deck_destroy | 84% | 16% | 39 | 1 | 26.1 | 54 | 173 | 52 | 183 | 89% | 29% | 44% | 6% | 14% | 72% | 94% | 78% | 63% | 6.0 | 3.281 | 1% | 1% |
| combo_everything | 97% | 3% | 30 | 1.6 | 25.3 | 73 | 124 | 50 | 168 | 89% | 30% | 42% | 8% | 19% | 53% | 96% | 72% | 52% | 5.5 | 3.265 | 0% | 2% |
| cap2_destroy2 | 100% | 0% | 31 | 1.7 | 34.7 | 69 | 220 | 37 | 98 | 91% | 29% | 37% | 2% | 20% | 0% | 0% | 66% | 41% | 4.5 | 3.371 | 1% | 2% |
| cap2_destroy2_repair1 | 100% | 0% | 32 | 1.8 | 32.5 | 78 | 199 | 37 | 97 | 91% | 31% | 38% | 2% | 20% | 0% | 0% | 66% | 41% | 4.5 | 3.397 | 1% | 3% |
| baseline_2bots | 100% | 0% | 30 | 0.1 | 6.1 | 0 | 397 | 43 | 21 | 78% | 46% | 30% | 2% | 6% | 39% | 97% | 41% | 43% | 4.5 | 2.993 | 0% | 0% |
| combo_full_2bots | 97% | 3% | 33 | 0.4 | 9.4 | 29 | 279 | 12 | 63 | 94% | 48% | 36% | 5% | 9% | 34% | 97% | 42% | 47% | 4.3 | 2.909 | 0% | 0% |
| baseline_4bots | 100% | 0% | 27 | 0.4 | 15.2 | 4 | 293 | 221 | 99 | 54% | 11% | 36% | 5% | 10% | 72% | 94% | 76% | 52% | 6.1 | 3.243 | 1% | 1% |
| combo_full_4bots | 99% | 1% | 31 | 2.6 | 40.6 | 93 | 198 | 48 | 142 | 94% | 22% | 40% | 7% | 22% | 57% | 94% | 77% | 49% | 5.8 | 3.323 | 1% | 3% |

`combo_shields_destroy` = spent shields + Destroy worth 2. `combo_full` = spent shields + dock repair 1 + Destroy 2.
`combo_deck_destroy` = 3 Deliver routes + Destroy 2. `combo_everything` = spent shields + dock repair 1 + Destroy 2 + 3 routes.
`cap2_destroy2(_repair1)` = shield cap 2 + Destroy 2 (+ dock repair 1). `_2bots` / `_4bots` rows use the same knobs as `combo_full`.

## Reading

**Single knobs.** Only one of the seven does anything on its own.
- **Destroy worth 2** is the lever. Bots go from never keeping a Destroy card to completing 30 per
  100 games; gun hulls go from 57% to 91% of seats; kills triple (0.2 → 0.6); firing turns go from
  8% to 13%. The price: games run 36 rounds instead of 27 and 7% reach the cap, because two hunters
  circling each other complete nothing. Intercept collapses (130 → 38) since the same hands now
  keep Destroy instead.
- **Spent shields** (cubes that absorb damage stay off the reactor until a dock) alone: kills 0.2 →
  0.5, soaked damage 51% → 44%, shields at 4 on 52% instead of 58% of turns. It makes hits matter
  but nobody has a reason to seek them.
- **Shield cap 2** alone: kills 0.2 → 0.8 and hull damage doubles (10 → 22) with no change to what
  cards win. Same story: fights hurt more, nobody wants them.
- **Criticals through shields, dock repair 1, hull 8**: within noise of baseline on every column.
- **3 Deliver routes instead of 6** halves game length (27 → 18 rounds) and kills combat (0.1
  kills, gun seats 27%). With few Deliver cards the deck is Intercept and Survey, both cheap; games
  are decided by the deal. Not recommended alone.

**Combinations.** Destroy 2 makes people want to fight; a shield change makes fights end.
- **Spent shields + Destroy 2 (+ dock repair 1)** (`combo_shields_destroy`, `combo_full`): kills
  1.0–1.1/game, Destroy completed 45–56 times, 99–100% of games finish in 33 rounds, Deliver is
  still the most-completed card (244–264). Adding 3 routes on top (`combo_everything`) reaches 1.6
  kills but makes **Survey the top card** (168 vs 124 Deliver) and pushes first dock to turn 9:
  the cargo game shrinks.
- **Shield cap 2 + Destroy 2 (+ dock repair 1)** (`cap2_destroy2`, `cap2_destroy2_repair1`):
  the most combat of any 3-player row that still finishes every game — 1.7–1.8 kills, Destroy
  completed 69–78 times, hull damage 33–35 per game, 20% of turns fire — in 31–32 rounds with
  Deliver still on top (199–220). Shields still soak 41% of damage at cap 2.
- **Player counts** (`combo_full` knobs): 2 players fight little (0.4 kills; with one opponent a
  Destroy card is one hunt against a ship that sees you coming), 4 players fight a lot (2.6 kills,
  93 Destroy completions, 22% of turns fire). Whatever is adopted will feel different at 2 and 4.

**Side effects worth knowing.**
- **Hidden information erodes faster in combat rows**: scans fall from 4 to 1 per game (nobody
  takes a sensor array when 91% of seats want a gun) but tiles left face-down at game end fall from
  1.2 to 0.3–0.5 of 5, because firing reveals the weapon. Shooting is the new scanning.
- **Turn order matters more than it should.** In 3-player rows the last seat wins 21–23% of games
  in six rows out of nine (baseline 31/46/23; shield cap 2: 39/40/21); in 4-player rows the last
  seat wins 17–18%. The game ends the moment someone completes a third card, so in a same-round
  race the earlier seat wins. Finishing the round (everyone gets the same number of turns, ties to
  hull) is a one-sentence fix; untested, your call.
- **Heat is not the binding constraint** anywhere: mean heat at the check is 2.9–3.4 of 5 and heat
  damage happens on about 1% of turns in every row. Players have headroom; the bots do not spend it
  because nothing rewards spending it.

## My recommendation (data-backed; the decision is yours)

Adopt **Destroy worth 2 points** together with **shield cap 2** (`cap2_destroy2`). Reasons:
- It is the only pair that produces real combat (1.7 kills, 69 Destroy completions, one fifth of
  turns firing) while **every game finishes** and Deliver remains the main way to win.
- Both are zero-cost on the table: a "2" printed on the Destroy card and a shield tile with two
  cube slots instead of four. Spent shields need a spent-cube pile and a dock step to return them;
  it works, but it is one more thing to remember and it gave slightly less combat (1.1 kills).
- Dock repair 1 on top adds a little more (1.8 kills, 78 Destroy) at no complexity cost; it can be
  decided later.
- What it does not fix: Intercept stays cheap (its completions drop only because hands hold
  Destroy instead), 2-player games stay quiet, and the last seat still loses too often.

If you prefer to keep 4-cube shields for feel, `combo_full` (spent shields + Destroy 2 + dock
repair 1) is the alternative at 1.1 kills per game and the same finish rate.

Caveat on all of it: the bots are the same planner in every row. They read the knobs but have no
special tactics for them (nobody rations shields when cubes are spent, nobody hunts differently at
cap 2), so human play under a new rule can drift from these numbers. The rows measure the rule's
pull, not its ceiling.

## What I did not test and why

- **Fewer Deliver routes than 3** and **Intercept costs**: the deck knob exists; Intercept's cost has no knob yet (it needs a design, not a number).
- **Loot from kills** (a killed ship's crates left on its sector): it needs a new token and a pickup rule; it was cut once already (Salvage) and should be your call before it gets code.
- **Heat/dissipation changes**: not requested; the shield question is about refills, not capacity.
- **Finishing the round on a win**: surfaced by the seat-order numbers above; not implemented.

## Reproduce

```
cd engine
yarn sim --games=100 --bots=3 --maxTurns=400 --baseSeed=5000 --tiebreak                                   # baseline
yarn sim --games=100 --bots=3 --maxTurns=400 --baseSeed=5000 --tiebreak --rules=shieldMaxEnergy=2,destroyPoints=2
yarn sim --games=100 --bots=3 --maxTurns=400 --baseSeed=5000 --tiebreak --rules=shieldRefill=on_dock,dockHullRepair=1,destroyPoints=2
```
Knobs: `engine/src/models/rules.ts`. Add `--output=<dir>` for `summary.json` with per-game stats.
