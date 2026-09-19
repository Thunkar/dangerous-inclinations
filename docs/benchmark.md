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
| 3 | 100% | 30 | 39 | 1h30 | 2.7 | 7.1 | 55% | 33% | 26% | 5% | 28% / 37% / 36% | — |
| 4 | 100% | 32 | 42 | 2h08 | 5 | 8.3 | 55% | 31% | 34% | 7% | 19% / 27% / 23% / 32% | a kill per seat per game |
| 5 | 100% | 36 | 52 | 3h00 | 9.4 | 9.7 | 54% | 31% | 38% | 8% | 23% / 11% / 18% / 29% / 19% | a kill per seat per game; seat spread 18% |
| 6 | 100% | 45 | 67 | 4h30 | 16.5 | 11.2 | 55% | 30% | 43% | 10% | 20% / 12% / 18% / 15% / 18% / 18% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Deliver + Board/Survey | 330 | 15% | 16% | 1.8 |
| Destroy + Garbage/Survey | 205 | 9% | 16% | 2.1 |
| Intercept + Garbage/Survey | 195 | 9% | 24% | 1.9 |
| Intercept + Board/Garbage | 194 | 9% | 14% | 1.7 |
| Destroy + Board/Garbage | 174 | 8% | 13% | 1.8 |
| Destroy + Board/Survey | 159 | 7% | 30% | 2.3 |
| Intercept + Board/Survey | 150 | 7% | 30% | 2.1 |
| Deliver + Board/Board | 137 | 6% | 22% | 1.9 |
| Deliver + Survey/Survey | 127 | 6% | 36% | 2.6 |
| Destroy + Garbage/Garbage | 113 | 5% | 7% | 1.5 |
| Intercept + Garbage/Garbage | 92 | 4% | 8% | 1.8 |
| Intercept + Board/Board | 75 | 3% | 35% | 2.3 |
| Destroy + Survey/Survey | 59 | 3% | 53% | 2.9 |
| Intercept + Survey/Survey | 56 | 3% | 50% | 2.7 |
| Destroy + Board/Board | 52 | 2% | 37% | 2.3 |
| Deliver + Garbage/Survey | 17 | 1% | 35% | 2.4 |
| Deliver + Garbage/Garbage | 15 | 1% | 20% | 1.7 |
| Deliver + Board/Garbage | 10 | 0% | 0% | 1 |

_Every hand is one primary and two secondaries, which is 4 points exactly, so the row is the errand a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| sensor_array,shields,shields,radiator,laser | 762 | 35% | 24% |
| railgun,missiles,radiator,ballistic_rack,shields | 762 | 35% | 21% |
| fuel_compressor,shields,shields,radiator,laser | 636 | 29% | 22% |

_A hull's win rate is against the field, so the fair share is 1/seats — about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 2912 | 636 | 22% | 25 | 10% |
| Destroy | 1814 | 762 | 42% | 64 | 11% |
| Intercept | 1754 | 762 | 43% | 47 | 13% |
| Survey | 2144 | 1540 | 72% | 75 | 31% |
| Board | 2169 | 1545 | 71% | 58 | 24% |
| Garbage | 2167 | 1235 | 57% | 23 | 12% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

