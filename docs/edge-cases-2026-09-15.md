# Survey cost and sneaky hulls — 15 September 2026, evening

Written for the designer. 100 games × 3 bots per row, seeds 5000+, current rules (Destroy worth 2,
lasers ignore shields, one-way lanes, the new Survey). `bot-1` is the seat under test; the other two
seats play their own hands and hulls. The seat-1 baseline is not 33%: with everyone on their own
hand seat 1 wins 40% (see the turn-order note at the end).

## 1. Survey: named planet, two turns on Ring 1 with sensors powered

| | old Survey (`L_ignore`) | new Survey (`S_after`) |
|---|---|---|
| Survey completions / 100 games | 94 | 38 |
| Survey cards among winners' cards | 26 | 8 |
| Survey cards kept, share of all cards held | ~25% | 3% |
| Intercept completions | 38 | 61 |
| Destroy completions | 26 | 31 |
| games decided before the cap | 86% | 72% |
| rounds to finish (median) | 45 | 56 |

- **The card works as written.** In 30 recorded games the bots kept 9 Survey cards and completed
  all 9; every turn held on Ring 1 had the sensor array powered; three player-turns from arriving on
  the ring to the data chit. Nothing is broken, the card is simply no longer cheap.
- **The bots stop keeping it** (25% → 3% of held cards) and keep Intercept and Destroy instead.
- **Games got slower for an indirect reason.** In 40 recorded games 11 reached the cap; the cards
  left uncompleted in those games were **31 Destroy and 22 Deliver, no Survey, no Intercept**, with
  every player sitting on one or two points. With the deck's filler gone, hands lean on the
  two-point Destroy card, and three hunters who cannot close a kill stand off. On a table with no
  cap that is a long game. Two levers, neither pulled: fewer Destroy cards in hand (deal one Destroy
  per deck instead of one per opponent), or bots that actually close kills (theirs is a 0.8 kills
  per game problem as much as a rules problem).

## 2. Sneaky hulls

Forced on seat 1 whatever its hand asks for. Rows marked *illegal* need the tile limits lifted
(`--rules=tileLimits=false`): the set holds one of each tile except two lasers.

| run | bot-1 hull | bot-1 wins | others' wins (each) | bot-1 kills/g | bot-1 deaths/g | bot-1 hull dmg dealt/g | bot-1 hull dmg taken/g | bot-1 heat dmg/g | kills/g (all) | fin | rounds |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E_control_raider | railgun/missiles,radiator,fuel_compressor,shields | 35% | 32% | 0.25 | 0.19 | 9.42 | 6.84 | 0.82 | 0.8 | 74% | 56 |
| E_control_scout | sensor_array/shields,radiator,fuel_compressor,missiles | 42% | 29% | 0.05 | 0.2 | 2.4 | 6.88 | 0.05 | 0.4 | 67% | 57 |
| E_control_hauler_oldlaser | sensor_array/shields,radiator,fuel_compressor,laser | 35% | 33% | 0.05 | 0.19 | 1.39 | 5.56 | 0.04 | 0.4 | 71% | 51 |
| E_hauler_mirror | (own hand) | 35% | 33% | 0.31 | 0.35 | 11.58 | 12.2 | 0.0 | 1 | 100% | 39 |
| E_turtle2_mirror | (own hand) | 66% | 17% | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0 | 62% | 51 |
| S_after | (own hand) | 40% | 30% | 0.2 | 0.23 | 8.03 | 7.51 | 0.64 | 0.8 | 72% | 56 |
| E_control_hauler | sensor_array/shields,radiator,fuel_compressor,laser | 64% | 18% | 0.51 | 0.16 | 14.24 | 4.95 | 0.1 | 1 | 94% | 45 |
| E_turtle2 | sensor_array/shields,shields,radiator,radiator | 61% | 20% | 0.0 | 0.0 | 0.0 | 3.2 | 0.0 | 0.1 | 53% | 87 |
| E_turtle3 | sensor_array/shields,shields,shields,radiator | 58% | 21% | 0.0 | 0.0 | 0.0 | 2.98 | 0.21 | 0.1 | 55% | 75 |
| E_turtle_laser | sensor_array/shields,shields,radiator,laser | 56% | 22% | 0.66 | 0.03 | 16.92 | 2.69 | 0.3 | 1 | 93% | 51 |
| E_missiles5 | missiles/missiles,missiles,missiles,missiles | 17% | 42% | 0.38 | 1.59 | 9.06 | 27.08 | 3.12 | 2.2 | 97% | 41 |
| E_missiles3 | missiles/missiles,missiles,radiator,shields | 46% | 27% | 1.08 | 0.14 | 23.87 | 5.2 | 1.36 | 1.8 | 83% | 56 |
| E_rail_2rad | railgun/radiator,radiator,missiles,shields | 36% | 32% | 0.26 | 0.16 | 11.8 | 6.45 | 0.24 | 0.8 | 73% | 57 |
| E_rail_2rad_laser | railgun/radiator,radiator,laser,shields | 40% | 30% | 0.61 | 0.24 | 16.95 | 7.58 | 0.09 | 1.2 | 85% | 57 |
| E_rail_2shields | railgun/missiles,shields,shields,radiator | 35% | 33% | 0.27 | 0.04 | 8.71 | 2.34 | 0.78 | 0.6 | 72% | 56 |
| E_glass | railgun/missiles,laser,laser,radiator | 17% | 41% | 0.63 | 1.86 | 19.33 | 35.12 | 0.42 | 2.8 | 98% | 45 |
| E_double_laser | railgun/laser,laser,radiator,shields | 41% | 30% | 0.79 | 0.33 | 16.3 | 7.3 | 0.42 | 1.4 | 81% | 51 |

