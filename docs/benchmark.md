# Benchmark (2026-09-28)

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
| Shields | 2 cubes a point absorbed, 2 heat a point, and its cubes as heat every turn it is powered |
| Table time assumes | 1 min per player-turn |

## By seat count

| seats | decided | rounds (median) | rounds (p75) | table time | kills/game | cards/game | points/game | burn | scoop | firing | lost | wins by seat | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 100% | 32 | 43 | 1h36 | 2 | 3.6 | 5.5 | 52% | 35% | 17% | 2% | 33% / 30% / 37% | none |
| 4 | 100% | 27 | 37 | 1h48 | 3.6 | 4.2 | 6.2 | 55% | 33% | 23% | 3% | 26% / 31% / 25% / 18% | none |
| 5 | 100% | 31 | 40 | 2h35 | 7.4 | 4.6 | 6.8 | 56% | 32% | 28% | 4% | 18% / 26% / 12% / 22% / 23% | a kill per seat per game |
| 6 | 100% | 30 | 39 | 3h00 | 9 | 5.1 | 7.5 | 56% | 32% | 30% | 4% | 13% / 17% / 27% / 16% / 10% / 18% | a kill per seat per game; seat spread 17% |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.57 | 0.66 | 0.66 | 0.67 |
| Won by a seat not leading at round 10 | 76% of 119 | 68% of 116 | 71% of 119 | 75% of 119 |
| First card completed (median round) | 9 | 9 | 8 | 7 |
| Escort markers placed per game | 0.67 | 1.13 | 1.98 | 2.28 |
| Rounds from marker to Escort paid (median) | 10 | 7 | 8 | 8 |
| Wrecks left per game | 2 | 3.62 | 7.35 | 8.96 |
| Wrecks salvaged | 24% | 25% | 25% | 26% |
| Piracy seizures per game (crate / data) | 0.24 / 0.69 | 0.42 / 1.17 | 0.72 / 2.17 | 1.17 / 2.62 |
| Sales at a station, per game | 2.67 | 2.78 | 2.85 | 3.14 |
| Of those, sale named by the player | 100% | 100% | 100% | 99% |
| Fuel pumps per game | 0.21 | 0.33 | 0.27 | 0.33 |
| Turns ending in a planet well | 43% | 37% | 31% | 32% |
| Turns ending in the black hole | 57% | 63% | 69% | 68% |
| Turns ending moored | 8% | 7% | 6% | 6% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 25% | 1.7 |
| Intercept + Escort/Piracy | 79 | 4% | 13% | 1.2 |
| Intercept + Escort/Tanker | 75 | 3% | 17% | 1.1 |
| Destroy + Escort/Tanker | 75 | 3% | 32% | 1.8 |
| Destroy + Survey/Tanker | 73 | 3% | 19% | 1.6 |
| Destroy + Salvage/Survey | 71 | 3% | 20% | 1.4 |
| Intercept + Piracy/Tanker | 71 | 3% | 15% | 1 |
| Intercept + Survey/Tanker | 70 | 3% | 19% | 1.3 |
| Intercept + Escort/Salvage | 69 | 3% | 20% | 1.4 |
| Destroy + Piracy/Survey | 68 | 3% | 26% | 1.7 |
| Intercept + Piracy/Salvage | 67 | 3% | 9% | 0.9 |
| Destroy + Escort/Piracy | 66 | 3% | 30% | 1.7 |
| Intercept + Escort/Survey | 63 | 3% | 11% | 1.1 |
| Destroy + Piracy/Salvage | 61 | 3% | 46% | 1.9 |
| Deliver + Piracy/Survey | 60 | 3% | 18% | 1.2 |
| Deliver + Escort/Salvage | 60 | 3% | 15% | 1.2 |
| Deliver + Salvage/Survey | 59 | 3% | 39% | 1.8 |
| Destroy + Piracy/Tanker | 58 | 3% | 24% | 1.6 |
| Intercept + Piracy/Survey | 57 | 3% | 18% | 0.8 |
| Destroy + Salvage/Tanker | 57 | 3% | 21% | 1.5 |
| Deliver + Piracy/Tanker | 53 | 2% | 11% | 1.2 |
| Deliver + Escort/Piracy | 52 | 2% | 17% | 1.4 |
| Intercept + Salvage/Survey | 52 | 2% | 27% | 1.3 |
| Deliver + Piracy/Salvage | 50 | 2% | 32% | 1.7 |
| Intercept + Salvage/Tanker | 49 | 2% | 6% | 1.2 |
| Deliver + Escort/Survey | 47 | 2% | 26% | 1.5 |
| Destroy + Escort/Survey | 45 | 2% | 38% | 1.9 |
| Deliver + Salvage/Tanker | 45 | 2% | 38% | 2 |
| Deliver + Escort/Tanker | 43 | 2% | 37% | 2 |
| Deliver + Survey/Tanker | 42 | 2% | 40% | 2.2 |
| Destroy + Salvage/Salvage | 31 | 1% | 23% | 1.7 |
| Destroy + Escort/Escort | 29 | 1% | 31% | 1.7 |
| Intercept + Survey/Survey | 28 | 1% | 18% | 1.3 |
| Intercept + Salvage/Salvage | 27 | 1% | 15% | 1.2 |
| Deliver + Survey/Survey | 25 | 1% | 28% | 1.5 |
| Deliver + Piracy/Piracy | 24 | 1% | 8% | 1.2 |
| Intercept + Tanker/Tanker | 23 | 1% | 4% | 1.1 |
| Destroy + Tanker/Tanker | 22 | 1% | 14% | 1.3 |
| Deliver + Escort/Escort | 21 | 1% | 14% | 1.2 |
| Deliver + Tanker/Tanker | 21 | 1% | 14% | 1.5 |
| Destroy + Piracy/Piracy | 21 | 1% | 29% | 1.9 |
| Intercept + Escort/Escort | 20 | 1% | 10% | 1.4 |
| Intercept + Piracy/Piracy | 20 | 1% | 5% | 1.3 |
| Destroy + Survey/Survey | 17 | 1% | 35% | 1.9 |
| Deliver + Salvage/Salvage | 15 | 1% | 20% | 1.6 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,laser,ballistic_rack,shields,radiator | 773 | 36% | 27% |
| sensor_array,shields,shields,radiator,laser | 770 | 36% | 15% |
| fuel_compressor,shields,shields,radiator,laser | 617 | 29% | 25% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 49 | 16% |
| Destroy | 2314 | 773 | 33% | 59 | 21% |
| Intercept | 2285 | 770 | 34% | 34 | 12% |
| Survey | 1282 | 847 | 66% | 30 | 13% |
| Piracy | 1279 | 872 | 68% | 30 | 12% |
| Tanker | 1292 | 843 | 65% | 16 | 8% |
| Escort | 1327 | 893 | 67% | 31 | 11% |
| Salvage | 1300 | 865 | 67% | 17 | 7% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

