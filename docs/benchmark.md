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
| 3 | 100% | 23 | 30 | 1h09 | 1.4 | 4.9 | 55% | 32% | 17% | 3% | 22% / 43% / 35% | seat spread 22% |
| 4 | 100% | 25 | 33 | 1h40 | 4.4 | 5.8 | 55% | 31% | 24% | 6% | 25% / 23% / 14% / 38% | a kill per seat per game; seat spread 23% |
| 5 | 100% | 24 | 36 | 2h00 | 5.9 | 6.4 | 56% | 31% | 29% | 7% | 18% / 17% / 19% / 28% / 18% | a kill per seat per game |
| 6 | 100% | 27 | 38 | 2h42 | 9.5 | 7.3 | 56% | 29% | 35% | 9% | 16% / 16% / 14% / 13% / 18% / 23% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Deliver + Board/Survey | 626 | 29% | 29% | 1.6 |
| Intercept + Board/Survey | 282 | 13% | 18% | 1.1 |
| Intercept + Garbage/Survey | 263 | 12% | 16% | 1 |
| Destroy + Board/Garbage | 262 | 12% | 23% | 1.5 |
| Destroy + Garbage/Survey | 255 | 12% | 20% | 1.5 |
| Destroy + Board/Survey | 251 | 12% | 16% | 1.2 |
| Intercept + Board/Garbage | 221 | 10% | 24% | 1.3 |

_Every hand is one primary and two secondaries, which is five points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,laser,ballistic_rack,shields,radiator | 768 | 36% | 20% |
| sensor_array,shields,shields,radiator,laser | 766 | 35% | 19% |
| fuel_compressor,shields,shields,radiator,laser | 626 | 29% | 29% |

_A hull's win rate is against the field, so the fair share is 1/seats — about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 2912 | 626 | 21% | 45 | 18% |
| Destroy | 1814 | 768 | 42% | 49 | 15% |
| Intercept | 1754 | 766 | 44% | 28 | 14% |
| Survey | 2160 | 1677 | 78% | 35 | 24% |
| Board | 2160 | 1642 | 76% | 28 | 21% |
| Garbage | 2160 | 1001 | 46% | 14 | 7% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