Legend: `E_control_*` are legal preset hulls forced the same way, for comparison. `_oldlaser` plays
the hauler hull with the previous shield rule. `_mirror` rows give every seat the hull.

Reading, in the order you asked:
- **Two shields + radiators (illegal, `turtle2`, `turtle3`).** Wins 61% and 58%, never dies, takes 3
  hull a game, deals none. Half the games hit the cap (87 rounds median), and the turtle wins them
  on the hull tiebreak. **The one-set-per-player rule is what stops this; keep it.** With every seat a
  turtle (`turtle2_mirror`) no shot is ever fired and the first seat wins 66% of games on turn order.
- **Full missiles (illegal, `missiles5`).** 17% wins, dies 1.6 times a game, 27 hull taken, 3 heat
  damage a game: five launchers, no shields, no radiator is a self-destruct. Three launchers with a
  radiator and shields (`missiles3`) is strong but not dominant: 46%, 1.1 kills a game.
- **Railgun + two radiators (illegal).** 36% and 40%: no better than legal hulls. Heat headroom is
  not what the railgun lacks; a second weapon on the same ring is.
- **The real outlier is legal: the Hauler preset** (sensor, shields, radiator, compressor, laser)
  forced on any hand wins **64%** (`E_control_hauler`). The same hull under the old shield rule wins
  35% (`_oldlaser`); the Raider forced the same way wins 35%, the Scout 42%. The shield-ignoring
  laser is the cause: it is now the only weapon that lands on a shielded ship, and the railgun hulls
  the bots pick for Destroy hands cannot hurt anyone with their railgun alone. When every seat flies
  the hauler (`hauler_mirror`) the game is healthy: 100% finish, 39 rounds, one kill a game — the
  problem is relative, not absolute. Options: accept it (the table will learn to carry a laser and
  the bots' templates should too), or give physical weapons a way through a full shield (shield cap
  3, which you declined this morning, or a railgun that does 5).
- **Glass cannon (legal, no shields).** 17% wins, dies 1.9 times a game. Shields earn their slot.

## 3. Turn order, again

With nobody shooting (`turtle2_mirror`) the first seat wins 66% of games; with normal hulls seat 1
wins 40% and seat 3 about 28%. The game ends the moment the third point lands, so in a same-round
race the earlier seat wins. Finishing the round is still the one-sentence fix, still untested.


## 4. Repeats allowed: the wacky sweep

Decision (designer, 15 Sept evening): the rules do not limit copies of a tile; any tile may fill any
slot it fits. The one-set-per-player line is gone from RULES.md. So every row below is a legal hull.
Seat 1 is forced to the hull, the other two seats play their own hands; the seat-1 baseline with its
own hand is 40% of wins, 26% as real victories before the cap. "Real victories" excludes games won on
the cap tiebreak, which a table without a cap never sees.

