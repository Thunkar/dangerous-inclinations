# Benchmark (2026-10-07)

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
| Shields | 1 or 2 energy, 1 point absorbed a cube, which comes off the subsystem; its energy is heat every turn it is powered, and every point absorbed is heat too |
| Ballistic rack | rolls at up to 4 missiles a turn while powered; answering is 2 heat on the track, however many |
| Table time assumes | 1 min per player-turn |

## By seat count

| seats | decided | rounds (median) | rounds (p75) | table time | kills/game | cards/game | points/game | burn | scoop | firing | lost | wins by seat | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 100% | 27 | 33 | 1h21 | 2.9 | 3.6 | 5.9 | 52% | 34% | 18% | 3% | 40% / 33% / 27% | none |
| 4 | 100% | 27 | 38 | 1h48 | 6.2 | 4.2 | 6.9 | 55% | 33% | 23% | 4% | 32% / 18% / 26% / 24% | a kill per seat per game |
| 5 | 100% | 31 | 40 | 2h35 | 10.5 | 4.6 | 7.7 | 57% | 32% | 29% | 6% | 19% / 25% / 16% / 15% / 25% | a kill per seat per game |
| 6 | 100% | 27 | 39 | 2h42 | 12.3 | 5.3 | 8.8 | 57% | 32% | 30% | 6% | 17% / 16% / 11% / 19% / 23% / 15% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.47 | 0.66 | 0.69 | 0.76 |
| Won by a seat not leading at round 10 | 70% of 120 | 71% of 119 | 78% of 118 | 86% of 119 |
| First card completed (median round) | 9 | 9 | 7 | 7 |
| Escort markers per game: placed / paid / released (carrier died, escort died) | 1.69 / 0.19 / 0.96 (0.3, 0.66) | 3.35 / 0.19 / 2.51 (0.9, 1.61) | 5.18 / 0.17 / 4.19 (1.7, 2.49) | 6.01 / 0.35 / 4.81 (2.01, 2.8) |
| Marked sales with the escort out of the well, per game | 0.73 | 0.85 | 0.89 | 0.89 |
| Rounds from marker to Escort paid (median) | 12 | 6 | 6 | 5 |
| Wrecks left per game | 2.86 | 6.17 | 10.46 | 12.31 |
| Wrecks salvaged | 28% | 25% | 22% | 25% |
| Piracy seizures per game (crate / data) | 0.12 / 0.48 | 0.3 / 1.13 | 0.49 / 1.98 | 0.61 / 2.13 |
| Sales at a station, per game | 2.88 | 3.04 | 3.14 | 3.5 |
| Of those, sale named by the player | 100% | 100% | 100% | 100% |
| Fuel pumps per game | 0.43 | 0.39 | 0.42 | 0.35 |
| Turns ending in a planet well | 45% | 40% | 32% | 34% |
| Turns ending in the black hole | 55% | 60% | 68% | 66% |
| Turns ending moored | 9% | 8% | 6% | 6% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 22% | 1.7 |
| Intercept + Escort/Piracy | 79 | 4% | 10% | 1.2 |
| Intercept + Escort/Tanker | 75 | 3% | 20% | 1.4 |
| Destroy + Escort/Tanker | 75 | 3% | 27% | 1.8 |
| Destroy + Survey/Tanker | 73 | 3% | 19% | 1.6 |
| Destroy + Salvage/Survey | 71 | 3% | 15% | 1.6 |
| Intercept + Piracy/Tanker | 71 | 3% | 24% | 1.5 |
| Intercept + Survey/Tanker | 70 | 3% | 23% | 1.5 |
| Intercept + Escort/Salvage | 69 | 3% | 23% | 1.6 |
| Destroy + Piracy/Survey | 68 | 3% | 22% | 1.8 |
| Intercept + Piracy/Salvage | 67 | 3% | 19% | 1.6 |
| Destroy + Escort/Piracy | 66 | 3% | 15% | 1.7 |
| Intercept + Escort/Survey | 63 | 3% | 14% | 1.1 |
| Destroy + Piracy/Salvage | 61 | 3% | 13% | 1.8 |
| Deliver + Piracy/Survey | 60 | 3% | 12% | 1.5 |
| Deliver + Escort/Salvage | 60 | 3% | 25% | 1.8 |
| Deliver + Salvage/Survey | 59 | 3% | 41% | 2 |
| Destroy + Piracy/Tanker | 58 | 3% | 28% | 1.8 |
| Intercept + Piracy/Survey | 57 | 3% | 11% | 1.3 |
| Destroy + Salvage/Tanker | 57 | 3% | 33% | 1.7 |
| Deliver + Piracy/Tanker | 53 | 2% | 25% | 1.7 |
| Deliver + Escort/Piracy | 52 | 2% | 12% | 1.5 |
| Intercept + Salvage/Survey | 52 | 2% | 23% | 1.6 |
| Deliver + Piracy/Salvage | 50 | 2% | 30% | 1.9 |
| Intercept + Salvage/Tanker | 49 | 2% | 27% | 1.8 |
| Deliver + Escort/Survey | 47 | 2% | 34% | 1.9 |
| Destroy + Escort/Survey | 45 | 2% | 2% | 1.3 |
| Deliver + Salvage/Tanker | 45 | 2% | 40% | 2 |
| Deliver + Escort/Tanker | 43 | 2% | 21% | 1.8 |
| Deliver + Survey/Tanker | 42 | 2% | 36% | 1.9 |
| Destroy + Salvage/Salvage | 31 | 1% | 52% | 2 |
| Destroy + Escort/Escort | 29 | 1% | 7% | 1.1 |
| Intercept + Survey/Survey | 28 | 1% | 36% | 1.9 |
| Intercept + Salvage/Salvage | 27 | 1% | 19% | 1.5 |
| Deliver + Survey/Survey | 25 | 1% | 40% | 2.2 |
| Deliver + Piracy/Piracy | 24 | 1% | 21% | 1.4 |
| Intercept + Tanker/Tanker | 23 | 1% | 22% | 1.6 |
| Destroy + Tanker/Tanker | 22 | 1% | 18% | 1.2 |
| Deliver + Escort/Escort | 21 | 1% | 10% | 1.2 |
| Deliver + Tanker/Tanker | 21 | 1% | 43% | 1.7 |
| Destroy + Piracy/Piracy | 21 | 1% | 5% | 1.3 |
| Intercept + Escort/Escort | 20 | 1% | 30% | 1.5 |
| Intercept + Piracy/Piracy | 20 | 1% | 10% | 1.2 |
| Destroy + Survey/Survey | 17 | 1% | 12% | 1.6 |
| Deliver + Salvage/Salvage | 15 | 1% | 47% | 2.1 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| fuel_compressor,ballistic_rack,ballistic_rack,shields,radiator | 350 | 16% | 21% |
| railgun,plasma_cannon,plasma_cannon,laser,radiator | 274 | 13% | 18% |
| sensor_array,missiles,missiles,radiator,shields | 264 | 12% | 22% |
| missiles,laser,laser,laser,radiator | 238 | 11% | 26% |
| sensor_array,laser,ballistic_rack,shields,radiator | 237 | 11% | 16% |
| fuel_compressor,missiles,missiles,radiator,shields | 179 | 8% | 36% |
| sensor_array,shields,shields,radiator,laser | 155 | 7% | 21% |
| disruptor,plasma_cannon,plasma_cannon,shields,radiator | 149 | 7% | 15% |
| sensor_array,shields,disruptor,radiator,plasma_cannon | 114 | 5% | 21% |
| railgun,laser,ballistic_rack,shields,radiator | 112 | 5% | 18% |
| fuel_compressor,disruptor,laser,plasma_cannon,radiator | 63 | 3% | 38% |
| fuel_compressor,shields,shields,radiator,laser | 25 | 1% | 40% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 68 | 18% |
| Destroy | 2314 | 773 | 33% | 66 | 16% |
| Intercept | 2285 | 770 | 34% | 59 | 16% |
| Survey | 1282 | 847 | 66% | 23 | 12% |
| Piracy | 1279 | 872 | 68% | 12 | 8% |
| Tanker | 1292 | 843 | 65% | 23 | 14% |
| Escort | 1327 | 893 | 67% | 12 | 6% |
| Salvage | 1300 | 865 | 67% | 17 | 12% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 94% | 3 | 15 / 10 / - | 8 | 68% | 17% |
| Destroy | target hit | 92% | 4 | - | 3 | 66% | 27% |
| Intercept | target scanned | 94% | 2 | 74 / 28 / - | 8 | 59% | 15% |
| Survey | dive made | 85% | 1 | 114 / 49 / - | 11 | 23% | 39% |
| Piracy | item taken | 61% | 8 | 100 / 23 / - | 9 | 12% | 18% |
| Tanker | in a planet's well with 5 fuel | 72% | 12 | 5 / 0 / 229 | 2 | 23% | 12% |
| Escort | marker placed | 89% | 6 | 115 / 74 / 51 | 6 | 12% | 39% |
| Salvage | box taken | 62% | 13 | 86 / 24 / - | 8 | 17% | 22% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard, a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. Escort's three are its own: the escort destroyed, the marked ship destroyed (either way the marker comes back) and the marked ship selling with the escort out of its well (the marker stays out). The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

