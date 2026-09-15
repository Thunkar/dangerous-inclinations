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

## Reproduce

```
cd engine
yarn sim --games=100 --bots=3 --maxTurns=400 --baseSeed=5000 --tiebreak --seats=bot-1=sensor_array/shields,shields,radiator,radiator --rules=tileLimits=false
yarn sim --games=100 --bots=3 --maxTurns=400 --baseSeed=5000 --tiebreak --seats=bot-1=sensor_array/shields,radiator,fuel_compressor,laser
```
