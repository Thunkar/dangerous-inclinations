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
| Drift | black hole 8/6/4/2/1, planet 6/4/2/1 (station on planet ring 2) |
| Starting hull | 10 |
| Heat track | 10; above it is hull damage, then shed 5 (+2 per radiator) and carry the rest |
| Shields | 2 cubes a point absorbed, 2 heat a point, and its cubes as heat every turn it is powered |
| Repair | a station on arrival fixes everything; away from one, one tile a turn at 0 heat |
| Table time assumes | 1 min per player-turn |

## By seat count

| seats | decided | rounds (median) | rounds (p75) | table time | kills/game | cards/game | burn | scoop | firing | lost | wins by seat | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 99% | 33 | 49 | 1h39 | 2.5 | 7.3 | 53% | 34% | 23% | 4% | 26% / 33% / 41% | — |
| 4 | 99% | 33 | 42 | 2h12 | 4.8 | 8 | 55% | 31% | 31% | 6% | 30% / 25% / 25% / 19% | a kill per seat per game |
| 5 | 100% | 33 | 50 | 2h45 | 8.2 | 8.6 | 56% | 30% | 35% | 8% | 23% / 20% / 19% / 16% / 22% | a kill per seat per game |
| 6 | 99% | 30 | 42 | 3h00 | 10.4 | 9.6 | 57% | 28% | 40% | 9% | 15% / 15% / 18% / 24% / 14% / 13% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| 3P+0S | 1176 | 54% | 28% | 1.9 |
| 2P+1S | 804 | 37% | 14% | 1.8 |
| 1P+2S | 171 | 8% | 20% | 1.8 |
| 0P+3S | 9 | 0% | 0% | 1.9 |

_P is a two-point primary, S a one-point secondary; a hand is 3 cards and 4 points win, so 0P+3S cannot win at all. A shape nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,missiles,radiator,ballistic_rack,shields | 632 | 29% | 17% |
| sensor_array,shields,shields,radiator,laser | 605 | 28% | 21% |
| sensor_array,shields,laser,laser,radiator | 551 | 26% | 32% |
| fuel_compressor,shields,shields,radiator,laser | 372 | 17% | 18% |

_A hull's win rate is against the field, so the fair share is 1/seats — about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 4004 | 2426 | 61% | 16 | 26% |
| Destroy | 2447 | 1454 | 59% | 50 | 32% |
| Intercept | 2416 | 1427 | 59% | 41 | 30% |
| Survey | 652 | 398 | 61% | 73 | 6% |
| Board | 639 | 401 | 63% | 52 | 4% |
| Garbage | 642 | 374 | 58% | 30 | 3% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. One deck serves the table, and setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

