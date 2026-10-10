# Benchmark (2026-10-10)

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
| 3 | 100% | 26 | 32 | 1h18 | 2.6 | 3.6 | 5.9 | 52% | 34% | 17% | 3% | 43% / 28% / 28% | seat spread 15% |
| 4 | 100% | 27 | 33 | 1h48 | 5.4 | 4 | 6.5 | 55% | 33% | 24% | 4% | 28% / 21% / 26% / 25% | a kill per seat per game |
| 5 | 100% | 29 | 39 | 2h25 | 10 | 4.7 | 7.8 | 57% | 33% | 28% | 6% | 10% / 22% / 22% / 22% / 25% | a kill per seat per game; seat spread 15% |
| 6 | 100% | 27 | 37 | 2h42 | 10.9 | 5.2 | 8.6 | 56% | 32% | 31% | 6% | 20% / 12% / 22% / 18% / 18% / 11% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.51 | 0.58 | 0.71 | 0.75 |
| Won by a seat not leading at round 10 | 70% of 118 | 71% of 116 | 80% of 120 | 87% of 117 |
| First card completed (median round) | 9 | 9 | 8 | 7 |
| Escort markers per game: placed / paid / released (carrier died, escort died) | 1.81 / 0.23 / 0.98 (0.31, 0.68) | 3.24 / 0.23 / 2.22 (0.93, 1.29) | 5.98 / 0.21 / 4.81 (2.08, 2.73) | 6.48 / 0.39 / 5.03 (2.41, 2.62) |
| Marked sales with the escort out of the well, per game | 0.79 | 0.78 | 0.97 | 0.9 |
| Rounds from marker to Escort paid (median) | 12 | 4 | 3 | 4 |
| Wrecks left per game | 2.55 | 5.38 | 9.98 | 10.89 |
| Wrecks salvaged | 29% | 31% | 28% | 32% |
| Piracy seizures per game (crate / data) | 0.4 / 0.5 | 2.28 / 1.17 | 1.99 / 1.95 | 2.74 / 2.23 |
| Sales at a station, per game | 2.89 | 2.82 | 3.04 | 3.42 |
| Of those, sale named by the player | 100% | 100% | 100% | 100% |
| Fuel pumps per game | 0.41 | 0.31 | 0.33 | 0.33 |
| Turns ending in a planet well | 46% | 38% | 32% | 34% |
| Turns ending in the black hole | 54% | 63% | 68% | 66% |
| Turns ending moored | 10% | 8% | 6% | 6% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 15% | 1.7 |
| Intercept + Escort/Piracy | 79 | 4% | 14% | 1.3 |
| Intercept + Escort/Tanker | 75 | 3% | 19% | 1.6 |
| Destroy + Escort/Tanker | 75 | 3% | 28% | 1.5 |
| Destroy + Survey/Tanker | 73 | 3% | 26% | 1.7 |
| Destroy + Salvage/Survey | 71 | 3% | 23% | 1.7 |
| Intercept + Piracy/Tanker | 71 | 3% | 15% | 1.3 |
| Intercept + Survey/Tanker | 70 | 3% | 19% | 1.4 |
| Intercept + Escort/Salvage | 69 | 3% | 17% | 1.4 |
| Destroy + Piracy/Survey | 68 | 3% | 22% | 1.5 |
| Intercept + Piracy/Salvage | 67 | 3% | 15% | 1.4 |
| Destroy + Escort/Piracy | 66 | 3% | 20% | 1.9 |
| Intercept + Escort/Survey | 63 | 3% | 16% | 1.2 |
| Destroy + Piracy/Salvage | 61 | 3% | 18% | 1.8 |
| Deliver + Piracy/Survey | 60 | 3% | 17% | 1.6 |
| Deliver + Escort/Salvage | 60 | 3% | 28% | 2.1 |
| Deliver + Salvage/Survey | 59 | 3% | 36% | 2 |
| Destroy + Piracy/Tanker | 58 | 3% | 24% | 1.8 |
| Intercept + Piracy/Survey | 57 | 3% | 19% | 1.4 |
| Destroy + Salvage/Tanker | 57 | 3% | 39% | 1.8 |
| Deliver + Piracy/Tanker | 53 | 2% | 28% | 1.8 |
| Deliver + Escort/Piracy | 52 | 2% | 19% | 1.6 |
| Intercept + Salvage/Survey | 52 | 2% | 21% | 1.5 |
| Deliver + Piracy/Salvage | 50 | 2% | 30% | 2.1 |
| Intercept + Salvage/Tanker | 49 | 2% | 22% | 1.7 |
| Deliver + Escort/Survey | 47 | 2% | 32% | 1.7 |
| Destroy + Escort/Survey | 45 | 2% | 22% | 1.5 |
| Deliver + Salvage/Tanker | 45 | 2% | 33% | 1.8 |
| Deliver + Escort/Tanker | 43 | 2% | 33% | 1.7 |
| Deliver + Survey/Tanker | 42 | 2% | 38% | 2 |
| Destroy + Salvage/Salvage | 31 | 1% | 39% | 2.1 |
| Destroy + Escort/Escort | 29 | 1% | 7% | 1.2 |
| Intercept + Survey/Survey | 28 | 1% | 18% | 1.3 |
| Intercept + Salvage/Salvage | 27 | 1% | 11% | 1.3 |
| Deliver + Survey/Survey | 25 | 1% | 36% | 1.9 |
| Deliver + Piracy/Piracy | 24 | 1% | 13% | 0.9 |
| Intercept + Tanker/Tanker | 23 | 1% | 9% | 1.3 |
| Destroy + Tanker/Tanker | 22 | 1% | 36% | 1.6 |
| Deliver + Escort/Escort | 21 | 1% | 29% | 1.7 |
| Deliver + Tanker/Tanker | 21 | 1% | 24% | 1.4 |
| Destroy + Piracy/Piracy | 21 | 1% | 5% | 1.3 |
| Intercept + Escort/Escort | 20 | 1% | 10% | 1.1 |
| Intercept + Piracy/Piracy | 20 | 1% | 0% | 1.3 |
| Destroy + Survey/Survey | 17 | 1% | 18% | 1.6 |
| Deliver + Salvage/Salvage | 15 | 1% | 27% | 2.2 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| fuel_compressor,ballistic_rack,ballistic_rack,shields,radiator | 350 | 16% | 25% |
| railgun,plasma_cannon,plasma_cannon,laser,radiator | 274 | 13% | 20% |
| sensor_array,missiles,missiles,radiator,shields | 264 | 12% | 18% |
| missiles,laser,laser,laser,radiator | 238 | 11% | 26% |
| sensor_array,laser,ballistic_rack,shields,radiator | 237 | 11% | 16% |
| fuel_compressor,missiles,missiles,radiator,shields | 179 | 8% | 32% |
| sensor_array,shields,shields,radiator,laser | 155 | 7% | 19% |
| disruptor,plasma_cannon,plasma_cannon,shields,radiator | 149 | 7% | 22% |
| sensor_array,shields,disruptor,radiator,plasma_cannon | 114 | 5% | 11% |
| railgun,laser,ballistic_rack,shields,radiator | 112 | 5% | 27% |
| fuel_compressor,disruptor,laser,plasma_cannon,radiator | 63 | 3% | 33% |
| fuel_compressor,shields,shields,radiator,laser | 25 | 1% | 36% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 68 | 18% |
| Destroy | 2314 | 773 | 33% | 66 | 19% |
| Intercept | 2285 | 770 | 34% | 55 | 13% |
| Survey | 1282 | 847 | 66% | 22 | 12% |
| Piracy | 1279 | 872 | 68% | 13 | 7% |
| Tanker | 1292 | 843 | 65% | 19 | 12% |
| Escort | 1327 | 893 | 67% | 14 | 7% |
| Salvage | 1300 | 865 | 67% | 18 | 12% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 94% | 3 | 13 / 11 / - | 8 | 68% | 17% |
| Destroy | target hit | 90% | 3 | - | 3 | 66% | 24% |
| Intercept | target scanned | 94% | 2 | 68 / 31 / - | 8 | 55% | 15% |
| Survey | dive made | 85% | 1 | 106 / 45 / - | 11 | 22% | 39% |
| Piracy | item taken | 70% | 8 | 89 / 136 / - | 10 | 13% | 20% |
| Tanker | in a planet's well with 5 fuel | 71% | 12 | 6 / 0 / 232 | 2 | 19% | 11% |
| Escort | marker placed | 93% | 4 | 105 / 82 / 49 | 4 | 14% | 46% |
| Salvage | box taken | 67% | 12 | 83 / 27 / - | 8 | 18% | 30% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard, a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. Escort's three are its own: the escort destroyed, the marked ship destroyed (either way the marker comes back) and the marked ship selling with the escort out of its well (the marker stays out). The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

