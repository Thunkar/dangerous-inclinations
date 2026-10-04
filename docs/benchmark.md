# Benchmark (2026-10-04)

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
| Table time assumes | 1 min per player-turn |

## By seat count

| seats | decided | rounds (median) | rounds (p75) | table time | kills/game | cards/game | points/game | burn | scoop | firing | lost | wins by seat | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 100% | 27 | 33 | 1h21 | 2.9 | 3.6 | 5.8 | 52% | 34% | 18% | 3% | 42% / 32% / 27% | seat spread 15% |
| 4 | 100% | 27 | 37 | 1h48 | 6.2 | 4.1 | 6.7 | 55% | 33% | 24% | 4% | 32% / 19% / 25% / 24% | a kill per seat per game |
| 5 | 100% | 32 | 43 | 2h40 | 10.9 | 4.6 | 7.7 | 57% | 32% | 29% | 6% | 19% / 22% / 17% / 16% / 27% | a kill per seat per game |
| 6 | 100% | 28 | 37 | 2h48 | 11.9 | 5.1 | 8.5 | 57% | 32% | 31% | 6% | 13% / 23% / 11% / 16% / 17% / 20% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.46 | 0.63 | 0.69 | 0.7 |
| Won by a seat not leading at round 10 | 70% of 120 | 71% of 119 | 78% of 119 | 86% of 119 |
| First card completed (median round) | 9 | 9 | 8 | 7 |
| Escort markers per game: placed / paid / released (carrier died, escort died) | 1.71 / 0.19 / 0.96 (0.33, 0.63) | 3.23 / 0.14 / 2.47 (0.86, 1.61) | 5.28 / 0.17 / 4.31 (1.76, 2.55) | 5.79 / 0.33 / 4.55 (1.95, 2.6) |
| Marked sales with the escort out of the well, per game | 0.75 | 0.81 | 0.86 | 0.88 |
| Rounds from marker to Escort paid (median) | 12 | 6 | 6 | 3 |
| Wrecks left per game | 2.87 | 6.18 | 10.92 | 11.94 |
| Wrecks salvaged | 27% | 25% | 22% | 25% |
| Piracy seizures per game (crate / data) | 0.12 / 0.49 | 0.29 / 1.11 | 0.49 / 2.04 | 0.63 / 2.08 |
| Sales at a station, per game | 2.86 | 3 | 3.14 | 3.4 |
| Of those, sale named by the player | 100% | 100% | 100% | 100% |
| Fuel pumps per game | 0.41 | 0.38 | 0.41 | 0.36 |
| Turns ending in a planet well | 45% | 39% | 32% | 33% |
| Turns ending in the black hole | 55% | 61% | 68% | 67% |
| Turns ending moored | 9% | 8% | 6% | 6% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 25% | 1.7 |
| Intercept + Escort/Piracy | 79 | 4% | 11% | 1.2 |
| Intercept + Escort/Tanker | 75 | 3% | 15% | 1.3 |
| Destroy + Escort/Tanker | 75 | 3% | 28% | 1.7 |
| Destroy + Survey/Tanker | 73 | 3% | 21% | 1.5 |
| Destroy + Salvage/Survey | 71 | 3% | 20% | 1.6 |
| Intercept + Piracy/Tanker | 71 | 3% | 23% | 1.5 |
| Intercept + Survey/Tanker | 70 | 3% | 24% | 1.6 |
| Intercept + Escort/Salvage | 69 | 3% | 29% | 1.7 |
| Destroy + Piracy/Survey | 68 | 3% | 22% | 1.8 |
| Intercept + Piracy/Salvage | 67 | 3% | 24% | 1.6 |
| Destroy + Escort/Piracy | 66 | 3% | 15% | 1.7 |
| Intercept + Escort/Survey | 63 | 3% | 17% | 1.2 |
| Destroy + Piracy/Salvage | 61 | 3% | 8% | 1.6 |
| Deliver + Piracy/Survey | 60 | 3% | 10% | 1.4 |
| Deliver + Escort/Salvage | 60 | 3% | 25% | 1.9 |
| Deliver + Salvage/Survey | 59 | 3% | 41% | 2 |
| Destroy + Piracy/Tanker | 58 | 3% | 22% | 1.8 |
| Intercept + Piracy/Survey | 57 | 3% | 11% | 1.2 |
| Destroy + Salvage/Tanker | 57 | 3% | 26% | 1.5 |
| Deliver + Piracy/Tanker | 53 | 2% | 25% | 1.7 |
| Deliver + Escort/Piracy | 52 | 2% | 6% | 1.4 |
| Intercept + Salvage/Survey | 52 | 2% | 23% | 1.6 |
| Deliver + Piracy/Salvage | 50 | 2% | 28% | 1.9 |
| Intercept + Salvage/Tanker | 49 | 2% | 33% | 1.9 |
| Deliver + Escort/Survey | 47 | 2% | 36% | 1.9 |
| Destroy + Escort/Survey | 45 | 2% | 4% | 1.3 |
| Deliver + Salvage/Tanker | 45 | 2% | 38% | 2 |
| Deliver + Escort/Tanker | 43 | 2% | 23% | 1.8 |
| Deliver + Survey/Tanker | 42 | 2% | 29% | 1.9 |
| Destroy + Salvage/Salvage | 31 | 1% | 52% | 2 |
| Destroy + Escort/Escort | 29 | 1% | 3% | 1.1 |
| Intercept + Survey/Survey | 28 | 1% | 32% | 1.9 |
| Intercept + Salvage/Salvage | 27 | 1% | 11% | 1.4 |
| Deliver + Survey/Survey | 25 | 1% | 48% | 2.2 |
| Deliver + Piracy/Piracy | 24 | 1% | 21% | 1.3 |
| Intercept + Tanker/Tanker | 23 | 1% | 22% | 1.5 |
| Destroy + Tanker/Tanker | 22 | 1% | 23% | 1.3 |
| Deliver + Escort/Escort | 21 | 1% | 14% | 1.2 |
| Deliver + Tanker/Tanker | 21 | 1% | 38% | 1.7 |
| Destroy + Piracy/Piracy | 21 | 1% | 5% | 1.3 |
| Intercept + Escort/Escort | 20 | 1% | 30% | 1.5 |
| Intercept + Piracy/Piracy | 20 | 1% | 5% | 1 |
| Destroy + Survey/Survey | 17 | 1% | 18% | 1.5 |
| Deliver + Salvage/Salvage | 15 | 1% | 47% | 2.3 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| fuel_compressor,ballistic_rack,ballistic_rack,shields,radiator | 350 | 16% | 20% |
| railgun,plasma_cannon,plasma_cannon,laser,radiator | 274 | 13% | 16% |
| sensor_array,missiles,missiles,radiator,shields | 264 | 12% | 25% |
| missiles,laser,laser,laser,radiator | 238 | 11% | 27% |
| sensor_array,laser,ballistic_rack,shields,radiator | 237 | 11% | 16% |
| fuel_compressor,missiles,missiles,radiator,shields | 179 | 8% | 35% |
| sensor_array,shields,shields,radiator,laser | 155 | 7% | 21% |
| disruptor,plasma_cannon,plasma_cannon,shields,radiator | 149 | 7% | 16% |
| sensor_array,shields,disruptor,radiator,plasma_cannon | 114 | 5% | 19% |
| railgun,laser,ballistic_rack,shields,radiator | 112 | 5% | 21% |
| fuel_compressor,disruptor,laser,plasma_cannon,radiator | 63 | 3% | 32% |
| fuel_compressor,shields,shields,radiator,laser | 25 | 1% | 48% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 67 | 17% |
| Destroy | 2314 | 773 | 33% | 64 | 16% |
| Intercept | 2285 | 770 | 34% | 58 | 16% |
| Survey | 1282 | 847 | 66% | 22 | 12% |
| Piracy | 1279 | 872 | 68% | 12 | 7% |
| Tanker | 1292 | 843 | 65% | 22 | 13% |
| Escort | 1327 | 893 | 67% | 11 | 6% |
| Salvage | 1300 | 865 | 67% | 17 | 13% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 93% | 3 | 15 / 10 / - | 8 | 67% | 17% |
| Destroy | target hit | 92% | 4 | - | 3 | 64% | 28% |
| Intercept | target scanned | 94% | 2 | 75 / 29 / - | 8 | 58% | 14% |
| Survey | dive made | 85% | 1 | 113 / 49 / - | 11 | 22% | 42% |
| Piracy | item taken | 59% | 8 | 104 / 24 / - | 9 | 12% | 16% |
| Tanker | in a planet's well with 5 fuel | 71% | 12 | 6 / 0 / 228 | 2 | 22% | 12% |
| Escort | marker placed | 88% | 6 | 113 / 74 / 50 | 6 | 11% | 39% |
| Salvage | box taken | 62% | 13 | 87 / 23 / - | 8 | 17% | 22% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard, a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. Escort's three are its own: the escort destroyed, the marked ship destroyed (either way the marker comes back) and the marked ship selling with the escort out of its well (the marker stays out). The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

