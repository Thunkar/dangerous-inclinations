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
| 3 | 100% | 26 | 30 | 1h18 | 1.2 | 3.7 | 5.8 | 52% | 35% | 16% | 2% | 40% / 28% / 33% | none |
| 4 | 100% | 26 | 30 | 1h44 | 2.7 | 4.2 | 6.5 | 54% | 33% | 22% | 3% | 26% / 21% / 23% / 31% | none |
| 5 | 100% | 27 | 33 | 2h15 | 5.6 | 4.9 | 7.6 | 55% | 32% | 28% | 4% | 18% / 19% / 23% / 18% / 22% | a kill per seat per game |
| 6 | 100% | 27 | 36 | 2h42 | 7.4 | 5.4 | 8.4 | 56% | 32% | 29% | 4% | 19% / 18% / 14% / 18% / 14% / 17% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.54 | 0.59 | 0.63 | 0.66 |
| Won by a seat not leading at round 10 | 77% of 119 | 73% of 116 | 75% of 118 | 84% of 117 |
| First card completed (median round) | 9 | 9 | 9 | 7 |
| Escort markers placed per game | 0.58 | 0.93 | 1.64 | 1.99 |
| Rounds from marker to Escort paid (median) | 7 | 7 | 7 | 7 |
| Wrecks left per game | 1.22 | 2.71 | 5.61 | 7.35 |
| Wrecks salvaged | 31% | 27% | 23% | 27% |
| Piracy seizures per game (crate / data) | 0.21 / 0.45 | 0.44 / 1.09 | 0.66 / 1.98 | 0.92 / 2.32 |
| Sales at a station, per game | 2.88 | 3 | 3.09 | 3.49 |
| Of those, sale named by the player | 100% | 100% | 99% | 100% |
| Fuel pumps per game | 0.44 | 0.33 | 0.4 | 0.39 |
| Turns ending in a planet well | 47% | 40% | 33% | 35% |
| Turns ending in the black hole | 53% | 60% | 68% | 65% |
| Turns ending moored | 9% | 8% | 6% | 7% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 32% | 1.8 |
| Intercept + Escort/Piracy | 79 | 4% | 14% | 1.3 |
| Intercept + Escort/Tanker | 75 | 3% | 27% | 1.6 |
| Destroy + Escort/Tanker | 75 | 3% | 40% | 1.9 |
| Destroy + Survey/Tanker | 73 | 3% | 21% | 1.3 |
| Destroy + Salvage/Survey | 71 | 3% | 13% | 1.3 |
| Intercept + Piracy/Tanker | 71 | 3% | 10% | 1.4 |
| Intercept + Survey/Tanker | 70 | 3% | 16% | 1.5 |
| Intercept + Escort/Salvage | 69 | 3% | 14% | 1.5 |
| Destroy + Piracy/Survey | 68 | 3% | 18% | 1.4 |
| Intercept + Piracy/Salvage | 67 | 3% | 13% | 1.4 |
| Destroy + Escort/Piracy | 66 | 3% | 27% | 1.7 |
| Intercept + Escort/Survey | 63 | 3% | 11% | 1.1 |
| Destroy + Piracy/Salvage | 61 | 3% | 34% | 1.7 |
| Deliver + Piracy/Survey | 60 | 3% | 13% | 1.4 |
| Deliver + Escort/Salvage | 60 | 3% | 17% | 1.5 |
| Deliver + Salvage/Survey | 59 | 3% | 42% | 2 |
| Destroy + Piracy/Tanker | 58 | 3% | 26% | 1.8 |
| Intercept + Piracy/Survey | 57 | 3% | 14% | 1.2 |
| Destroy + Salvage/Tanker | 57 | 3% | 26% | 1.6 |
| Deliver + Piracy/Tanker | 53 | 2% | 25% | 1.5 |
| Deliver + Escort/Piracy | 52 | 2% | 23% | 1.8 |
| Intercept + Salvage/Survey | 52 | 2% | 31% | 1.7 |
| Deliver + Piracy/Salvage | 50 | 2% | 10% | 1.5 |
| Intercept + Salvage/Tanker | 49 | 2% | 22% | 1.7 |
| Deliver + Escort/Survey | 47 | 2% | 26% | 1.7 |
| Destroy + Escort/Survey | 45 | 2% | 13% | 1.6 |
| Deliver + Salvage/Tanker | 45 | 2% | 27% | 1.8 |
| Deliver + Escort/Tanker | 43 | 2% | 33% | 2 |
| Deliver + Survey/Tanker | 42 | 2% | 40% | 1.9 |
| Destroy + Salvage/Salvage | 31 | 1% | 16% | 1.2 |
| Destroy + Escort/Escort | 29 | 1% | 34% | 1.8 |
| Intercept + Survey/Survey | 28 | 1% | 29% | 1.6 |
| Intercept + Salvage/Salvage | 27 | 1% | 15% | 1.7 |
| Deliver + Survey/Survey | 25 | 1% | 36% | 2 |
| Deliver + Piracy/Piracy | 24 | 1% | 4% | 1 |
| Intercept + Tanker/Tanker | 23 | 1% | 13% | 1.4 |
| Destroy + Tanker/Tanker | 22 | 1% | 23% | 1.5 |
| Deliver + Escort/Escort | 21 | 1% | 19% | 1.5 |
| Deliver + Tanker/Tanker | 21 | 1% | 43% | 2 |
| Destroy + Piracy/Piracy | 21 | 1% | 24% | 2 |
| Intercept + Escort/Escort | 20 | 1% | 10% | 1.5 |
| Intercept + Piracy/Piracy | 20 | 1% | 15% | 1.5 |
| Destroy + Survey/Survey | 17 | 1% | 18% | 1.3 |
| Deliver + Salvage/Salvage | 15 | 1% | 33% | 1.9 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,laser,ballistic_rack,shields,radiator | 773 | 36% | 25% |
| sensor_array,shields,shields,radiator,laser | 770 | 36% | 17% |
| fuel_compressor,shields,shields,radiator,laser | 617 | 29% | 25% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 58 | 16% |
| Destroy | 2314 | 773 | 33% | 55 | 20% |
| Intercept | 2285 | 770 | 34% | 53 | 13% |
| Survey | 1282 | 847 | 66% | 28 | 11% |
| Piracy | 1279 | 872 | 68% | 21 | 8% |
| Tanker | 1292 | 843 | 65% | 22 | 12% |
| Escort | 1327 | 893 | 67% | 30 | 13% |
| Salvage | 1300 | 865 | 67% | 15 | 7% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 85% | 3 | 7 / 14 / - | 8 | 58% | 18% |
| Destroy | target hit | 94% | 3 | - | 4 | 55% | 39% |
| Intercept | target scanned | 91% | 2 | 57 / 37 / - | 7 | 53% | 17% |
| Survey | dive made | 83% | 2 | 63 / 49 / - | 11 | 28% | 33% |
| Piracy | item taken | 71% | 6 | 69 / 32 / - | 9 | 21% | 24% |
| Tanker | in a planet's well with 5 fuel | 73% | 12 | 4 / 0 / 213 | 2 | 22% | 12% |
| Escort | marker placed | 56% | 7 | 46 / - / - | 7 | 30% | 13% |
| Salvage | box taken | 45% | 13 | 40 / 23 / - | 8 | 15% | 17% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard (for Escort, the marked ship), a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

