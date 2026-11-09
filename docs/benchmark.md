# Benchmark (2026-11-09)

120 games per seat count, seeds 20000+, bots choosing their own hands and hulls.

**Rules in force**

| rule | value |
|---|---|
| Points to win | 3 |
| Card values | Deliver 2, Destroy 2, Intercept 2, Survey 1, Piracy 1, Tanker 1, Escort 1, Salvage 1 |
| Hold | no limit; a pirate names the item it seizes |
| Stations | each buys one item from each player, once |
| The deal | 3 primaries keep 1; 3 secondaries keep any 2 from a shuffled pile of Survey, Piracy, Tanker, Escort, Salvage |
| Seats allowed | 2–6 |
| Drift | black hole 8/6/4/2/1, planet 6/4/2/1 (station on planet ring 2) |
| Starting hull | 10 |
| Heat track | 10; above it is hull damage, then shed 5 (+2 per radiator) and carry the rest |
| Shields | 1 or 2 energy, 1 point absorbed a cube, which is spent until that player's turn ends; its energy is heat every turn it is powered, and every point absorbed is heat too |
| Ballistic rack | rolls at up to 4 missiles a turn while powered; answering is 2 heat on the track, however many |
| Table time assumes | 1 min per player-turn |

## By seat count

| seats | decided | rounds (median) | rounds (p75) | table time | kills/game | cards/game | points/game | burn | scoop | firing | lost | wins by seat | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 100% | 26 | 32 | 1h18 | 2.3 | 3.6 | 5.8 | 52% | 34% | 17% | 3% | 44% / 29% / 27% | seat spread 18% |
| 4 | 100% | 27 | 33 | 1h48 | 5.2 | 4 | 6.5 | 55% | 33% | 24% | 4% | 30% / 21% / 23% / 26% | a kill per seat per game |
| 5 | 100% | 29 | 39 | 2h25 | 10.7 | 4.8 | 8.1 | 57% | 32% | 29% | 6% | 13% / 20% / 17% / 24% / 26% | a kill per seat per game |
| 6 | 100% | 27 | 39 | 2h42 | 11.6 | 5.2 | 8.6 | 56% | 32% | 30% | 6% | 20% / 8% / 23% / 13% / 23% / 14% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.5 | 0.61 | 0.73 | 0.76 |
| Won by a seat not leading at round 10 | 69% of 119 | 73% of 116 | 82% of 120 | 85% of 116 |
| First card completed (median round) | 9 | 9 | 8 | 8 |
| Escort markers per game: placed / paid / released (carrier died, escort died) | 1.74 / 0.24 / 0.9 (0.29, 0.61) | 3.22 / 0.26 / 2.17 (0.93, 1.23) | 6.28 / 0.23 / 5.13 (2.31, 2.82) | 6.8 / 0.42 / 5.27 (2.54, 2.73) |
| Marked sales with the escort out of the well, per game | 0.73 | 0.75 | 0.98 | 0.93 |
| Rounds from marker to Escort paid (median) | 12 | 5 | 3 | 4 |
| Wrecks left per game | 2.28 | 5.22 | 10.73 | 11.55 |
| Wrecks salvaged | 32% | 29% | 28% | 31% |
| Piracy seizures per game (crate / data) | 0.37 / 0.51 | 2.54 / 1.17 | 1.66 / 2.13 | 2.18 / 2.34 |
| Sales at a station, per game | 2.84 | 2.84 | 3.13 | 3.53 |
| Of those, sale named by the player | 100% | 100% | 100% | 100% |
| Fuel pumps per game | 0.41 | 0.33 | 0.32 | 0.44 |
| Turns ending in a planet well | 46% | 38% | 31% | 34% |
| Turns ending in the black hole | 54% | 62% | 69% | 66% |
| Turns ending moored | 10% | 8% | 6% | 6% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 16% | 1.6 |
| Intercept + Escort/Piracy | 79 | 4% | 13% | 1.1 |
| Intercept + Escort/Tanker | 75 | 3% | 21% | 1.5 |
| Destroy + Escort/Tanker | 75 | 3% | 28% | 1.5 |
| Destroy + Survey/Tanker | 73 | 3% | 30% | 1.6 |
| Destroy + Salvage/Survey | 71 | 3% | 20% | 1.7 |
| Intercept + Piracy/Tanker | 71 | 3% | 13% | 1.1 |
| Intercept + Survey/Tanker | 70 | 3% | 21% | 1.6 |
| Intercept + Escort/Salvage | 69 | 3% | 19% | 1.4 |
| Destroy + Piracy/Survey | 68 | 3% | 22% | 1.6 |
| Intercept + Piracy/Salvage | 67 | 3% | 15% | 1.5 |
| Destroy + Escort/Piracy | 66 | 3% | 15% | 1.7 |
| Intercept + Escort/Survey | 63 | 3% | 17% | 1.3 |
| Destroy + Piracy/Salvage | 61 | 3% | 16% | 1.6 |
| Deliver + Piracy/Survey | 60 | 3% | 17% | 1.6 |
| Deliver + Escort/Salvage | 60 | 3% | 27% | 2 |
| Deliver + Salvage/Survey | 59 | 3% | 32% | 1.9 |
| Destroy + Piracy/Tanker | 58 | 3% | 17% | 1.8 |
| Intercept + Piracy/Survey | 57 | 3% | 18% | 1.5 |
| Destroy + Salvage/Tanker | 57 | 3% | 44% | 1.8 |
| Deliver + Piracy/Tanker | 53 | 2% | 30% | 1.8 |
| Deliver + Escort/Piracy | 52 | 2% | 15% | 1.6 |
| Intercept + Salvage/Survey | 52 | 2% | 21% | 1.6 |
| Deliver + Piracy/Salvage | 50 | 2% | 32% | 2 |
| Intercept + Salvage/Tanker | 49 | 2% | 18% | 1.6 |
| Deliver + Escort/Survey | 47 | 2% | 47% | 2 |
| Destroy + Escort/Survey | 45 | 2% | 13% | 1.5 |
| Deliver + Salvage/Tanker | 45 | 2% | 33% | 1.9 |
| Deliver + Escort/Tanker | 43 | 2% | 30% | 1.6 |
| Deliver + Survey/Tanker | 42 | 2% | 36% | 1.8 |
| Destroy + Salvage/Salvage | 31 | 1% | 39% | 2.2 |
| Destroy + Escort/Escort | 29 | 1% | 10% | 1.4 |
| Intercept + Survey/Survey | 28 | 1% | 18% | 1.4 |
| Intercept + Salvage/Salvage | 27 | 1% | 7% | 1.4 |
| Deliver + Survey/Survey | 25 | 1% | 48% | 2 |
| Deliver + Piracy/Piracy | 24 | 1% | 17% | 1 |
| Intercept + Tanker/Tanker | 23 | 1% | 13% | 1.7 |
| Destroy + Tanker/Tanker | 22 | 1% | 27% | 1.6 |
| Deliver + Escort/Escort | 21 | 1% | 33% | 1.8 |
| Deliver + Tanker/Tanker | 21 | 1% | 24% | 1.5 |
| Destroy + Piracy/Piracy | 21 | 1% | 10% | 1.8 |
| Intercept + Escort/Escort | 20 | 1% | 10% | 1.2 |
| Intercept + Piracy/Piracy | 20 | 1% | 10% | 1.6 |
| Destroy + Survey/Survey | 17 | 1% | 18% | 1.6 |
| Deliver + Salvage/Salvage | 15 | 1% | 13% | 1.9 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| fuel_compressor,ballistic_rack,ballistic_rack,shields,radiator | 350 | 16% | 27% |
| railgun,plasma_cannon,plasma_cannon,laser,radiator | 274 | 13% | 17% |
| sensor_array,missiles,missiles,radiator,shields | 264 | 12% | 17% |
| missiles,laser,laser,laser,radiator | 238 | 11% | 27% |
| sensor_array,laser,ballistic_rack,shields,radiator | 237 | 11% | 16% |
| fuel_compressor,missiles,missiles,radiator,shields | 179 | 8% | 29% |
| sensor_array,shields,shields,radiator,laser | 155 | 7% | 19% |
| disruptor,plasma_cannon,plasma_cannon,shields,radiator | 149 | 7% | 20% |
| sensor_array,shields,disruptor,radiator,plasma_cannon | 114 | 5% | 12% |
| railgun,laser,ballistic_rack,shields,radiator | 112 | 5% | 28% |
| fuel_compressor,disruptor,laser,plasma_cannon,radiator | 63 | 3% | 32% |
| fuel_compressor,shields,shields,radiator,laser | 25 | 1% | 48% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 68 | 19% |
| Destroy | 2314 | 773 | 33% | 65 | 18% |
| Intercept | 2285 | 770 | 34% | 58 | 13% |
| Survey | 1282 | 847 | 66% | 22 | 12% |
| Piracy | 1279 | 872 | 68% | 12 | 8% |
| Tanker | 1292 | 843 | 65% | 21 | 12% |
| Escort | 1327 | 893 | 67% | 15 | 8% |
| Salvage | 1300 | 865 | 67% | 17 | 11% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 93% | 3 | 14 / 11 / - | 8 | 68% | 15% |
| Destroy | target hit | 90% | 3 | - | 3 | 65% | 25% |
| Intercept | target scanned | 95% | 2 | 68 / 30 / - | 8 | 58% | 15% |
| Survey | dive made | 84% | 1 | 106 / 49 / - | 11 | 22% | 40% |
| Piracy | item taken | 68% | 8 | 97 / 125 / - | 9 | 12% | 20% |
| Tanker | in a planet's well with 5 fuel | 73% | 12 | 5 / 0 / 226 | 2 | 21% | 11% |
| Escort | marker placed | 94% | 4 | 106 / 87 / 49 | 5 | 15% | 46% |
| Salvage | box taken | 65% | 12 | 89 / 30 / - | 8 | 17% | 28% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard, a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. Escort's three are its own: the escort destroyed, the marked ship destroyed (either way the marker comes back) and the marked ship selling with the escort out of its well (the marker stays out). The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

