# Benchmark (2026-09-28)

120 games per seat count, seeds 20000+, bots choosing their own hands and hulls.

**Rules in force**

| rule | value |
|---|---|
| Points to win | 3 |
| Card values | Deliver 2, Destroy 2, Intercept 2, Survey 1, Piracy 1, Tanker 1, Escort 1, Salvage 1 |
| Hold | no limit; a pirate names the item it seizes |
| Stations | each buys one item from each player, once |
| The deal | 3 primaries keep 1; 3 secondaries keep any 2 from a shuffled pile of Survey, Piracy, Tanker, Escort, Salvage |
| Seats allowed | 2–6 |
| Drift | black hole 8/6/4/2/1, planet 6/4/2/1 (station on planet ring 2) |
| Starting hull | 10 |
| Heat track | 10; above it is hull damage, then shed 5 (+2 per radiator) and carry the rest |
| Shields | 2 cubes a point absorbed, 2 heat a point, and its cubes as heat every turn it is powered |
| Table time assumes | 1 min per player-turn |

## By seat count

| seats | decided | rounds (median) | rounds (p75) | table time | kills/game | cards/game | points/game | burn | scoop | firing | lost | wins by seat | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 100% | 30 | 39 | 1h30 | 1.8 | 3.7 | 5.7 | 52% | 35% | 17% | 2% | 40% / 33% / 27% | none |
| 4 | 100% | 27 | 34 | 1h48 | 3.7 | 4.2 | 6.5 | 55% | 33% | 23% | 3% | 33% / 23% / 18% / 27% | seat spread 16% |
| 5 | 100% | 29 | 37 | 2h25 | 7.2 | 4.7 | 7.2 | 56% | 32% | 29% | 4% | 18% / 21% / 22% / 16% / 23% | a kill per seat per game |
| 6 | 100% | 28 | 42 | 2h48 | 10.1 | 5.4 | 8.3 | 56% | 31% | 31% | 5% | 12% / 16% / 19% / 17% / 15% / 22% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.58 | 0.6 | 0.58 | 0.68 |
| Won by a seat not leading at round 10 | 76% of 119 | 75% of 115 | 75% of 119 | 78% of 120 |
| First card completed (median round) | 9 | 9 | 9 | 7 |
| Escort markers placed per game | 0.59 | 1.07 | 1.7 | 2.32 |
| Rounds from marker to Escort paid (median) | 8 | 7 | 7 | 7 |
| Wrecks left per game | 1.78 | 3.65 | 7.18 | 10.09 |
| Wrecks salvaged | 27% | 24% | 24% | 26% |
| Piracy seizures per game (crate / data) | 0.16 / 0.58 | 0.5 / 1.22 | 0.58 / 2.12 | 0.88 / 2.69 |
| Sales at a station, per game | 2.78 | 2.9 | 2.98 | 3.26 |
| Of those, sale named by the player | 100% | 100% | 100% | 100% |
| Fuel pumps per game | 0.19 | 0.23 | 0.23 | 0.3 |
| Turns ending in a planet well | 43% | 37% | 30% | 32% |
| Turns ending in the black hole | 57% | 63% | 70% | 68% |
| Turns ending moored | 8% | 7% | 5% | 6% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 34% | 1.9 |
| Intercept + Escort/Piracy | 79 | 4% | 15% | 1.3 |
| Intercept + Escort/Tanker | 75 | 3% | 20% | 1.3 |
| Destroy + Escort/Tanker | 75 | 3% | 39% | 1.9 |
| Destroy + Survey/Tanker | 73 | 3% | 18% | 1.3 |
| Destroy + Salvage/Survey | 71 | 3% | 23% | 1.4 |
| Intercept + Piracy/Tanker | 71 | 3% | 10% | 1.2 |
| Intercept + Survey/Tanker | 70 | 3% | 23% | 1.6 |
| Intercept + Escort/Salvage | 69 | 3% | 19% | 1.4 |
| Destroy + Piracy/Survey | 68 | 3% | 25% | 1.6 |
| Intercept + Piracy/Salvage | 67 | 3% | 13% | 1.2 |
| Destroy + Escort/Piracy | 66 | 3% | 30% | 1.8 |
| Intercept + Escort/Survey | 63 | 3% | 17% | 1.4 |
| Destroy + Piracy/Salvage | 61 | 3% | 36% | 1.7 |
| Deliver + Piracy/Survey | 60 | 3% | 13% | 1.5 |
| Deliver + Escort/Salvage | 60 | 3% | 15% | 1.3 |
| Deliver + Salvage/Survey | 59 | 3% | 41% | 1.9 |
| Destroy + Piracy/Tanker | 58 | 3% | 26% | 1.6 |
| Intercept + Piracy/Survey | 57 | 3% | 16% | 1.2 |
| Destroy + Salvage/Tanker | 57 | 3% | 19% | 1.6 |
| Deliver + Piracy/Tanker | 53 | 2% | 19% | 1.3 |
| Deliver + Escort/Piracy | 52 | 2% | 15% | 1.6 |
| Intercept + Salvage/Survey | 52 | 2% | 17% | 1.3 |
| Deliver + Piracy/Salvage | 50 | 2% | 30% | 1.8 |
| Intercept + Salvage/Tanker | 49 | 2% | 18% | 1.4 |
| Deliver + Escort/Survey | 47 | 2% | 28% | 1.7 |
| Destroy + Escort/Survey | 45 | 2% | 27% | 2 |
| Deliver + Salvage/Tanker | 45 | 2% | 33% | 2 |
| Deliver + Escort/Tanker | 43 | 2% | 28% | 1.8 |
| Deliver + Survey/Tanker | 42 | 2% | 29% | 1.8 |
| Destroy + Salvage/Salvage | 31 | 1% | 16% | 1.4 |
| Destroy + Escort/Escort | 29 | 1% | 21% | 1.5 |
| Intercept + Survey/Survey | 28 | 1% | 18% | 1.4 |
| Intercept + Salvage/Salvage | 27 | 1% | 11% | 1.4 |
| Deliver + Survey/Survey | 25 | 1% | 32% | 1.7 |
| Deliver + Piracy/Piracy | 24 | 1% | 13% | 1.2 |
| Intercept + Tanker/Tanker | 23 | 1% | 4% | 1.4 |
| Destroy + Tanker/Tanker | 22 | 1% | 36% | 1.6 |
| Deliver + Escort/Escort | 21 | 1% | 29% | 1.4 |
| Deliver + Tanker/Tanker | 21 | 1% | 14% | 1.7 |
| Destroy + Piracy/Piracy | 21 | 1% | 19% | 1.8 |
| Intercept + Escort/Escort | 20 | 1% | 5% | 1.5 |
| Intercept + Piracy/Piracy | 20 | 1% | 5% | 1.4 |
| Destroy + Survey/Survey | 17 | 1% | 24% | 1.5 |
| Deliver + Salvage/Salvage | 15 | 1% | 27% | 1.5 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,laser,ballistic_rack,shields,radiator | 773 | 36% | 27% |
| sensor_array,shields,shields,radiator,laser | 770 | 36% | 16% |
| fuel_compressor,shields,shields,radiator,laser | 617 | 29% | 24% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 56 | 15% |
| Destroy | 2314 | 773 | 33% | 58 | 21% |
| Intercept | 2285 | 770 | 34% | 49 | 12% |
| Survey | 1282 | 847 | 66% | 29 | 13% |
| Piracy | 1279 | 872 | 68% | 25 | 10% |
| Tanker | 1292 | 843 | 65% | 14 | 7% |
| Escort | 1327 | 893 | 67% | 30 | 13% |
| Salvage | 1300 | 865 | 67% | 16 | 8% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

