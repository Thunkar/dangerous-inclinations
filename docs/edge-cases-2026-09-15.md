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


## 7. A knob only shields feel: two heat per absorbed point (measured, not adopted)

`shieldHeatPerPoint=2`: every point of damage a shield absorbs puts **two** heat on the defender
instead of one. Nothing else changes. Everyone on their own hands, final-round rule on:

| run | rules | fin | rounds | kills/g | hull dmg/g | heat dmg turns | coast | firing | shields on | soaked | Destroy done | Deliver done |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F_own | defaults | 72% | 56 | 0.8 | 25.1 | 1% | 45% | 10% | 68% | 63% | 31 | 309 |
| F_own_cap3 | shieldMaxEnergy=3 | 93% | 50 | 1.3 | 34.3 | 1% | 43% | 15% | 63% | 53% | 66 | 278 |
| X_c4h2 | shieldHeatPerPoint=2 | 87% | 51 | 1.5 | 26.6 | 5% | 46% | 11% | 65% | 62% | 53 | 289 |
| X_c3h2 | shieldMaxEnergy=3,shieldHeatPerPoint=2 | 95% | 45 | 1.7 | 37.3 | 2% | 45% | 14% | 62% | 53% | 72 | 269 |

The dominant hulls forced on seat 1, cap 3 alone against cap 3 + two heat per point:

| run | seat-1 hull | wins | real victories | others (each) | kills/g | deaths/g | dealt/g | taken/g | fin | rounds |
|---|---|---|---|---|---|---|---|---|---|---|
| F_hauler_cap3 | sensor_array/shields,radiator,fuel_compressor,laser | 41% | 39% | 30% | 0.41 | 0.35 | 13.4 | 9.0 | 97% | 45 |
| X_c3h2_hauler | sensor_array/shields,radiator,fuel_compressor,laser | 43% | 41% | 29% | 0.43 | 0.41 | 13.48 | 8.67 | 93% | 45 |
| F_shields2_lasers2_cap3 | sensor_array/shields,shields,laser,laser | 54% | 54% | 23% | 1.12 | 0.05 | 20.42 | 2.05 | 96% | 45 |
| X_c3h2_sh2la2 | sensor_array/shields,shields,laser,laser | 53% | 53% | 23% | 1.04 | 0.13 | 19.1 | 2.2 | 96% | 45 |
| F_scalpel3_cap3 | sensor_array/laser,laser,laser,shields | 43% | 42% | 29% | 0.69 | 0.47 | 16.2 | 8.81 | 95% | 43 |
| X_c3h2_scalpel3 | sensor_array/laser,laser,laser,shields | 37% | 35% | 32% | 0.64 | 0.72 | 14.04 | 8.19 | 97% | 39 |
| E_turtle2 | sensor_array/shields,shields,radiator,radiator | 61% | 20% | 20% | 0.0 | 0.0 | 0.0 | 3.2 | 53% | 87 |
| X_c3h2_turtle | sensor_array/shields,shields,radiator,radiator | 49% | 20% | 26% | 0.0 | 0.01 | 0.0 | 3.12 | 69% | 58 |

Reading:
- **This is the shield price you asked for.** It taxes only ships that get hit while shielded: heat
  damage rises from 1% to 5% of turns at cap 4, and a ship that soaks a six-point volley on two
  shield tiles reads 12 heat at its check, 7 hull without radiators. Absorbing becomes a choice about
  how much to risk, not a free wall.
- **Pacing is the best of any row measured today** when combined with cap 3: 95% of games decided
  before the cap, 45 rounds, 1.7 kills and 72 Destroy completions per 100 games (cap 3 alone: 93%,
  50, 1.3, 66). Even at cap 4 it does most of the work (87%, 51 rounds, 1.5 kills).
- **It does not dent the double-shield double-laser hull** (54% → 53%), for the same reason
  nothing else has: that ship takes 2 hull a game, so a price on absorption rarely comes due. Its edge
  is that its lasers land while the railgun hulls around it cannot reach a 6-cube wall. The only
  counters measured are opponents who also carry lasers (its cousin the Hauler falls to 40% against
  two-laser opponents, §4) or a physical volley that beats 6: railgun + missile + rack is 7.