| run | seat-1 hull | wins | real victories | others (each) | kills/g | deaths/g | dealt/g | taken/g | fin | rounds |
|---|---|---|---|---|---|---|---|---|---|---|
| W_bunker4 | sensor_array/shields,shields,shields,shields | 58% | 19% | 21% | 0.0 | 0.0 | 0.0 | 3.22 | 55% | 64 |
| W_shields2_lasers2 | sensor_array/shields,shields,laser,laser | 58% | 57% | 21% | 1.25 | 0.02 | 21.72 | 1.88 | 93% | 45 |
| W_laserboat | railgun/laser,laser,laser,laser | 22% | 20% | 39% | 1.37 | 2.16 | 23.27 | 33.3 | 93% | 45 |
| W_rail_lasers2_rads2 | railgun/laser,laser,radiator,radiator | 26% | 23% | 37% | 0.76 | 2.33 | 16.02 | 35.62 | 90% | 48 |
| W_rail_missiles2 | railgun/missiles,missiles,radiator,shields | 28% | 19% | 36% | 0.5 | 0.21 | 14.23 | 7.04 | 74% | 57 |
| W_rail_missiles3 | railgun/missiles,missiles,missiles,radiator | 26% | 19% | 37% | 1.2 | 1.87 | 28.22 | 36.32 | 91% | 47 |
| W_miss_lasers | missiles/missiles,missiles,laser,shields | 39% | 28% | 30% | 0.89 | 0.2 | 16.17 | 5.43 | 82% | 63 |
| W_scalpel4 | sensor_array/laser,laser,laser,laser | 31% | 29% | 34% | 1.11 | 1.86 | 18.46 | 26.08 | 98% | 39 |
| W_scalpel3 | sensor_array/laser,laser,laser,shields | 58% | 58% | 21% | 0.87 | 0.23 | 16.28 | 4.98 | 93% | 45 |
| W_scalpel2_comp | sensor_array/laser,laser,shields,fuel_compressor | 50% | 47% | 25% | 0.49 | 0.23 | 11.52 | 5.92 | 88% | 49 |
| W_pdc_wall | railgun/ballistic_rack,ballistic_rack,shields,radiator | 30% | 19% | 35% | 0.16 | 0.29 | 6.63 | 7.4 | 71% | 57 |
| W_tanker | railgun/fuel_compressor,fuel_compressor,fuel_compressor,fuel_compressor | 22% | 16% | 39% | 0.07 | 1.77 | 2.14 | 31.24 | 86% | 45 |
| W_fast_hauler | sensor_array/fuel_compressor,fuel_compressor,shields,laser | 48% | 47% | 26% | 0.49 | 0.27 | 13.56 | 5.82 | 95% | 45 |
| W_hotrod | railgun/radiator,radiator,radiator,radiator | 17% | 9% | 42% | 0.06 | 1.9 | 3.69 | 30.32 | 82% | 44 |
| W_sensor_rads | sensor_array/radiator,radiator,radiator,radiator | 19% | 9% | 41% | 0.0 | 1.41 | 0.0 | 38.14 | 86% | 39 |
| W_hauler_cap3 | sensor_array/shields,radiator,fuel_compressor,laser | 42% | 39% | 29% | 0.41 | 0.35 | 13.4 | 8.93 | 97% | 45 |
| W_hauler_rail5 | sensor_array/shields,radiator,fuel_compressor,laser | 47% | 44% | 27% | 0.42 | 0.39 | 13.82 | 9.37 | 95% | 45 |
| W_hauler_laserboat_opp | sensor_array/shields,radiator,fuel_compressor,laser | 41% | 40% | 30% | 0.34 | 0.68 | 12.58 | 14.99 | 98% | 45 |

`hauler_cap3`, `hauler_rail5` and `hauler_laserboat_opp` replay the Hauler hull of §2 with a shield cap
of 3, a 5-damage railgun, and opponents who all carry two lasers, respectively.

