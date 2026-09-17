# Benchmark — 2026-09-17

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
| Table time assumes | 1 min per player-turn |

## By seat count

| seats | decided | rounds (median) | rounds (p75) | table time | kills/game | cards/game | burn | scoop | firing | lost | wins by seat | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 98% | 34 | 51 | 1h42 | 1.4 | 7.2 | 49% | 37% | 16% | 2% | 33% / 28% / 37% | — |
| 4 | 100% | 37 | 59 | 2h28 | 3.5 | 7.9 | 51% | 34% | 24% | 4% | 19% / 35% / 23% / 23% | seat spread 16% |
| 5 | 100% | 37 | 56 | 3h05 | 6.5 | 8.7 | 51% | 34% | 30% | 6% | 23% / 20% / 20% / 16% / 22% | a kill per seat per game |
| 6 | 99% | 34 | 52 | 3h24 | 10.3 | 9.7 | 53% | 32% | 35% | 7% | 19% / 11% / 14% / 18% / 23% / 14% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| 3P+0D | 1176 | 54% | 28% | 1.9 |
| 2P+1D | 804 | 37% | 15% | 1.9 |
| 1P+2D | 171 | 8% | 18% | 1.7 |
| 0P+3D | 9 | 0% | 0% | 2.2 |

_P is a two-point primary, D a one-point daring card; a hand is 3 cards and 4 points win, so 3D+0P cannot win at all. A shape nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,missiles,radiator,ballistic_rack,shields | 632 | 29% | 12% |
| sensor_array,shields,shields,radiator,laser | 605 | 28% | 25% |
| sensor_array,shields,laser,laser,radiator | 551 | 26% | 28% |
| fuel_compressor,shields,shields,radiator,laser | 372 | 17% | 25% |

_A hull's win rate is against the field, so the fair share is 1/seats — about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 4004 | 2426 | 61% | 18 | 30% |
| Destroy | 2447 | 1454 | 59% | 37 | 24% |
| Intercept | 2416 | 1427 | 59% | 48 | 32% |
| Survey | 652 | 398 | 61% | 81 | 5% |
| Board | 639 | 401 | 63% | 62 | 4% |
| Garbage | 642 | 374 | 58% | 33 | 4% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. One deck serves the table, and setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