- The three-laser hull drops to 35%, below baseline; the Hauler sits at 41%, at baseline.

**Recommendation:** adopt **shield cap 3 and two heat per absorbed point** together, as one line in
RULES.md ("a shield holds up to 3 cubes; every point it absorbs is 2 heat"). It prices shields
specifically, keeps repeats legal, and gives the best pacing measured. Then watch the double-shield
laser hull at the table: if it dominates there too, the answers are a laser on every hull (the bots'
raider preset should carry one) or a heavier physical volley, not another shield rule. If adopted, I
will update the heat indicator (hatched shield heat ×2), the bots' shield allocation and RULES.md.


## 8. Shield cap 2 with two heat per point: the loadout table

Own hands, cap 2, heat 2: **95% decided before the cap, 45 rounds, 1.9 kills a game, 73 Destroy
completions** (cap 3: 95% / 45 / 1.7 / 72; cap 4: 87% / 51 / 1.5 / 53). Seat wins 37 / 41 / 22.

Every hull forced on seat 1 (baseline seat-1 wins 37%):

| run | seat-1 hull | wins | real victories | others (each) | kills/g | deaths/g | dealt/g | taken/g | fin | rounds |
|---|---|---|---|---|---|---|---|---|---|---|
| C2_hauler | sensor_array/shields,radiator,fuel_compressor,laser | 41% | 40% | 29% | 0.51 | 0.46 | 12.38 | 11.2 | 97% | 46 |
| C2_raider | railgun/missiles,radiator,fuel_compressor,shields | 37% | 35% | 32% | 0.89 | 0.53 | 18.58 | 11.8 | 96% | 45 |
| C2_scout | sensor_array/shields,radiator,fuel_compressor,missiles | 27% | 22% | 36% | 0.08 | 0.62 | 2.66 | 13.18 | 87% | 45 |
| C2_hunter | railgun/missiles,radiator,laser,shields | 32% | 27% | 34% | 1.3 | 0.48 | 27.12 | 12.98 | 90% | 51 |
| C2_sh2la2 | sensor_array/shields,shields,laser,laser | 47% | 46% | 27% | 1.11 | 0.53 | 18.74 | 4.31 | 96% | 45 |
| C2_scalpel3 | sensor_array/laser,laser,laser,shields | 39% | 38% | 31% | 0.72 | 0.7 | 14.06 | 11.02 | 96% | 39 |
| C2_scalpel4 | sensor_array/laser,laser,laser,laser | 20% | 19% | 40% | 1.09 | 1.7 | 17.88 | 24.52 | 97% | 39 |
| C2_turtle | sensor_array/shields,shields,radiator,radiator | 48% | 18% | 26% | 0.0 | 0.07 | 0.0 | 7.86 | 68% | 59 |
| C2_turtle_laser | sensor_array/shields,shields,radiator,laser | 34% | 32% | 33% | 0.56 | 0.35 | 14.74 | 6.0 | 91% | 51 |
| C2_bunker | sensor_array/shields,shields,shields,shields | 42% | 17% | 29% | 0.0 | 0.09 | 0.0 | 2.15 | 74% | 57 |
| C2_laserboat | railgun/laser,laser,laser,laser | 19% | 15% | 41% | 1.46 | 1.96 | 26.48 | 34.4 | 93% | 45 |
| C2_rail_la2_rad2 | railgun/laser,laser,radiator,radiator | 24% | 19% | 38% | 1.52 | 2.09 | 26.8 | 34.78 | 93% | 45 |
| C2_rail_miss2 | railgun/missiles,missiles,radiator,shields | 41% | 37% | 30% | 1.52 | 0.46 | 27.7 | 10.09 | 93% | 45 |
| C2_missiles3 | missiles/missiles,missiles,radiator,shields | 47% | 41% | 27% | 2.37 | 0.37 | 35.14 | 12.14 | 93% | 45 |
| C2_glass | railgun/missiles,laser,laser,radiator | 19% | 15% | 41% | 1.42 | 1.48 | 34.67 | 33.28 | 93% | 45 |
| C2_pdc | railgun/ballistic_rack,ballistic_rack,shields,radiator | 28% | 24% | 36% | 0.81 | 0.59 | 18.93 | 14.98 | 90% | 55 |
| C2_fast_hauler | sensor_array/fuel_compressor,fuel_compressor,shields,laser | 35% | 34% | 32% | 0.34 | 0.6 | 11.5 | 12.58 | 95% | 45 |
| C2_rail_sh2_rad | railgun/missiles,shields,shields,radiator | 35% | 29% | 33% | 1.0 | 0.31 | 19.8 | 5.03 | 88% | 45 |