Reading:
- **One family is overpowered, and it is not the wacky one.** Sensor array + shields + one or two
  lasers wins outright far above baseline: shields×2 + lasers×2 **57%**, lasers×3 + shields **58%**,
  the Hauler preset **63%**, lasers×2 + shields + compressor 47%, compressor×2 + shields + laser 47%.
  Every railgun hull sits between 9% and 23% of real victories. The cause is the same in every row:
  a laser lands on a shielded ship and nothing physical does, so "shields + laser" beats "shields +
  railgun" whatever else is aboard. With two lasers on opposite sides the ship also covers both ring
  directions, and it dies twice a game less often than anything carrying a railgun.
- **The stalls are not wins.** Four shields wins 58% of games but only 19% before the cap: it cannot
  be killed and cannot kill, so half its games run to the cap and it takes the hull tiebreak. On a
  table that is a long, dull game, not a strong hull. Same for the 2×shield + 2×radiator turtle of §2.
- **Glass is glass.** Four lasers with no shields (22%), four radiators (17%, 19%), four compressors
  (22%), three missile launchers (26%): all die about twice a game. Nothing that drops the shield
  tile is a problem.
- **Missiles everywhere is fine.** Two or three launchers with a radiator and shields are ordinary
  (19% to 28% real victories); five launchers is a self-destruct (§2).
- **Point defence walls do nothing.** Two racks: 19%.
- **The lever that works is the shield cap.** Same Hauler hull: 63% → 39% at shield cap 3, 44% with
  a 5-damage railgun, 40% when every opponent also flies two lasers. Cap 3 works because railgun +
  missile (6) then puts 3 on the hull through a full shield instead of 2, and 3 cubes is also one
  cube less the laser hull can pour into its own shields. It is the one knob you declined this morning;
  the laser change has moved the ground under it, so it is worth a second look. §5 measures it under
  the final-round rule.


## 5. Finishing the round (adopted) and shield cap 3 (measured, not adopted)

Rule adopted 15 Sept evening: reaching 3 points triggers the final round; when the round ends,
highest score wins, then hull, then fuel, then the earlier seat. Same 100 seeds, everything else as
above. `_cap3` rows add `shieldMaxEnergy=3`.

| seat wins | seat 1 | seat 2 | seat 3 | seat 4 |
|---|---|---|---|---|
| 3 players, instant win (`S_after`) | 40 | 32 | 28 | |
| 3 players, round finished (`F_own`) | 37 | 34 | 29 | |
| 4 players, instant win (`H_rack_4`) | 27 | 21 | 30 | 22 |
| 4 players, round finished (`F_own_4`) | 30 | 17 | 32 | 21 |

- **The rule does what it says and no more.** Same-round races are gone, and seat 1 loses about
  three points of win share for it. The remaining first-seat edge (37% at three players) is therefore
  not turn order inside the round. The likeliest source is deployment order: seat 1 places first and
  takes the sector its hand wants, and seat 1 also drifts, docks and jumps first every round, a
  quarter-turn ahead of everyone chasing the same stations. At four players the pattern is noise-level.

| run | seat-1 hull | wins | real victories | others (each) | kills/g | deaths/g | dealt/g | taken/g | fin | rounds |
|---|---|---|---|---|---|---|---|---|---|---|
| F_own | (own hand) | 37% | 26% | 32% | 0.2 | 0.23 | 8.03 | 7.57 | 72% | 56 |
| F_own_cap3 | (own hand) | 37% | 34% | 32% | 0.43 | 0.4 | 13.6 | 9.92 | 93% | 50 |
| F_hauler | sensor_array/shields,radiator,fuel_compressor,laser | 64% | 63% | 18% | 0.51 | 0.16 | 14.24 | 4.97 | 94% | 45 |
| F_hauler_cap3 | sensor_array/shields,radiator,fuel_compressor,laser | 41% | 39% | 30% | 0.41 | 0.35 | 13.4 | 9.0 | 97% | 45 |
| F_shields2_lasers2 | sensor_array/shields,shields,laser,laser | 58% | 57% | 21% | 1.25 | 0.02 | 21.72 | 1.91 | 93% | 45 |
| F_shields2_lasers2_cap3 | sensor_array/shields,shields,laser,laser | 54% | 54% | 23% | 1.12 | 0.05 | 20.42 | 2.05 | 96% | 45 |
| F_scalpel3 | sensor_array/laser,laser,laser,shields | 58% | 58% | 21% | 0.87 | 0.23 | 16.28 | 5.06 | 93% | 45 |
| F_scalpel3_cap3 | sensor_array/laser,laser,laser,shields | 43% | 42% | 29% | 0.69 | 0.47 | 16.2 | 8.81 | 95% | 43 |

