# Benchmark — 2026-09-20

240 games per seat count, seeds 20000+, bots choosing their own hands and hulls.

**Rules in force**

| rule | value |
|---|---|
| Points to win | 3 |
| Card values | Deliver 2, Destroy 2, Intercept 2, Survey 1, Piracy 1, Tanker 1 |
| Hold | 1 crate (data rides free) |
| The deal | 3 primaries keep 1, 4 secondaries keep 2 |
| Seats allowed | 2–6 |
| Drift | black hole 8/6/4/2/1, planet 6/4/2/1 (station on planet ring 2) |
| Starting hull | 10 |
| Heat track | 10; above it is hull damage, then shed 5 (+2 per radiator) and carry the rest |
| Shields | 2 cubes a point absorbed, 2 heat a point, and its cubes as heat every turn it is powered |
| Repair | a station on arrival fixes everything; away from one, one tile a turn at 0 heat |
| Table time assumes | 1 min per player-turn |

## By seat count

| seats | decided | rounds (median) | rounds (p75) | table time | kills/game | cards/game | burn | scoop | firing | lost | wins by seat | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 99% | 27 | 46 | 1h21 | 4.1 | 5 | 54% | 34% | 21% | 3% | 38% / 30% / 31% | a kill per seat per game |
| 4 | 99% | 27 | 46 | 1h48 | 7.8 | 5.5 | 55% | 31% | 29% | 4% | 25% / 31% / 21% / 23% | a kill per seat per game |
| 5 | 98% | 33 | 51 | 2h45 | 14 | 6.4 | 56% | 30% | 35% | 6% | 16% / 20% / 20% / 23% / 19% | a kill per seat per game |
| 6 | 98% | 28 | 57 | 2h48 | 19.7 | 7 | 57% | 28% | 41% | 7% | 15% / 17% / 15% / 18% / 17% / 17% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Deliver + Survey/Tanker | 960 | 22% | 32% | 1.4 |
| Destroy + Piracy/Tanker | 619 | 14% | 21% | 1.7 |
| Intercept + Piracy/Survey | 571 | 13% | 17% | 1 |
| Intercept + Piracy/Tanker | 564 | 13% | 18% | 1 |
| Destroy + Piracy/Survey | 551 | 13% | 21% | 1.6 |
| Destroy + Survey/Tanker | 473 | 11% | 21% | 1.5 |
| Intercept + Survey/Tanker | 456 | 11% | 15% | 0.9 |
| Deliver + Piracy/Tanker | 66 | 2% | 38% | 1.9 |
| Deliver + Piracy/Survey | 60 | 1% | 13% | 1.1 |

_Every hand is one primary and two secondaries, which is five points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,laser,ballistic_rack,shields,radiator | 1643 | 38% | 21% |
| sensor_array,shields,shields,radiator,laser | 1591 | 37% | 17% |
| fuel_compressor,shields,shields,radiator,laser | 1086 | 25% | 31% |

_A hull's win rate is against the field, so the fair share is 1/seats — about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 5871 | 1086 | 18% | 39 | 16% |
| Destroy | 3575 | 1643 | 46% | 65 | 16% |
| Intercept | 3514 | 1591 | 45% | 22 | 13% |
| Survey | 5753 | 3071 | 53% | 22 | 15% |
| Piracy | 5770 | 2431 | 42% | 22 | 13% |
| Tanker | 5757 | 3138 | 55% | 27 | 26% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

