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
| 3 | 100% | 26 | 29 | 1h18 | 1.6 | 3.6 | 5.8 | 51% | 35% | 15% | 2% | 41% / 29% / 30% | none |
| 4 | 100% | 25 | 33 | 1h40 | 2.9 | 3.9 | 6.3 | 53% | 35% | 20% | 3% | 33% / 22% / 23% / 22% | none |
| 5 | 100% | 27 | 33 | 2h15 | 5 | 4.7 | 7.8 | 54% | 34% | 24% | 4% | 21% / 16% / 23% / 18% / 23% | a kill per seat per game |
| 6 | 100% | 26 | 30 | 2h36 | 6.6 | 5.4 | 8.9 | 54% | 34% | 27% | 4% | 19% / 15% / 18% / 23% / 13% / 12% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.58 | 0.39 | 0.62 | 0.7 |
| Won by a seat not leading at round 10 | 70% of 120 | 70% of 118 | 81% of 117 | 86% of 118 |
| First card completed (median round) | 9 | 9 | 9 | 7 |
| Escort markers per game: placed / paid / released (carrier died, escort died) | 1.36 / 0.33 / 0.52 (0.18, 0.34) | 2.13 / 0.18 / 1.08 (0.48, 0.6) | 3.33 / 0.23 / 2.07 (0.86, 1.21) | 4.68 / 0.35 / 3.03 (1.34, 1.69) |
| Marked sales with the escort out of the well, per game | 0.66 | 0.9 | 1.04 | 1.12 |
| Rounds from marker to Escort paid (median) | 7 | 5 | 7 | 6 |
| Wrecks left per game | 1.58 | 2.89 | 5.03 | 6.58 |
| Wrecks salvaged | 28% | 32% | 26% | 30% |
| Piracy seizures per game (crate / data) | 0.18 / 0.43 | 0.35 / 0.84 | 0.41 / 1.5 | 0.75 / 2.06 |
| Sales at a station, per game | 2.79 | 2.95 | 3.41 | 3.74 |
| Of those, sale named by the player | 100% | 100% | 100% | 100% |
| Fuel pumps per game | 0.31 | 0.34 | 0.38 | 0.28 |
| Turns ending in a planet well | 46% | 40% | 37% | 36% |
| Turns ending in the black hole | 54% | 60% | 63% | 64% |
| Turns ending moored | 9% | 8% | 7% | 7% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 14% | 1.5 |
| Intercept + Escort/Piracy | 79 | 4% | 24% | 1.7 |
| Intercept + Escort/Tanker | 75 | 3% | 17% | 1.5 |
| Destroy + Escort/Tanker | 75 | 3% | 23% | 1.4 |
| Destroy + Survey/Tanker | 73 | 3% | 26% | 1.5 |
| Destroy + Salvage/Survey | 71 | 3% | 13% | 1.4 |
| Intercept + Piracy/Tanker | 71 | 3% | 23% | 1.6 |
| Intercept + Survey/Tanker | 70 | 3% | 21% | 1.7 |
| Intercept + Escort/Salvage | 69 | 3% | 23% | 1.6 |
| Destroy + Piracy/Survey | 68 | 3% | 26% | 1.6 |
| Intercept + Piracy/Salvage | 67 | 3% | 22% | 1.7 |
| Destroy + Escort/Piracy | 66 | 3% | 33% | 1.8 |
| Intercept + Escort/Survey | 63 | 3% | 13% | 1.2 |
| Destroy + Piracy/Salvage | 61 | 3% | 26% | 1.4 |
| Deliver + Piracy/Survey | 60 | 3% | 23% | 1.7 |
| Deliver + Escort/Salvage | 60 | 3% | 18% | 1.7 |
| Deliver + Salvage/Survey | 59 | 3% | 34% | 1.8 |
| Destroy + Piracy/Tanker | 58 | 3% | 26% | 1.6 |
| Intercept + Piracy/Survey | 57 | 3% | 21% | 1.3 |
| Destroy + Salvage/Tanker | 57 | 3% | 28% | 1.7 |
| Deliver + Piracy/Tanker | 53 | 2% | 21% | 1.6 |
| Deliver + Escort/Piracy | 52 | 2% | 23% | 1.8 |
| Intercept + Salvage/Survey | 52 | 2% | 19% | 1.5 |
| Deliver + Piracy/Salvage | 50 | 2% | 20% | 1.7 |
| Intercept + Salvage/Tanker | 49 | 2% | 20% | 1.9 |
| Deliver + Escort/Survey | 47 | 2% | 30% | 1.7 |
| Destroy + Escort/Survey | 45 | 2% | 9% | 1.1 |
| Deliver + Salvage/Tanker | 45 | 2% | 27% | 1.7 |
| Deliver + Escort/Tanker | 43 | 2% | 28% | 1.7 |
| Deliver + Survey/Tanker | 42 | 2% | 50% | 2 |
| Destroy + Salvage/Salvage | 31 | 1% | 29% | 1.8 |
| Destroy + Escort/Escort | 29 | 1% | 14% | 1.4 |
| Intercept + Survey/Survey | 28 | 1% | 29% | 1.8 |
| Intercept + Salvage/Salvage | 27 | 1% | 15% | 1.4 |
| Deliver + Survey/Survey | 25 | 1% | 32% | 1.8 |
| Deliver + Piracy/Piracy | 24 | 1% | 4% | 1.1 |
| Intercept + Tanker/Tanker | 23 | 1% | 0% | 1.4 |
| Destroy + Tanker/Tanker | 22 | 1% | 0% | 1.1 |
| Deliver + Escort/Escort | 21 | 1% | 19% | 1.6 |
| Deliver + Tanker/Tanker | 21 | 1% | 57% | 2.5 |
| Destroy + Piracy/Piracy | 21 | 1% | 19% | 1.3 |
| Intercept + Escort/Escort | 20 | 1% | 10% | 1.3 |
| Intercept + Piracy/Piracy | 20 | 1% | 20% | 1.8 |
| Destroy + Survey/Survey | 17 | 1% | 6% | 1.6 |
| Deliver + Salvage/Salvage | 15 | 1% | 7% | 1.1 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| sensor_array,disruptor,disruptor,shields,radiator | 294 | 14% | 22% |
| missiles,laser,ballistic_rack,shields,radiator | 274 | 13% | 27% |
| fuel_compressor,shields,shields,radiator,plasma_cannon | 239 | 11% | 20% |
| railgun,missiles,laser,shields,radiator | 238 | 11% | 19% |
| sensor_array,missiles,missiles,radiator,shields | 197 | 9% | 20% |
| fuel_compressor,missiles,missiles,radiator,shields | 179 | 8% | 25% |
| sensor_array,laser,ballistic_rack,shields,radiator | 158 | 7% | 15% |
| disruptor,plasma_cannon,plasma_cannon,shields,radiator | 149 | 7% | 17% |
| sensor_array,shields,disruptor,radiator,plasma_cannon | 121 | 6% | 19% |
| railgun,laser,ballistic_rack,shields,radiator | 112 | 5% | 18% |
| fuel_compressor,disruptor,disruptor,radiator,radiator | 106 | 5% | 42% |
| fuel_compressor,shields,shields,radiator,laser | 93 | 4% | 28% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 66 | 17% |
| Destroy | 2314 | 773 | 33% | 56 | 17% |
| Intercept | 2285 | 770 | 34% | 64 | 16% |
| Survey | 1282 | 847 | 66% | 24 | 12% |
| Piracy | 1279 | 872 | 68% | 20 | 12% |
| Tanker | 1292 | 843 | 65% | 19 | 10% |
| Escort | 1327 | 893 | 67% | 15 | 8% |
| Salvage | 1300 | 865 | 67% | 13 | 8% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 94% | 3 | 12 / 11 / - | 8 | 66% | 20% |
| Destroy | target hit | 92% | 3 | - | 2 | 56% | 36% |
| Intercept | target scanned | 96% | 2 | 45 / 24 / - | 8 | 64% | 18% |
| Survey | dive made | 81% | 1 | 62 / 44 / - | 11 | 24% | 38% |
| Piracy | item taken | 62% | 7 | 55 / 25 / - | 9 | 20% | 23% |
| Tanker | in a planet's well with 5 fuel | 71% | 12 | 6 / 0 / 222 | 2 | 19% | 14% |
| Escort | marker placed | 88% | 5 | 59 / 44 / 57 | 6 | 15% | 50% |
| Salvage | box taken | 48% | 13 | 42 / 24 / - | 8 | 13% | 20% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard, a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. Escort's three are its own: the escort destroyed, the marked ship destroyed (either way the marker comes back) and the marked ship selling with the escort out of its well (the marker stays out). The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