- **Shield cap 3 unsticks the game on its own.** With everyone on their own hands, games decided
  before the cap go from 72% to 93%, median length from 56 to 50 rounds, kills from 0.8 to 1.3 a game
  and Destroy completions from 31 to 66. The 3-way Destroy standoffs of §1 mostly dissolve because a
  railgun-plus-missile volley (6) now puts 3 on a shielded hull instead of 2.
- **It blunts the single-shield laser hulls** (Hauler 63% → 39%, three lasers + shields 58% → 42%),
  bringing them to the seat-1 baseline.
- **It does not touch the double-shield double-laser hull** (57% → 54%): two shield tiles at cap 3
  still hold 6 cubes, exactly a railgun-plus-missile volley, so physical hulls still cannot hurt it
  while its two lasers land on everything. It kills 1.1 ships a game and dies once in twenty games.
  This is the one hull the sweep leaves standing. What would reach it, in order of simplicity:
  (a) **shields do not stack**: only one shield tile may absorb a given shot; (b) **shield cap 2**;
  (c) a table where opponents carry lasers (its 57% drops when they do, §4). None tested; (a) is one
  sentence and leaves a second shield tile useful only as a spare when the first is broken.

Recommendation: adopt shield cap 3 (it fixes pacing and most of the dominance at once), then decide
between (a) and (b) for stacked shields. Both are one line in RULES.md and one number or clause in
`damage.ts`; I can run the matrix on either in an hour.


## 6. Pricing shields with heat: base dissipation × shield cap

Designer's proposal (15 Sept, late): keep stacked shields legal but make "shielding up" cost the other
systems, by lowering the base dissipation (5 today; a radiator adds 2) together with shield cap 3.
Shields turn damage into heat, so a lower dissipation should turn every absorbed point into a
tighter turn or a point of hull. Everyone on their own hands, final-round rule on:

| run | rules | fin | rounds | kills/g | hull dmg/g | heat dmg turns | coast | firing | shields on | soaked | Destroy done | Deliver done |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F_own | defaults | 72% | 56 | 0.8 | 25.1 | 1% | 45% | 10% | 68% | 63% | 31 | 309 |
| F_own_cap3 | shieldMaxEnergy=3 | 93% | 50 | 1.3 | 34.3 | 1% | 43% | 15% | 63% | 53% | 66 | 278 |
| D_4c4 | baseDissipation=4 | 66% | 64 | 0.5 | 17.6 | 2% | 46% | 9% | 69% | 70% | 15 | 328 |
| D_3c4 | baseDissipation=3 | 64% | 63 | 0.4 | 15.7 | 2% | 47% | 10% | 71% | 75% | 15 | 336 |
| D_4c3 | baseDissipation=4,shieldMaxEnergy=3 | 86% | 56 | 1.1 | 32.7 | 2% | 43% | 13% | 63% | 57% | 42 | 320 |
| D_3c3 | baseDissipation=3,shieldMaxEnergy=3 | 85% | 61 | 1.1 | 30.9 | 2% | 45% | 14% | 65% | 60% | 41 | 330 |
| D_2c3 | baseDissipation=2,shieldMaxEnergy=3 | 69% | 75 | 0.7 | 16.9 | 3% | 48% | 10% | 71% | 69% | 23 | 313 |

Reading:
- **Lower dissipation alone goes the wrong way.** At 4 or 3 the bots fire less (9–10% of turns),
  kill less (0.5, 0.4 a game), keep shields up more (69–71% of turns) and soak more of what is fired
  (70–75%). Games run 63–64 rounds and a third reach the cap. The heat budget is shared by burns,
  guns and scoop as well as shields, so a tighter budget makes the attacker hold fire before it makes
  the defender pay: heat damage stays at 2% of turns because the bots simply do less.
- **Cap 3 is doing all the work.** Cap 3 at dissipation 5 is the best row on every column that
  matters (93% finish, 50 rounds, 1.3 kills, 66 Destroy). Adding dissipation 4 or 3 to it gives back
  a third of that (86% / 85% finish, 56 / 61 rounds, 42 / 41 Destroy). Dissipation 2 is a slog (75
  rounds).
