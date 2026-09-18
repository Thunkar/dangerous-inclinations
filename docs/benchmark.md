# Benchmark — 2026-09-18

120 games per seat count, seeds 20000+, bots choosing their own hands and hulls.

**Rules in force**

| rule | value |
|---|---|
| Points to win | 4 |
| Card values | Deliver 2, Destroy 2, Intercept 2, Survey 1, Board 1, Garbage 1 |
| Hold | 1 crate (data rides free) |
| Cards offered / kept | 5 / 3 |
| Seats allowed | 2–6 |
| Starting hull | 10 |
| Heat track | 10; above it is hull damage, then shed 5 (+2 per radiator) and carry the rest |
| Shields | 2 cubes a point absorbed, 2 heat a point, and its cubes as heat every turn it is powered |
| Repair | a station on arrival fixes everything; away from one, one tile a turn at 0 heat |
| Table time assumes | 1 min per player-turn |

## By seat count

| seats | decided | rounds (median) | rounds (p75) | table time | kills/game | cards/game | burn | scoop | firing | lost | wins by seat | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 98% | 39 | 49 | 1h57 | 2.4 | 7.4 | 51% | 37% | 20% | 3% | 35% / 28% / 35% | — |
| 4 | 99% | 35 | 51 | 2h20 | 5.5 | 8 | 52% | 34% | 29% | 6% | 30% / 24% / 27% / 18% | a kill per seat per game |
| 5 | 98% | 35 | 55 | 2h55 | 9.1 | 9.1 | 54% | 33% | 34% | 7% | 14% / 28% / 18% / 13% / 25% | a kill per seat per game; seat spread 15% |
| 6 | 100% | 33 | 50 | 3h18 | 10.7 | 9.1 | 55% | 32% | 39% | 9% | 9% / 18% / 21% / 22% / 17% / 13% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| 3P+0D | 1176 | 54% | 27% | 1.9 |
| 2P+1D | 804 | 37% | 15% | 1.8 |
| 1P+2D | 171 | 8% | 20% | 1.9 |
| 0P+3D | 9 | 0% | 0% | 2.2 |

_P is a two-point primary, D a one-point daring card; a hand is 3 cards and 4 points win, so 3D+0P cannot win at all. A shape nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,missiles,radiator,ballistic_rack,shields | 632 | 29% | 19% |
| sensor_array,shields,shields,radiator,laser | 605 | 28% | 19% |
| sensor_array,shields,laser,laser,radiator | 551 | 26% | 29% |
| fuel_compressor,shields,shields,radiator,laser | 372 | 17% | 22% |

_A hull's win rate is against the field, so the fair share is 1/seats — about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 4004 | 2426 | 61% | 17 | 27% |
| Destroy | 2447 | 1454 | 59% | 49 | 32% |
| Intercept | 2416 | 1427 | 59% | 41 | 27% |
| Survey | 652 | 398 | 61% | 70 | 6% |
| Board | 639 | 401 | 63% | 55 | 5% |
| Garbage | 642 | 374 | 58% | 35 | 4% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. One deck serves the table, and setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