The same presets and outliers under cap 3 for comparison:

| run | seat-1 hull | wins | real victories | others (each) | kills/g | deaths/g | dealt/g | taken/g | fin | rounds |
|---|---|---|---|---|---|---|---|---|---|---|
| X_c3h2_hauler | sensor_array/shields,radiator,fuel_compressor,laser | 43% | 41% | 29% | 0.43 | 0.41 | 13.48 | 8.67 | 93% | 45 |
| X_c3h2_raider | railgun/missiles,radiator,fuel_compressor,shields | 33% | 27% | 33% | 0.87 | 0.48 | 22.87 | 11.9 | 88% | 51 |
| X_c3h2_scout | sensor_array/shields,radiator,fuel_compressor,missiles | 25% | 22% | 38% | 0.09 | 0.58 | 2.65 | 11.78 | 91% | 50 |
| X_c3h2_hunter | railgun/missiles,radiator,laser,shields | 39% | 32% | 30% | 0.98 | 0.43 | 27.0 | 8.88 | 90% | 52 |
| X_c3h2_sh2la2 | sensor_array/shields,shields,laser,laser | 53% | 53% | 23% | 1.04 | 0.13 | 19.1 | 2.2 | 96% | 45 |
| X_c3h2_scalpel3 | sensor_array/laser,laser,laser,shields | 37% | 35% | 32% | 0.64 | 0.72 | 14.04 | 8.19 | 97% | 39 |
| X_c3h2_turtle | sensor_array/shields,shields,radiator,radiator | 49% | 20% | 26% | 0.0 | 0.01 | 0.0 | 3.12 | 69% | 58 |

Hull by hull (win = games won outright, cap 2):

