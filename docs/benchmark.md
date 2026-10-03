# Benchmark (2026-10-03)

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
| Shields | 2 energy a point absorbed, which comes off the subsystem; its energy is heat every turn it is powered, and absorbing makes none |
| Table time assumes | 1 min per player-turn |

## By seat count

| seats | decided | rounds (median) | rounds (p75) | table time | kills/game | cards/game | points/game | burn | scoop | firing | lost | wins by seat | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 100% | 27 | 35 | 1h21 | 3 | 3.6 | 5.9 | 53% | 34% | 18% | 3% | 33% / 38% / 28% | a kill per seat per game |
| 4 | 100% | 27 | 33 | 1h48 | 5.9 | 4 | 6.5 | 55% | 34% | 24% | 5% | 28% / 23% / 20% / 29% | a kill per seat per game |
| 5 | 100% | 27 | 38 | 2h15 | 10.3 | 4.5 | 7.5 | 57% | 32% | 29% | 6% | 21% / 23% / 17% / 18% / 22% | a kill per seat per game |
| 6 | 100% | 27 | 38 | 2h42 | 12.8 | 5 | 8.3 | 57% | 32% | 31% | 7% | 14% / 18% / 28% / 13% / 11% / 15% | a kill per seat per game; seat spread 18% |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.53 | 0.66 | 0.61 | 0.69 |
| Won by a seat not leading at round 10 | 72% of 119 | 77% of 119 | 83% of 117 | 84% of 120 |
| First card completed (median round) | 9 | 9 | 8 | 7 |
| Escort markers per game: placed / paid / released (carrier died, escort died) | 1.66 / 0.23 / 0.94 (0.28, 0.66) | 2.89 / 0.19 / 2.05 (0.76, 1.29) | 5.12 / 0.24 / 4.03 (1.62, 2.42) | 6.17 / 0.26 / 4.88 (2.18, 2.69) |
| Marked sales with the escort out of the well, per game | 0.63 | 0.81 | 0.78 | 0.83 |
| Rounds from marker to Escort paid (median) | 6 | 6 | 5 | 5 |
| Wrecks left per game | 2.97 | 5.9 | 10.25 | 12.75 |
| Wrecks salvaged | 28% | 24% | 22% | 23% |
| Piracy seizures per game (crate / data) | 0.13 / 0.45 | 0.24 / 1.01 | 0.37 / 1.89 | 0.74 / 2.43 |
| Sales at a station, per game | 2.7 | 2.95 | 2.94 | 3.28 |
| Of those, sale named by the player | 100% | 100% | 99% | 100% |
| Fuel pumps per game | 0.39 | 0.38 | 0.32 | 0.33 |
| Turns ending in a planet well | 45% | 38% | 31% | 32% |
| Turns ending in the black hole | 55% | 62% | 69% | 68% |
| Turns ending moored | 9% | 7% | 6% | 6% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 27% | 1.7 |
| Intercept + Escort/Piracy | 79 | 4% | 10% | 1.1 |
| Intercept + Escort/Tanker | 75 | 3% | 19% | 1.4 |
| Destroy + Escort/Tanker | 75 | 3% | 28% | 1.8 |
| Destroy + Survey/Tanker | 73 | 3% | 27% | 1.6 |
| Destroy + Salvage/Survey | 71 | 3% | 15% | 1.6 |
| Intercept + Piracy/Tanker | 71 | 3% | 14% | 1.3 |
| Intercept + Survey/Tanker | 70 | 3% | 26% | 1.5 |
| Intercept + Escort/Salvage | 69 | 3% | 22% | 1.6 |
| Destroy + Piracy/Survey | 68 | 3% | 21% | 1.6 |
| Intercept + Piracy/Salvage | 67 | 3% | 18% | 1.5 |
| Destroy + Escort/Piracy | 66 | 3% | 17% | 1.7 |
| Intercept + Escort/Survey | 63 | 3% | 11% | 1.1 |
| Destroy + Piracy/Salvage | 61 | 3% | 16% | 1.8 |
| Deliver + Piracy/Survey | 60 | 3% | 23% | 1.6 |
| Deliver + Escort/Salvage | 60 | 3% | 20% | 1.7 |
| Deliver + Salvage/Survey | 59 | 3% | 27% | 1.8 |
| Destroy + Piracy/Tanker | 58 | 3% | 33% | 2 |
| Intercept + Piracy/Survey | 57 | 3% | 16% | 1.1 |
| Destroy + Salvage/Tanker | 57 | 3% | 33% | 1.7 |
| Deliver + Piracy/Tanker | 53 | 2% | 21% | 1.6 |
| Deliver + Escort/Piracy | 52 | 2% | 10% | 1.4 |
| Intercept + Salvage/Survey | 52 | 2% | 23% | 1.5 |
| Deliver + Piracy/Salvage | 50 | 2% | 30% | 1.9 |
| Intercept + Salvage/Tanker | 49 | 2% | 31% | 1.7 |
| Deliver + Escort/Survey | 47 | 2% | 38% | 2 |
| Destroy + Escort/Survey | 45 | 2% | 29% | 1.6 |
| Deliver + Salvage/Tanker | 45 | 2% | 40% | 2.1 |
| Deliver + Escort/Tanker | 43 | 2% | 35% | 1.8 |
| Deliver + Survey/Tanker | 42 | 2% | 33% | 1.9 |
| Destroy + Salvage/Salvage | 31 | 1% | 35% | 1.6 |
| Destroy + Escort/Escort | 29 | 1% | 10% | 1.3 |
| Intercept + Survey/Survey | 28 | 1% | 21% | 1.7 |
| Intercept + Salvage/Salvage | 27 | 1% | 15% | 1.3 |
| Deliver + Survey/Survey | 25 | 1% | 36% | 1.9 |
| Deliver + Piracy/Piracy | 24 | 1% | 4% | 1.1 |
| Intercept + Tanker/Tanker | 23 | 1% | 4% | 1.2 |
| Destroy + Tanker/Tanker | 22 | 1% | 14% | 1.2 |
| Deliver + Escort/Escort | 21 | 1% | 19% | 1.5 |
| Deliver + Tanker/Tanker | 21 | 1% | 43% | 1.7 |
| Destroy + Piracy/Piracy | 21 | 1% | 10% | 1.7 |
| Intercept + Escort/Escort | 20 | 1% | 20% | 1.2 |
| Intercept + Piracy/Piracy | 20 | 1% | 5% | 1.2 |
| Destroy + Survey/Survey | 17 | 1% | 6% | 1.4 |
| Deliver + Salvage/Salvage | 15 | 1% | 27% | 1.5 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| fuel_compressor,ballistic_rack,ballistic_rack,shields,radiator | 350 | 16% | 24% |
| railgun,plasma_cannon,plasma_cannon,laser,radiator | 274 | 13% | 20% |
| sensor_array,missiles,missiles,radiator,shields | 264 | 12% | 22% |
| missiles,laser,laser,laser,radiator | 238 | 11% | 26% |
| sensor_array,laser,ballistic_rack,shields,radiator | 237 | 11% | 14% |
| fuel_compressor,missiles,missiles,radiator,shields | 179 | 8% | 28% |
| sensor_array,shields,shields,radiator,laser | 155 | 7% | 21% |
| disruptor,plasma_cannon,plasma_cannon,shields,radiator | 149 | 7% | 25% |
| sensor_array,shields,disruptor,radiator,plasma_cannon | 114 | 5% | 11% |
| railgun,laser,ballistic_rack,shields,radiator | 112 | 5% | 21% |
| fuel_compressor,disruptor,laser,plasma_cannon,radiator | 63 | 3% | 37% |
| fuel_compressor,shields,shields,radiator,laser | 25 | 1% | 36% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 67 | 17% |
| Destroy | 2314 | 773 | 33% | 66 | 19% |
| Intercept | 2285 | 770 | 34% | 55 | 14% |
| Survey | 1282 | 847 | 66% | 22 | 12% |
| Piracy | 1279 | 872 | 68% | 11 | 7% |
| Tanker | 1292 | 843 | 65% | 20 | 14% |
| Escort | 1327 | 893 | 67% | 12 | 7% |
| Salvage | 1300 | 865 | 67% | 16 | 10% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 92% | 3 | 15 / 10 / - | 8 | 67% | 17% |
| Destroy | target hit | 92% | 4 | - | 3 | 66% | 26% |
| Intercept | target scanned | 95% | 2 | 85 / 31 / - | 8 | 55% | 18% |
| Survey | dive made | 84% | 1 | 110 / 47 / - | 11 | 22% | 39% |
| Piracy | item taken | 59% | 7 | 108 / 24 / - | 8 | 11% | 17% |
| Tanker | in a planet's well with 5 fuel | 68% | 12 | 7 / 0 / 236 | 2 | 20% | 10% |
| Escort | marker placed | 90% | 6 | 106 / 73 / 46 | 5 | 12% | 40% |
| Salvage | box taken | 63% | 14 | 78 / 24 / - | 8 | 16% | 23% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard, a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. Escort's three are its own: the escort destroyed, the marked ship destroyed (either way the marker comes back) and the marked ship selling with the escort out of its well (the marker stays out). The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

