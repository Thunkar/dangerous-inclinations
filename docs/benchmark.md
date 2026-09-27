# Benchmark (2026-09-27)

120 games per seat count, seeds 20000+, bots choosing their own hands and hulls.

**Rules in force**

| rule | value |
|---|---|
| Points to win | 3 |
| Card values | Deliver 2, Destroy 2, Intercept 2, Survey 1, Piracy 1, Tanker 1, Escort 1, Salvage 1 |
| Hold | 1 crate (data rides free) |
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
| 3 | 100% | 31 | 39 | 1h33 | 2 | 3.7 | 5.5 | 54% | 35% | 16% | 2% | 26% / 34% / 40% | none |
| 4 | 100% | 33 | 43 | 2h12 | 5.4 | 4.4 | 6.4 | 56% | 34% | 25% | 4% | 29% / 20% / 28% / 23% | a kill per seat per game |
| 5 | 100% | 29 | 39 | 2h25 | 7.5 | 4.8 | 7 | 56% | 32% | 28% | 4% | 13% / 21% / 22% / 18% / 27% | a kill per seat per game |
| 6 | 100% | 27 | 38 | 2h42 | 9.7 | 5.3 | 7.9 | 57% | 31% | 32% | 5% | 15% / 16% / 22% / 18% / 18% / 13% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.49 | 0.6 | 0.71 | 0.78 |
| Won by a seat not leading at round 10 | 71% of 119 | 71% of 119 | 82% of 117 | 79% of 117 |
| First card completed (median round) | 9 | 9 | 9 | 8 |
| Escort markers placed per game | 0.68 | 1.23 | 1.79 | 2.77 |
| Rounds from marker to Escort paid (median) | 8 | 11 | 10 | 9 |
| Wrecks left per game | 1.98 | 5.44 | 7.52 | 9.69 |
| Wrecks salvaged | 29% | 27% | 24% | 23% |
| Piracy seizures per game (crate / data) | 0.16 / 0.5 | 0.38 / 1.23 | 0.51 / 1.68 | 0.53 / 2.35 |
| Dock visits that did a job, per game | 3.33 | 3.33 | 3.48 | 3.56 |
| Of those, job named by the player | 78% | 66% | 66% | 58% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose job nobody named does the default, the job that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Intercept + Piracy/Salvage | 98 | 5% | 17% | 1.1 |
| Intercept + Escort/Piracy | 83 | 4% | 12% | 1.1 |
| Destroy + Escort/Tanker | 79 | 4% | 24% | 1.8 |
| Intercept + Piracy/Tanker | 77 | 4% | 23% | 1.1 |
| Intercept + Piracy/Survey | 76 | 4% | 14% | 0.9 |
| Destroy + Survey/Tanker | 74 | 3% | 20% | 1.6 |
| Destroy + Piracy/Tanker | 74 | 3% | 23% | 1.7 |
| Destroy + Escort/Salvage | 74 | 3% | 36% | 2 |
| Destroy + Piracy/Salvage | 74 | 3% | 26% | 1.9 |
| Intercept + Escort/Salvage | 73 | 3% | 8% | 1.1 |
| Destroy + Piracy/Survey | 73 | 3% | 34% | 1.9 |
| Destroy + Salvage/Survey | 72 | 3% | 28% | 1.7 |
| Destroy + Escort/Piracy | 71 | 3% | 27% | 1.8 |
| Intercept + Escort/Tanker | 70 | 3% | 19% | 1 |
| Destroy + Escort/Survey | 69 | 3% | 28% | 2 |
| Intercept + Salvage/Survey | 69 | 3% | 17% | 1.2 |
| Deliver + Escort/Tanker | 67 | 3% | 27% | 1.7 |
| Intercept + Escort/Survey | 65 | 3% | 11% | 1 |
| Deliver + Escort/Salvage | 62 | 3% | 19% | 1.5 |
| Deliver + Survey/Tanker | 62 | 3% | 24% | 1.7 |
| Intercept + Survey/Tanker | 61 | 3% | 20% | 1.2 |
| Deliver + Salvage/Survey | 59 | 3% | 32% | 1.7 |
| Destroy + Salvage/Tanker | 58 | 3% | 31% | 1.6 |
| Intercept + Salvage/Tanker | 57 | 3% | 26% | 1.5 |
| Deliver + Escort/Survey | 51 | 2% | 22% | 1.6 |
| Deliver + Salvage/Tanker | 44 | 2% | 30% | 1.9 |
| Destroy + Escort/Escort | 36 | 2% | 17% | 1.8 |
| Destroy + Salvage/Salvage | 34 | 2% | 26% | 1.6 |
| Destroy + Piracy/Piracy | 34 | 2% | 21% | 1.8 |
| Intercept + Piracy/Piracy | 33 | 2% | 12% | 0.9 |
| Intercept + Survey/Survey | 31 | 1% | 26% | 1.5 |
| Intercept + Tanker/Tanker | 28 | 1% | 18% | 1 |
| Deliver + Survey/Survey | 27 | 1% | 30% | 2.1 |
| Intercept + Salvage/Salvage | 27 | 1% | 19% | 0.9 |
| Destroy + Tanker/Tanker | 26 | 1% | 23% | 1.3 |
| Deliver + Tanker/Tanker | 22 | 1% | 18% | 1.2 |
| Destroy + Survey/Survey | 19 | 1% | 32% | 2.2 |
| Deliver + Escort/Escort | 18 | 1% | 6% | 1.3 |
| Intercept + Escort/Escort | 15 | 1% | 7% | 1.1 |
| Deliver + Salvage/Salvage | 13 | 1% | 15% | 1.8 |
| Deliver + Piracy/Piracy | 3 | 0% | 33% | 2 |
| Deliver + Piracy/Survey | 2 | 0% | 0% | 1.5 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,laser,ballistic_rack,shields,radiator | 867 | 40% | 27% |
| sensor_array,shields,shields,radiator,laser | 863 | 40% | 17% |
| fuel_compressor,shields,shields,radiator,laser | 430 | 20% | 24% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 430 | 23% | 60 | 10% |
| Destroy | 2314 | 867 | 37% | 64 | 23% |
| Intercept | 2285 | 863 | 38% | 28 | 14% |
| Survey | 1282 | 887 | 69% | 32 | 13% |
| Piracy | 1279 | 768 | 60% | 28 | 10% |
| Tanker | 1292 | 875 | 68% | 17 | 10% |
| Escort | 1327 | 902 | 68% | 31 | 9% |
| Salvage | 1300 | 888 | 68% | 22 | 11% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