| hull | tiles | win | what it is | strengths | weaknesses |
|---|---|---|---|---|---|
| **Hauler** (preset) | sensor / shields, radiator, compressor, laser | 40% | long-haul trader with a sting | free jumps, cool running, a gun that lands through any shield, sensor for Intercept, Survey and 8+ crits | one 2-damage gun; one 2-cube shield; dies 0.46 a game now (0.16 under cap 4) |
| **Raider** (preset) | railgun / missiles, radiator, compressor, shields | 35% | hit-and-run hunter with the fuel to reach its target | railgun + missile (6) puts 4 through a 2-cube shield; 0.9 kills a game; free jumps | no sensor, so no Intercept or Survey; railgun needs its ring and its facing; helpless against a laser hull that stays off its ring |
| **Scout** (preset) | sensor / shields, radiator, compressor, missiles | 22% | sensor hull with missiles instead of a laser | scans and surveys; guided fire from 2 rings away | its only gun is absorbed whole by a 2-cube shield: 2.7 hull dealt a game. Dead weight; the Hauler does its job better |
| **Hunter** (preset) | railgun / missiles, radiator, laser, shields | 27% | a gun for every ring | highest damage of the presets (27 a game), 1.3 kills | no compressor: slow to reach anyone; fights everything and gets shot back (13 taken, dies 0.48); longest games |
| shields×2 + lasers×2 | sensor / shields, shields, laser, laser | 46% | the double wall with both broadsides | 4 cubes soak a whole railgun shot; 2 + 2 unshieldable damage covering both ring directions | soaking 4 is 8 heat, 3 hull on a bare hull; no radiator, no compressor; shields + lasers is 8 of 10 cubes, leaving 2 for engines. Still the best hull, but now mortal (0.53 deaths against 0.05 under cap 3) |
| lasers×3 + shields | sensor / laser, laser, laser, shields | 38% | the scalpel | three unshieldable shots, sensor crits | 6 cubes of guns, thin shield, 11 taken a game |
| lasers×4 | sensor / laser ×4 | 19% | all scalpel, no armour | 8 damage a turn if everything bears | dies 1.7 times a game |
| shields×2 + radiators×2 | sensor / shields, shields, radiator, radiator | 18% | the turtle | soaks 4 for 8 heat and sheds 9: the one hull that walls a railgun cleanly | deals nothing, wins nothing outright; a third of its games stall to the cap |
| shields×2 + radiator + laser | sensor / shields, shields, radiator, laser | 32% | turtle with a sting | soaks 4 at 8 heat against 7 dissipation (1 hull), one laser | one gun, no compressor |
| shields×4 | sensor / shields ×4 | 17% | the bunker | 8 cubes | 8 absorbed is 16 heat: suicide if anyone bothers; deals nothing |
| railgun + lasers×4 | railgun / laser ×4 | 15% | laser boat | 12 damage on paper | no shield, no radiator: dies twice a game |
| railgun + lasers×2 + radiators×2 | railgun / laser, laser, radiator, radiator | 19% | hot gunboat | can fire everything every turn | no shield: dies twice a game |
| railgun + missiles×2 + radiator + shields | railgun / missiles, missiles, radiator, shields | 37% | brawler | 8-damage volley, 1.5 kills a game | 8 heat for the full volley, 7 dissipation; 8 missiles then dry |
| missiles×3 + radiator + shields | missiles / missiles, missiles, radiator, shields | 41% | missile boat | 6 guided damage from 2 rings and 3 sectors away, 2.4 kills a game, the top killer at cap 2 | 12 missiles then nothing; racks intercept; 6 heat a volley |
| railgun + missiles + lasers×2 + radiator | railgun / missiles, laser, laser, radiator | 15% | glass cannon | 35 hull dealt a game | 33 taken, dies 1.5 times |
| railgun + racks×2 + shields + radiator | railgun / rack, rack, shields, radiator | 24% | point-defence wall | two intercept rolls against missiles | racks do 1; nothing reaches a laser hull |
| sensor + compressors×2 + shields + laser | sensor / compressor, compressor, shields, laser | 34% | fast hauler | 22 fuel, free jumps everywhere | one gun, one shield, no radiator |
| railgun + missiles + shields×2 + radiator | railgun / missiles, shields, shields, radiator | 29% | armoured raider | soaks 4, 6-damage volley | no compressor; 8 heat when the wall is hit |

Reading:
- **Cap 2 spreads the field.** The best hull wins 46% outright against 53% under cap 3 and 57% under
  cap 4, and the presets sit at 40 / 35 / 27 / 22 around a 37% baseline. Nothing is unkillable any
  more: the double-shield laser hull dies ten times as often as under cap 3.
- **Doubling shields becomes a build, not a default.** One shield soaks one missile or half a railgun
  shot; two soak a railgun shot but hand you 8 heat, which only radiators make survivable. The turtle
  (two shields, two radiators) is the specialised wall you wanted: legal, real, and 18% because it
  cannot shoot.
- **Missiles come back.** Under cap 4 a 2-cube shield swallowed every missile; at cap 2 a volley of
  three lands 4, and the missile boat is the top killer (2.4 a game) without dominating (41%).
- **Two presets need work.** The Scout is dead weight (22%): a sensor hull wants a laser, not
  missiles, and that is the Hauler. The Hunter (27%) fights everything and lacks the fuel to pick its
  fights; giving it the compressor instead of the radiator (railgun / missiles, compressor, laser,
  shields) is the obvious candidate to test.
