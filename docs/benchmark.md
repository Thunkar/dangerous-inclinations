# Benchmark (2026-09-26)

120 games per seat count, seeds 20000+, bots choosing their own hands and hulls.

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
| Repair | a station on arrival fixes everything; away from one, one subsystem a turn at 0 heat |
| Table time assumes | 1 min per player-turn |

## By seat count

| seats | decided | rounds (median) | rounds (p75) | table time | kills/game | cards/game | burn | scoop | firing | lost | wins by seat | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 100% | 33 | 48 | 1h39 | 4 | 5.2 | 54% | 34% | 24% | 3% | 37% / 33% / 31% | a kill per seat per game |
| 4 | 100% | 33 | 46 | 2h12 | 7.5 | 5.8 | 55% | 33% | 28% | 4% | 26% / 22% / 33% / 19% | a kill per seat per game |
| 5 | 100% | 33 | 54 | 2h45 | 12.8 | 7.1 | 56% | 31% | 33% | 6% | 14% / 20% / 26% / 23% / 17% | a kill per seat per game |
| 6 | 100% | 33 | 51 | 3h18 | 14.9 | 7.4 | 56% | 31% | 37% | 6% | 17% / 18% / 22% / 19% / 13% / 12% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Deliver + Survey/Tanker | 326 | 15% | 30% | 1.9 |
| Intercept + Piracy/Survey | 325 | 15% | 14% | 0.9 |
| Destroy + Survey/Tanker | 312 | 14% | 23% | 1.5 |
| Destroy + Piracy/Tanker | 306 | 14% | 27% | 1.8 |
| Intercept + Piracy/Tanker | 303 | 14% | 19% | 1.1 |
| Destroy + Piracy/Survey | 302 | 14% | 23% | 1.7 |
| Intercept + Survey/Tanker | 286 | 13% | 18% | 1 |

_Every hand is one primary and two secondaries, which is five points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,laser,ballistic_rack,shields,radiator | 920 | 43% | 25% |
| sensor_array,shields,shields,radiator,laser | 914 | 42% | 17% |
| fuel_compressor,shields,shields,radiator,laser | 326 | 15% | 30% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 326 | 17% | 64 | 10% |
| Destroy | 2314 | 920 | 40% | 65 | 23% |
| Intercept | 2285 | 914 | 40% | 23 | 16% |
| Survey | 2160 | 1551 | 72% | 26 | 17% |
| Piracy | 2160 | 1236 | 57% | 28 | 17% |
| Tanker | 2160 | 1533 | 71% | 18 | 18% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