- The forced-hull rows below say whether the tighter budget at least reaches the double-shield laser
  hull that cap 3 alone does not.

The dominant hulls, forced on seat 1, at dissipation 5 / 4 / 3 with cap 3 (`F_*_cap3` = dissipation 5):

| run | seat-1 hull | wins | real victories | others (each) | kills/g | deaths/g | dealt/g | taken/g | fin | rounds |
|---|---|---|---|---|---|---|---|---|---|---|
| F_hauler_cap3 | sensor_array/shields,radiator,fuel_compressor,laser | 41% | 39% | 30% | 0.41 | 0.35 | 13.4 | 9.0 | 97% | 45 |
| D_4c3_hauler | sensor_array/shields,radiator,fuel_compressor,laser | 54% | 53% | 23% | 0.59 | 0.21 | 16.08 | 6.95 | 95% | 45 |
| D_3c3_hauler | sensor_array/shields,radiator,fuel_compressor,laser | 51% | 50% | 24% | 0.49 | 0.27 | 14.62 | 6.33 | 93% | 46 |
| F_shields2_lasers2_cap3 | sensor_array/shields,shields,laser,laser | 54% | 54% | 23% | 1.12 | 0.05 | 20.42 | 2.05 | 96% | 45 |
| D_4c3_sh2la2 | sensor_array/shields,shields,laser,laser | 56% | 56% | 22% | 0.93 | 0.05 | 19.16 | 2.0 | 96% | 47 |
| D_3c3_sh2la2 | sensor_array/shields,shields,laser,laser | 51% | 50% | 24% | 0.85 | 0.02 | 15.74 | 1.41 | 93% | 51 |
| F_scalpel3_cap3 | sensor_array/laser,laser,laser,shields | 43% | 42% | 29% | 0.69 | 0.47 | 16.2 | 8.81 | 95% | 43 |
| D_4c3_scalpel3 | sensor_array/laser,laser,laser,shields | 47% | 45% | 27% | 0.83 | 0.45 | 15.84 | 8.26 | 93% | 45 |
| D_3c3_scalpel3 | sensor_array/laser,laser,laser,shields | 37% | 35% | 32% | 0.52 | 0.39 | 11.56 | 6.22 | 94% | 51 |
| E_turtle2 | sensor_array/shields,shields,radiator,radiator | 61% | 20% | 20% | 0.0 | 0.0 | 0.0 | 3.2 | 53% | 87 |
| D_4c3_turtle | sensor_array/shields,shields,radiator,radiator | 56% | 24% | 22% | 0.0 | 0.0 | 0.0 | 3.44 | 67% | 57 |
| D_3c3_turtle | sensor_array/shields,shields,radiator,radiator | 56% | 21% | 22% | 0.0 | 0.0 | 0.0 | 1.92 | 63% | 59 |

- **Lower dissipation helps the laser hulls.** Hauler 39% → 53% → 50%, three lasers 42% → 45% → 35%,
  double shields + double lasers 54% → 56% → 50%. A laser costs 2 heat; a railgun-plus-missile volley
  costs 6. Shrink the budget and it is the railgun hull that stops shooting first, while the laser
  hull keeps landing 2 through anything. The heat that shields hand the defender only bites when the
  defender also wants to act that turn, and the laser hull's turn is cheap.
- **The turtle is unmoved** (20% → 24% → 21% real victories, still 0 damage dealt, still a third of
  games at the cap). It absorbs 3 hull a game; dissipation is irrelevant to a ship nobody shoots at.

**Conclusion on the proposal:** base dissipation is the wrong knob for pricing shields, because it is
shared by every system, and the cheap-heat weapon is the one you want to tax. Cap 3 at dissipation 5
stays the best combination measured. §7 tests a knob that only shields feel.

## Reproduce

```
cd engine
yarn sim --games=100 --bots=3 --maxTurns=400 --baseSeed=5000 --tiebreak --seats=bot-1=sensor_array/shields,shields,radiator,radiator --rules=tileLimits=false
yarn sim --games=100 --bots=3 --maxTurns=400 --baseSeed=5000 --tiebreak --seats=bot-1=sensor_array/shields,radiator,fuel_compressor,laser
```
