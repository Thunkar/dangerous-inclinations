# Benchmark — 2026-09-19

120 games per seat count, seeds 20000+, bots choosing their own hands and hulls.

**Rules in force**

| rule | value |
|---|---|
| Points to win | 4 |
| Card values | Deliver 2, Destroy 2, Intercept 2, Survey 1, Board 1, Garbage 1 |
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
| 3 | 99% | 38 | 51 | 1h54 | 2.5 | 7.4 | 54% | 34% | 19% | 3% | 31% / 29% / 39% | — |
| 4 | 100% | 42 | 52 | 2h48 | 5 | 8.5 | 54% | 33% | 24% | 5% | 23% / 25% / 27% / 25% | a kill per seat per game |
| 5 | 100% | 43 | 63 | 3h35 | 8.5 | 10.2 | 54% | 33% | 29% | 6% | 15% / 18% / 26% / 19% / 22% | a kill per seat per game |
| 6 | 100% | 48 | 66 | 4h48 | 12.9 | 11.4 | 54% | 32% | 32% | 8% | 13% / 12% / 18% / 22% / 20% / 16% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Deliver + Board/Survey | 626 | 29% | 27% | 2.3 |
| Intercept + Board/Survey | 282 | 13% | 17% | 1.7 |
| Intercept + Garbage/Survey | 263 | 12% | 18% | 1.8 |
| Destroy + Board/Garbage | 262 | 12% | 18% | 2.1 |
| Destroy + Garbage/Survey | 255 | 12% | 32% | 2.4 |
| Destroy + Board/Survey | 251 | 12% | 16% | 2.1 |
| Intercept + Board/Garbage | 221 | 10% | 21% | 2 |

_Every hand is one primary and two secondaries, which is 4 points exactly, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,missiles,radiator,ballistic_rack,shields | 768 | 36% | 22% |
| sensor_array,shields,shields,radiator,laser | 766 | 35% | 19% |
| fuel_compressor,shields,shields,radiator,laser | 626 | 29% | 27% |

_A hull's win rate is against the field, so the fair share is 1/seats — about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 2912 | 626 | 21% | 40 | 12% |
| Destroy | 1814 | 768 | 42% | 62 | 12% |
| Intercept | 1754 | 766 | 44% | 35 | 10% |
| Survey | 2160 | 1677 | 78% | 70 | 27% |
| Board | 2160 | 1642 | 76% | 51 | 24% |
| Garbage | 2160 | 1001 | 46% | 49 | 16% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

