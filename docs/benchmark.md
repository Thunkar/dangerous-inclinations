# Benchmark (2026-10-02)

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
| 3 | 100% | 27 | 33 | 1h21 | 1.9 | 3.6 | 5.8 | 51% | 35% | 16% | 2% | 36% / 32% / 33% | none |
| 4 | 100% | 26 | 33 | 1h44 | 3.5 | 4.1 | 6.8 | 53% | 34% | 21% | 3% | 33% / 22% / 15% / 30% | seat spread 18% |
| 5 | 100% | 29 | 39 | 2h25 | 8 | 5 | 8.2 | 54% | 34% | 26% | 4% | 18% / 19% / 18% / 20% / 24% | a kill per seat per game |
| 6 | 100% | 27 | 34 | 2h42 | 9.1 | 5.3 | 9 | 54% | 33% | 29% | 5% | 20% / 16% / 14% / 18% / 18% / 14% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.6 | 0.63 | 0.69 | 0.72 |
| Won by a seat not leading at round 10 | 74% of 120 | 77% of 119 | 82% of 117 | 85% of 119 |
| First card completed (median round) | 9 | 9 | 8 | 7 |
| Escort markers per game: placed / paid / released (carrier died, escort died) | 1.43 / 0.26 / 0.63 (0.17, 0.47) | 2.49 / 0.24 / 1.5 (0.52, 0.98) | 4.52 / 0.21 / 3.34 (1.51, 1.83) | 5.58 / 0.24 / 4.27 (1.93, 2.33) |
| Marked sales with the escort out of the well, per game | 0.73 | 0.86 | 0.98 | 1.15 |
| Rounds from marker to Escort paid (median) | 10 | 7 | 5 | 4 |
| Wrecks left per game | 1.93 | 3.53 | 8.03 | 9.11 |
| Wrecks salvaged | 26% | 25% | 27% | 27% |
| Piracy seizures per game (crate / data) | 0.19 / 0.36 | 0.22 / 0.78 | 0.44 / 1.82 | 0.61 / 2.01 |
| Sales at a station, per game | 2.78 | 3.05 | 3.49 | 3.72 |
| Of those, sale named by the player | 100% | 100% | 100% | 100% |
| Fuel pumps per game | 0.33 | 0.42 | 0.42 | 0.41 |
| Turns ending in a planet well | 44% | 39% | 37% | 35% |
| Turns ending in the black hole | 56% | 61% | 63% | 65% |
| Turns ending moored | 9% | 8% | 7% | 6% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 14% | 1.6 |
| Intercept + Escort/Piracy | 79 | 4% | 18% | 1.4 |
| Intercept + Escort/Tanker | 75 | 3% | 23% | 1.6 |
| Destroy + Escort/Tanker | 75 | 3% | 21% | 1.6 |
| Destroy + Survey/Tanker | 73 | 3% | 27% | 1.7 |
| Destroy + Salvage/Survey | 71 | 3% | 28% | 1.7 |
| Intercept + Piracy/Tanker | 71 | 3% | 14% | 1.2 |
| Intercept + Survey/Tanker | 70 | 3% | 36% | 2 |
| Intercept + Escort/Salvage | 69 | 3% | 19% | 1.6 |
| Destroy + Piracy/Survey | 68 | 3% | 10% | 1.4 |
| Intercept + Piracy/Salvage | 67 | 3% | 16% | 1.6 |
| Destroy + Escort/Piracy | 66 | 3% | 21% | 1.8 |
| Intercept + Escort/Survey | 63 | 3% | 16% | 1.3 |
| Destroy + Piracy/Salvage | 61 | 3% | 15% | 1.4 |
| Deliver + Piracy/Survey | 60 | 3% | 20% | 1.7 |
| Deliver + Escort/Salvage | 60 | 3% | 22% | 1.9 |
| Deliver + Salvage/Survey | 59 | 3% | 37% | 2.2 |
| Destroy + Piracy/Tanker | 58 | 3% | 22% | 1.8 |
| Intercept + Piracy/Survey | 57 | 3% | 14% | 1.2 |
| Destroy + Salvage/Tanker | 57 | 3% | 26% | 1.6 |
| Deliver + Piracy/Tanker | 53 | 2% | 26% | 1.6 |
| Deliver + Escort/Piracy | 52 | 2% | 13% | 1.7 |
| Intercept + Salvage/Survey | 52 | 2% | 23% | 1.6 |
| Deliver + Piracy/Salvage | 50 | 2% | 26% | 1.8 |
| Intercept + Salvage/Tanker | 49 | 2% | 18% | 1.8 |
| Deliver + Escort/Survey | 47 | 2% | 30% | 2 |
| Destroy + Escort/Survey | 45 | 2% | 20% | 1.4 |
| Deliver + Salvage/Tanker | 45 | 2% | 44% | 2.2 |
| Deliver + Escort/Tanker | 43 | 2% | 37% | 2 |
| Deliver + Survey/Tanker | 42 | 2% | 50% | 2.2 |
| Destroy + Salvage/Salvage | 31 | 1% | 29% | 1.6 |
| Destroy + Escort/Escort | 29 | 1% | 7% | 1.5 |
| Intercept + Survey/Survey | 28 | 1% | 29% | 1.9 |
| Intercept + Salvage/Salvage | 27 | 1% | 15% | 1.6 |
| Deliver + Survey/Survey | 25 | 1% | 32% | 2 |
| Deliver + Piracy/Piracy | 24 | 1% | 17% | 1.4 |
| Intercept + Tanker/Tanker | 23 | 1% | 9% | 1.6 |
| Destroy + Tanker/Tanker | 22 | 1% | 27% | 1.6 |
| Deliver + Escort/Escort | 21 | 1% | 10% | 1.5 |
| Deliver + Tanker/Tanker | 21 | 1% | 19% | 1.8 |
| Destroy + Piracy/Piracy | 21 | 1% | 14% | 1 |
| Intercept + Escort/Escort | 20 | 1% | 5% | 1.4 |
| Intercept + Piracy/Piracy | 20 | 1% | 15% | 1.2 |
| Destroy + Survey/Survey | 17 | 1% | 29% | 2 |
| Deliver + Salvage/Salvage | 15 | 1% | 27% | 1.7 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| fuel_compressor,shields,disruptor,radiator,laser | 285 | 13% | 35% |
| railgun,plasma_cannon,ballistic_rack,shields,radiator | 274 | 13% | 17% |
| sensor_array,shields,disruptor,radiator,plasma_cannon | 269 | 12% | 21% |
| sensor_array,missiles,missiles,radiator,shields | 264 | 12% | 19% |
| railgun,laser,ballistic_rack,shields,radiator | 261 | 12% | 22% |
| fuel_compressor,shields,shields,radiator,plasma_cannon | 239 | 11% | 21% |
| railgun,missiles,laser,shields,radiator | 238 | 11% | 23% |
| sensor_array,shields,shields,radiator,laser | 237 | 11% | 18% |
| fuel_compressor,shields,shields,radiator,laser | 93 | 4% | 26% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 70 | 18% |
| Destroy | 2314 | 773 | 33% | 64 | 17% |
| Intercept | 2285 | 770 | 34% | 62 | 15% |
| Survey | 1282 | 847 | 66% | 26 | 14% |
| Piracy | 1279 | 872 | 68% | 14 | 8% |
| Tanker | 1292 | 843 | 65% | 22 | 13% |
| Escort | 1327 | 893 | 67% | 13 | 6% |
| Salvage | 1300 | 865 | 67% | 15 | 9% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 96% | 3 | 10 / 10 / - | 8 | 70% | 18% |
| Destroy | target hit | 93% | 3 | - | 3 | 64% | 30% |
| Intercept | target scanned | 96% | 2 | 68 / 25 / - | 8 | 62% | 16% |
| Survey | dive made | 84% | 1 | 86 / 42 / - | 12 | 26% | 39% |
| Piracy | item taken | 60% | 7 | 74 / 22 / - | 10 | 14% | 22% |
| Tanker | in a planet's well with 5 fuel | 73% | 12 | 4 / 0 / 228 | 2 | 22% | 13% |
| Escort | marker placed | 90% | 6 | 84 / 62 / 56 | 7 | 13% | 45% |
| Salvage | box taken | 55% | 15 | 62 / 22 / - | 9 | 15% | 22% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard, a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. Escort's three are its own: the escort destroyed, the marked ship destroyed (either way the marker comes back) and the marked ship selling with the escort out of its well (the marker stays out). The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

