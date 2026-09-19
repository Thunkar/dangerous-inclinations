# Benchmark — 2026-09-19

120 games per seat count, seeds 20000+, bots choosing their own hands and hulls.

**Rules in force**

| rule | value |
|---|---|
| Points to win | 3 |
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
| 3 | 100% | 28 | 39 | 1h24 | 2.2 | 5.5 | 55% | 33% | 20% | 4% | 34% / 37% / 29% | — |
| 4 | 100% | 27 | 39 | 1h48 | 5.3 | 5.9 | 56% | 32% | 26% | 7% | 27% / 28% / 25% / 20% | a kill per seat per game |
| 5 | 100% | 31 | 43 | 2h35 | 9.7 | 6.7 | 56% | 30% | 33% | 10% | 15% / 23% / 21% / 18% / 23% | a kill per seat per game |
| 6 | 100% | 30 | 44 | 3h00 | 13.7 | 7.7 | 57% | 28% | 37% | 12% | 18% / 19% / 15% / 21% / 12% / 16% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Deliver + Board/Survey | 626 | 29% | 19% | 1.5 |
| Intercept + Board/Survey | 282 | 13% | 15% | 1 |
| Intercept + Garbage/Survey | 263 | 12% | 19% | 1 |
| Destroy + Board/Garbage | 262 | 12% | 28% | 1.6 |
| Destroy + Garbage/Survey | 255 | 12% | 32% | 1.7 |
| Destroy + Board/Survey | 251 | 12% | 27% | 1.8 |
| Intercept + Board/Garbage | 221 | 10% | 22% | 1.3 |

_Every hand is one primary and two secondaries, which is five points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,laser,laser,shields,radiator | 768 | 36% | 29% |
| sensor_array,shields,shields,radiator,laser | 766 | 35% | 18% |
| fuel_compressor,shields,shields,radiator,laser | 626 | 29% | 19% |

_A hull's win rate is against the field, so the fair share is 1/seats — about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 2912 | 626 | 21% | 24 | 11% |
| Destroy | 1814 | 768 | 42% | 63 | 21% |
| Intercept | 1754 | 766 | 44% | 22 | 14% |
| Survey | 2160 | 1677 | 78% | 47 | 28% |
| Board | 2160 | 1642 | 76% | 27 | 14% |
| Garbage | 2160 | 1001 | 46% | 25 | 11% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

