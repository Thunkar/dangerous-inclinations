# Benchmark (2026-09-22)

240 games per seat count, seeds 20000+, bots choosing their own hands and hulls.

**Rules in force**

| rule | value |
|---|---|
| Points to win | 3 |
| Card values | Deliver 2, Destroy 2, Intercept 2, Survey 1, Piracy 1, Tanker 1 |
| Hold | 1 crate (data rides free) |
| The deal | 3 primaries keep 1, 3 secondaries keep 2 |
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
| 3 | 100% | 25 | 39 | 1h15 | 2.9 | 4.8 | 54% | 34% | 19% | 2% | 33% / 32% / 35% | none |
| 4 | 100% | 23 | 39 | 1h32 | 5 | 5.3 | 55% | 32% | 24% | 3% | 23% / 25% / 27% / 25% | a kill per seat per game |
| 5 | 100% | 27 | 45 | 2h15 | 9.3 | 6 | 56% | 31% | 30% | 5% | 20% / 23% / 17% / 19% / 21% | a kill per seat per game |
| 6 | 99% | 27 | 47 | 2h42 | 14.5 | 7.1 | 56% | 30% | 34% | 6% | 13% / 18% / 14% / 18% / 17% / 19% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Deliver + Survey/Tanker | 1257 | 29% | 30% | 1.4 |
| Destroy + Piracy/Survey | 544 | 13% | 23% | 1.6 |
| Intercept + Survey/Tanker | 533 | 12% | 18% | 0.9 |
| Destroy + Survey/Tanker | 515 | 12% | 16% | 1.3 |
| Intercept + Piracy/Tanker | 502 | 12% | 17% | 1 |
| Destroy + Piracy/Tanker | 492 | 11% | 25% | 1.7 |
| Intercept + Piracy/Survey | 477 | 11% | 14% | 0.9 |

_Every hand is one primary and two secondaries, which is five points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,laser,ballistic_rack,shields,radiator | 1551 | 36% | 21% |
| sensor_array,shields,shields,radiator,laser | 1512 | 35% | 16% |
| fuel_compressor,shields,shields,radiator,laser | 1257 | 29% | 30% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 5871 | 1257 | 21% | 39 | 18% |
| Destroy | 3575 | 1551 | 43% | 59 | 16% |
| Intercept | 3514 | 1512 | 43% | 21 | 12% |
| Survey | 4320 | 3326 | 77% | 23 | 15% |
| Piracy | 4320 | 2015 | 47% | 27 | 13% |
| Tanker | 4320 | 3299 | 76% | 25 | 26% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