- **Pacing is identical to cap 3** and seat 3's 22% wants a second look with more seeds.

Recommendation: **cap 2.** Same pacing as cap 3, flatter field, and shields become a decision with a
visible price on the table (two cubes soak a missile; stack them and bring radiators).


## 9. Adopted: cap 2, two heat per point; presets tested; rule set pruned

Adopted 15 Sept 2026 (night): **shield cap 2, two heat per absorbed point.** With the day's other
decisions (Destroy worth 2, lasers ignore shields, one-way lanes, the new Survey, finish the round,
repeats allowed) these are the rules in RULES.md. Every knob that was decided is now a constant; the
rule set keeps three live knobs (shield cap, shield heat per point, Destroy's worth).

Preset candidates, forced on seat 1 under cap 2 (baseline 37%):

| run | seat-1 hull | wins | real victories | others (each) | kills/g | deaths/g | dealt/g | taken/g | fin | rounds |
|---|---|---|---|---|---|---|---|---|---|---|
| C2_hunter | railgun/missiles,radiator,laser,shields | 32% | 27% | 34% | 1.3 | 0.48 | 27.12 | 12.98 | 90% | 51 |
| P_hunter_comp | railgun/missiles,fuel_compressor,laser,shields | 28% | 23% | 36% | 0.77 | 0.72 | 17.84 | 14.86 | 91% | 51 |
| P_hunter_comp_rad | railgun/missiles,fuel_compressor,laser,radiator | 30% | 25% | 35% | 1.2 | 1.24 | 36.62 | 35.54 | 92% | 45 |
| C2_scout | sensor_array/shields,radiator,fuel_compressor,missiles | 27% | 22% | 36% | 0.08 | 0.62 | 2.66 | 13.18 | 87% | 45 |
| P_scout_A | sensor_array/shields,radiator,laser,missiles | 33% | 33% | 33% | 0.46 | 0.48 | 11.46 | 10.12 | 96% | 44 |
| P_scout_B | sensor_array/shields,laser,fuel_compressor,missiles | 27% | 25% | 36% | 0.31 | 0.83 | 8.04 | 14.98 | 91% | 45 |
| P_scout_D | sensor_array/shields,laser,laser,fuel_compressor | 38% | 38% | 31% | 0.57 | 0.54 | 12.92 | 10.56 | 98% | 39 |
| C2_raider | railgun/missiles,radiator,fuel_compressor,shields | 37% | 35% | 32% | 0.89 | 0.53 | 18.58 | 11.8 | 96% | 45 |
| P_raider_laser | railgun/laser,radiator,fuel_compressor,shields | 39% | 34% | 30% | 1.11 | 0.68 | 20.18 | 14.74 | 93% | 45 |
| C2_hauler | sensor_array/shields,radiator,fuel_compressor,laser | 41% | 40% | 29% | 0.51 | 0.46 | 12.38 | 11.2 | 97% | 46 |

- **Scout** becomes sensor, shields, laser, laser, compressor (38% against 22%). A sensor hull wants
  guns that land through shields, and two lasers cover both ring directions.
- **Hunter** stays railgun, missiles, radiator, laser, shields: swapping the radiator for the
  compressor (23%) or dropping shields for both (25%) measured worse than the current 27%.
- **Raider** stays: a laser in place of the missiles is a wash (34% against 35%), and missiles keep
  it distinct from the Hauler.

Natural play under the final rules (bots choose hands and hulls; `F_own` is this morning's rules
for comparison):

| run | rules | fin | rounds | kills/g | hull dmg/g | heat dmg turns | coast | firing | shields on | soaked | Destroy done | Deliver done |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F_own | defaults | 72% | 56 | 0.8 | 25.1 | 1% | 45% | 10% | 68% | 63% | 31 | 309 |
| N_own3 | defaults | 100% | 39 | 2 | 40.1 | 1% | 41% | 16% | 59% | 36% | 82 | 247 |
| N_own2 | defaults | 99% | 39 | 0.7 | 16.2 | 1% | 39% | 10% | 37% | 41% | 39 | 307 |
| N_own4 | defaults | 94% | 39 | 4.2 | 73.7 | 2% | 41% | 22% | 72% | 34% | 122 | 222 |

Seats: 3 players 33 / 46 / 21, 2 players 57 / 43, 4 players 33 / 22 / 25 / 20. Hulls chosen at 3
players: Raider 230 of 300 seats (32% win rate), Scout 46 (41%), Hauler 24 (29%).

Reading:
- **Pacing is fixed.** From 72% of games decided before the cap and 56 rounds this morning to 100%
  and 39 rounds at three players; 99% / 39 at two, 94% / 39 at four. Destroy completions 31 → 82.
- **Four players is bloody**: 4.2 kills a game, 74 hull damage, 122 Destroy completions per 100
  games. Every player dies about once per game. Worth a look at the table before deciding whether
  that is a feature.
- **Seat 3 at three players** wins 21% here and 22% in the earlier cap-2 run, against 36% under cap
  3. Two runs at 100 games is suggestive, not proof; the seat-1 deployment and first-mover edge is
  the likeliest cause, and cap 2 makes early aggression pay, which favours whoever acts first. A
  200-seed run on seats alone would settle it.
- **The bots over-pick the Raider** (77% of seats) because their hull rule sends every hand without
  Intercept or Survey to the railgun; the new Scout out-performs it (41% against 32%). Teaching the
  classifier to prefer the laser hulls is a bot-quality item, not a rules item.


## 10. Docking repairs to full (adopted)

Designer's request: simplify "+3 hull per dock" to full repair, or half if full proves too much.
Same seeds, current rules otherwise (`N_*` rows are +3, `K5` half, `K10` full):

| run | rules | fin | rounds | kills/g | hull dmg/g | heat dmg turns | Destroy done | Deliver done 
|---|---|---|---|---|---|---|---|---
| N_own3 | defaults | 100% | 39 | 2 | 40.1 | 1% | 82 | 247 
| K5_own3 | dockHullRepair=5 | 100% | 39 | 1.8 | 36.9 | 1% | 76 | 249 
| K10_own3 | dockHullRepair=10 | 100% | 39 | 1.8 | 36.9 | 1% | 76 | 249 
| N_own4 | defaults | 94% | 39 | 4.2 | 73.7 | 2% | 122 | 222 
| K5_own4 | dockHullRepair=5 | 95% | 39 | 3.4 | 66.7 | 2% | 113 | 230 
| K10_own4 | dockHullRepair=10 | 97% | 39 | 3.2 | 66.4 | 2% | 108 | 228

| run | seat-1 hull | wins | real victories | others (each) | kills/g | deaths/g | dealt/g | taken/g | fin | rounds |
|---|---|---|---|---|---|---|---|---|---|---|
| C2_hauler | sensor_array/shields,radiator,fuel_compressor,laser | 41% | 40% | 29% | 0.51 | 0.46 | 12.38 | 11.2 | 97% | 46 |
| K5_hauler | sensor_array/shields,radiator,fuel_compressor,laser | 33% | 31% | 33% | 0.35 | 0.61 | 10.58 | 12.88 | 98% | 43 |
| K10_hauler | sensor_array/shields,radiator,fuel_compressor,laser | 32% | 31% | 34% | 0.38 | 0.62 | 10.52 | 12.82 | 97% | 43 |
| C2_sh2la2 | sensor_array/shields,shields,laser,laser | 47% | 46% | 27% | 1.11 | 0.53 | 18.74 | 4.31 | 96% | 45 |
| K5_sh2la2 | sensor_array/shields,shields,laser,laser | 33% | 31% | 33% | 0.89 | 0.65 | 17.18 | 6.18 | 97% | 39 |
| K10_sh2la2 | sensor_array/shields,shields,laser,laser | 35% | 33% | 32% | 0.91 | 0.66 | 16.64 | 6.2 | 97% | 39 |
| C2_turtle | sensor_array/shields,shields,radiator,radiator | 48% | 18% | 26% | 0.0 | 0.07 | 0.0 | 7.86 | 68% | 59 |
| K10_turtle | sensor_array/shields,shields,radiator,radiator | 38% | 18% | 31% | 0.0 | 0.09 | 0.0 | 11.98 | 78% | 51 |
| C2_missiles3 | missiles/missiles,missiles,radiator,shields | 47% | 41% | 27% | 2.37 | 0.37 | 35.14 | 12.14 | 93% | 45 |
| K10_missiles3 | missiles/missiles,missiles,radiator,shields | 40% | 33% | 30% | 2.31 | 0.44 | 32.46 | 16.08 | 92% | 43 |

- **Full repair costs nothing in pacing** (100% / 39 rounds at three players either way) and takes
  the edge off four players: 4.2 → 3.2 kills a game.
- **It flattens the two hulls that were still ahead.** The Hauler falls from 40% to 31% of outright
  wins and shields×2 + lasers×2 from 46% to 33%, both to the seat-1 baseline. Those hulls won by
  grinding opponents down between docks; a docked opponent now comes back whole.
- **Half repair is indistinguishable from full** at three players (ships rarely dock below 5 hull),
  so the simpler rule wins. Adopted: *a dock restores the hull to full*; the knob is gone.

## 11. Regression suite

`yarn balance` (in `engine/`) now plays the matrix behind §4, §8 and §9 in one command: natural games
at 2, 3 and 4 players, then the four presets and sixteen extreme hulls forced on seat 1 against
normal opponents. It prints one table and flags `outlier` (a hull that wins outright 12+ points more
often than seat 1 does with its own hand), `stall` (20%+ of games at the cap), `slow` (a natural row
under 90% finished or over 50 rounds) and `glass` (dies 1.5+ times a game, informational), and exits
1 on any outlier, stall or slow row. `--quick` runs 40 games a row; `--rules=k=v` tries a change
first; `--output=dir` keeps the table. Run it after every rule change.


## 12. State of the game, end of 15 September 2026 (`yarn balance`)

Rules in force: Destroy worth 2; lasers ignore shields; shields hold 2 cubes and every absorbed point
is 2 heat; docking restores full hull; one-way lanes; Survey names a planet and needs two turns on
Ring 1 with sensors on; 3 points end the round, standings decide; any tile in any slot it fits.

100 games per row, seeds 5000+, turn cap 400, rules as in RULES.md.

## Natural play (bots choose hands and hulls)

| players | decided before cap | rounds (median) | kills / game | wins by seat | flags |
|---|---|---|---|---|---|
| 3 | 100% | 39 | 1.8 | 38% / 41% / 21% |  |
| 2 | 99% | 39 | 0.7 | 58% / 42% |  |
| 4 | 97% | 39 | 3.2 | 28% / 21% / 33% / 18% |  |

## Hulls forced on seat 1 against normal opponents (3 players; seat 1 wins outright 38% with its own hand)

| hull | wins | outright | others (each) | kills/g | deaths/g | dealt/g | taken/g | decided before cap | rounds | flags |
|---|---|---|---|---|---|---|---|---|---|---|
| Hauler (preset) | 32% | 31% | 34% | 0.38 | 0.62 | 10.52 | 12.82 | 97% | 43 |  |
| Raider (preset) | 36% | 33% | 32% | 0.73 | 0.48 | 15.38 | 11.74 | 96% | 40 |  |
| Scout (preset) | 34% | 34% | 33% | 0.47 | 0.71 | 11.2 | 12.84 | 99% | 39 |  |
| Hunter (preset) | 34% | 27% | 33% | 1.16 | 0.56 | 26.94 | 20.16 | 91% | 50 |  |
| shields×2 + lasers×2 | 35% | 33% | 32% | 0.91 | 0.66 | 16.64 | 6.2 | 97% | 39 |  |
| lasers×3 + shields | 28% | 28% | 36% | 0.59 | 0.89 | 12.84 | 13.6 | 98% | 39 |  |
| lasers×4 | 21% | 21% | 40% | 1.08 | 1.61 | 17.68 | 23.82 | 99% | 39 | glass |
| shields×2 + radiators×2 | 38% | 18% | 31% | 0 | 0.09 | 0 | 11.98 | 78% | 51 | stall |
| shields×4 | 28% | 14% | 36% | 0 | 0.18 | 0 | 5.02 | 86% | 50 |  |
| railgun + lasers×4 | 23% | 21% | 39% | 1.5 | 1.79 | 28.12 | 34 | 96% | 43 | glass |
| railgun + lasers×2 + radiators×2 | 25% | 20% | 38% | 1.62 | 1.98 | 29.18 | 36.88 | 94% | 40 | glass |
| railgun + missiles×2 + radiator + shields | 40% | 35% | 30% | 1.77 | 0.5 | 30.32 | 12.05 | 92% | 45 |  |
| missiles×3 + radiator + shields | 40% | 33% | 30% | 2.31 | 0.44 | 32.46 | 16.08 | 92% | 43 |  |
| missiles×5 | 17% | 13% | 42% | 1.67 | 1.57 | 35.1 | 35.82 | 92% | 45 | glass |
| railgun + missiles + lasers×2 + radiator | 21% | 15% | 40% | 1.31 | 1.42 | 37.53 | 45.1 | 89% | 45 |  |
| railgun + racks×2 + shields + radiator | 22% | 19% | 39% | 0.56 | 0.65 | 13.42 | 14.33 | 96% | 44 |  |
| railgun + compressors×4 | 23% | 20% | 39% | 0.31 | 1.47 | 15.16 | 36.2 | 95% | 44 |  |
| sensor + compressors×2 + shields + laser | 33% | 33% | 34% | 0.21 | 0.62 | 8.52 | 12.92 | 99% | 39 |  |
| railgun + radiators×4 | 15% | 12% | 43% | 0.49 | 1.64 | 16.76 | 37.54 | 95% | 39 | glass |
| railgun + missiles + shields×2 + radiator | 30% | 28% | 35% | 0.57 | 0.34 | 14.64 | 5.46 | 96% | 40 |  |

**Flags:** shields×2 + radiators×2: stall.

Reading: **no hull is an outlier.** Every forced hull wins outright between 12% and 35% against a
38% baseline; the presets sit at 27–34%. The one flag is the turtle (two shields, two radiators),
which cannot kill or be killed and drags 22% of its games to the cap while winning 18% outright: a
dull hull, not a strong one. Watch items: seat 3 at three players wins 21% for the third run in a row
(seat 1 deploys and moves first); four players see 3.2 kills a game; the Hunter is the weakest
preset (27%) because it fights everything without the fuel to choose its fights.


## 13. Deployment in reverse turn order (adopted) — and a correction on seats

The 21% seat-3 figure in §9 and §12 was an artefact: those runs reused the same 100 seeds, so the
same hands were dealt every time. On 200 fresh seeds (7000+) with seat 1 placing first the split is
**28 / 39 / 34** at three players and **26 / 30 / 20 / 24** at four: no strong seat effect, and if
anything seat 1 is behind. Reversing the placing order (last seat first, first seat last) on the same
200 seeds gives **32 / 36 / 32** at three players (range 10 → 4 points) and 30 / 28 / 22 / 19 at four
(range unchanged, seat 4 now lowest). Adopted for the flatter three-player table; the four-player
split should be re-read once the bots' deployment heuristic is revisited.

## Reproduce

```
cd engine
yarn sim --games=100 --bots=3 --maxTurns=400 --baseSeed=5000 --tiebreak --seats=bot-1=sensor_array/shields,shields,radiator,radiator --rules=tileLimits=false
yarn sim --games=100 --bots=3 --maxTurns=400 --baseSeed=5000 --tiebreak --seats=bot-1=sensor_array/shields,radiator,fuel_compressor,laser
```
