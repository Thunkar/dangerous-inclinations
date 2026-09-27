# Benchmark (2026-09-27)

120 games per seat count, seeds 20000+, bots choosing their own hands and hulls.

**Rules in force**

| rule | value |
|---|---|
| Points to win | 3 |
| Card values | Deliver 2, Destroy 2, Intercept 2, Survey 1, Piracy 1, Tanker 1, Escort 1, Salvage 1 |
| Hold | 1 crate (data rides free) |
| Moored ships | can neither fire nor be fired at |
| The deal | 3 primaries keep 1; 3 secondaries keep any 2 from a shuffled pile of Survey, Piracy, Tanker, Escort, Salvage |
| Seats allowed | 2–6 |
| Drift | black hole 8/6/4/2/1, planet 6/4/2/1 (station on planet ring 2) |
| Starting hull | 10 |
| Heat track | 10; above it is hull damage, then shed 5 (+2 per radiator) and carry the rest |
| Shields | 2 cubes a point absorbed, 2 heat a point, and its cubes as heat every turn it is powered |
| Repair | a station on arrival fixes everything; away from one, one subsystem a turn at 0 heat |
| Table time assumes | 1 min per player-turn |

## By seat count

| seats | decided | rounds (median) | rounds (p75) | table time | kills/game | cards/game | burn | scoop | firing | lost | wins by seat | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 99% | 32 | 43 | 1h36 | 2.2 | 5.6 | 53% | 35% | 16% | 2% | 31% / 39% / 29% | none |
| 4 | 100% | 30 | 40 | 2h00 | 5.4 | 6.2 | 56% | 34% | 25% | 4% | 24% / 25% / 26% / 25% | a kill per seat per game |
| 5 | 100% | 31 | 43 | 2h35 | 8.7 | 7.1 | 56% | 32% | 28% | 4% | 23% / 13% / 22% / 20% / 23% | a kill per seat per game |
| 6 | 100% | 28 | 39 | 2h48 | 9.9 | 8 | 56% | 32% | 31% | 5% | 20% / 14% / 18% / 15% / 14% / 18% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Intercept + Piracy/Salvage | 98 | 5% | 12% | 0.9 |
| Intercept + Escort/Piracy | 83 | 4% | 6% | 1 |
| Destroy + Escort/Tanker | 79 | 4% | 32% | 1.8 |
| Intercept + Piracy/Tanker | 77 | 4% | 21% | 1.2 |
| Intercept + Piracy/Survey | 76 | 4% | 11% | 0.9 |
| Destroy + Survey/Tanker | 74 | 3% | 23% | 1.7 |
| Destroy + Piracy/Tanker | 74 | 3% | 27% | 1.5 |
| Destroy + Escort/Salvage | 74 | 3% | 39% | 1.9 |
| Destroy + Piracy/Salvage | 74 | 3% | 26% | 1.8 |
| Intercept + Escort/Salvage | 73 | 3% | 22% | 1.5 |
| Destroy + Piracy/Survey | 73 | 3% | 19% | 1.6 |
| Destroy + Salvage/Survey | 72 | 3% | 29% | 1.8 |
| Destroy + Escort/Piracy | 71 | 3% | 32% | 1.9 |
| Intercept + Escort/Tanker | 70 | 3% | 19% | 1.3 |
| Destroy + Escort/Survey | 69 | 3% | 41% | 2.1 |
| Intercept + Salvage/Survey | 69 | 3% | 25% | 1.3 |
| Deliver + Escort/Tanker | 67 | 3% | 16% | 1.5 |
| Intercept + Escort/Survey | 65 | 3% | 12% | 1 |
| Deliver + Escort/Salvage | 62 | 3% | 24% | 1.7 |
| Deliver + Survey/Tanker | 62 | 3% | 32% | 1.9 |
| Intercept + Survey/Tanker | 61 | 3% | 15% | 1 |
| Deliver + Salvage/Survey | 59 | 3% | 27% | 1.6 |
| Destroy + Salvage/Tanker | 58 | 3% | 28% | 1.8 |
| Intercept + Salvage/Tanker | 57 | 3% | 21% | 1.3 |
| Deliver + Escort/Survey | 51 | 2% | 18% | 1.5 |
| Deliver + Salvage/Tanker | 44 | 2% | 27% | 1.8 |
| Destroy + Escort/Escort | 36 | 2% | 17% | 1.6 |
| Destroy + Salvage/Salvage | 34 | 2% | 29% | 1.8 |
| Destroy + Piracy/Piracy | 34 | 2% | 15% | 1.6 |
| Intercept + Piracy/Piracy | 33 | 2% | 3% | 0.8 |
| Intercept + Survey/Survey | 31 | 1% | 19% | 1.1 |
| Intercept + Tanker/Tanker | 28 | 1% | 21% | 1 |
| Deliver + Survey/Survey | 27 | 1% | 26% | 2.2 |
| Intercept + Salvage/Salvage | 27 | 1% | 19% | 1 |
| Destroy + Tanker/Tanker | 26 | 1% | 15% | 1.4 |
| Deliver + Tanker/Tanker | 22 | 1% | 32% | 2 |
| Destroy + Survey/Survey | 19 | 1% | 26% | 2.2 |
| Deliver + Escort/Escort | 18 | 1% | 11% | 1.4 |
| Intercept + Escort/Escort | 15 | 1% | 7% | 1.3 |
| Deliver + Salvage/Salvage | 13 | 1% | 23% | 1.5 |
| Deliver + Piracy/Piracy | 3 | 0% | 0% | 1.3 |
| Deliver + Piracy/Survey | 2 | 0% | 0% | 0.5 |

_Every hand is one primary and two secondaries, which is five points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,laser,ballistic_rack,shields,radiator | 867 | 40% | 28% |
| sensor_array,shields,shields,radiator,laser | 863 | 40% | 16% |
| fuel_compressor,shields,shields,radiator,laser | 430 | 20% | 24% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 430 | 23% | 57 | 10% |
| Destroy | 2314 | 867 | 37% | 63 | 24% |
| Intercept | 2285 | 863 | 38% | 28 | 13% |
| Survey | 1282 | 887 | 69% | 34 | 13% |
| Piracy | 1279 | 768 | 60% | 26 | 8% |
| Tanker | 1292 | 875 | 68% | 18 | 10% |
| Escort | 1327 | 902 | 68% | 33 | 10% |
| Salvage | 1300 | 888 | 68% | 23 | 12% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

