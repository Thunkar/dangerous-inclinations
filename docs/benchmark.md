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
| 3 | 100% | 28 | 35 | 1h24 | 1.6 | 3.6 | 5.6 | 52% | 35% | 17% | 2% | 42% / 32% / 27% | seat spread 15% |
| 4 | 100% | 27 | 33 | 1h48 | 3.2 | 4.2 | 6.4 | 54% | 33% | 22% | 3% | 25% / 24% / 25% / 26% | none |
| 5 | 100% | 27 | 35 | 2h15 | 6.2 | 4.7 | 7.2 | 56% | 31% | 29% | 4% | 19% / 19% / 23% / 16% / 23% | a kill per seat per game |
| 6 | 100% | 29 | 39 | 2h54 | 8.7 | 5.5 | 8.3 | 56% | 32% | 30% | 4% | 13% / 14% / 18% / 18% / 14% / 22% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.57 | 0.63 | 0.61 | 0.62 |
| Won by a seat not leading at round 10 | 73% of 119 | 75% of 116 | 77% of 119 | 77% of 119 |
| First card completed (median round) | 9 | 9 | 9 | 7 |
| Escort markers placed per game | 0.58 | 1.01 | 1.62 | 2.16 |
| Rounds from marker to Escort paid (median) | 8 | 7 | 8 | 9 |
| Wrecks left per game | 1.61 | 3.15 | 6.23 | 8.73 |
| Wrecks salvaged | 25% | 26% | 24% | 27% |
| Piracy seizures per game (crate / data) | 0.2 / 0.55 | 0.39 / 1.07 | 0.53 / 1.8 | 0.85 / 2.44 |
| Sales at a station, per game | 2.73 | 2.98 | 2.94 | 3.46 |
| Of those, sale named by the player | 100% | 100% | 99% | 99% |
| Fuel pumps per game | 0.4 | 0.4 | 0.36 | 0.45 |
| Turns ending in a planet well | 46% | 41% | 31% | 34% |
| Turns ending in the black hole | 54% | 60% | 69% | 66% |
| Turns ending moored | 9% | 8% | 6% | 6% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 24% | 1.7 |
| Intercept + Escort/Piracy | 79 | 4% | 10% | 1.3 |
| Intercept + Escort/Tanker | 75 | 3% | 17% | 1.3 |
| Destroy + Escort/Tanker | 75 | 3% | 47% | 2.1 |
| Destroy + Survey/Tanker | 73 | 3% | 19% | 1.3 |
| Destroy + Salvage/Survey | 71 | 3% | 20% | 1.5 |
| Intercept + Piracy/Tanker | 71 | 3% | 11% | 1.3 |
| Intercept + Survey/Tanker | 70 | 3% | 23% | 1.6 |
| Intercept + Escort/Salvage | 69 | 3% | 17% | 1.3 |
| Destroy + Piracy/Survey | 68 | 3% | 18% | 1.4 |
| Intercept + Piracy/Salvage | 67 | 3% | 13% | 1.3 |
| Destroy + Escort/Piracy | 66 | 3% | 33% | 1.9 |
| Intercept + Escort/Survey | 63 | 3% | 10% | 1.3 |
| Destroy + Piracy/Salvage | 61 | 3% | 39% | 1.7 |
| Deliver + Piracy/Survey | 60 | 3% | 13% | 1.3 |
| Deliver + Escort/Salvage | 60 | 3% | 22% | 1.4 |
| Deliver + Salvage/Survey | 59 | 3% | 36% | 1.9 |
| Destroy + Piracy/Tanker | 58 | 3% | 31% | 1.8 |
| Intercept + Piracy/Survey | 57 | 3% | 14% | 1.2 |
| Destroy + Salvage/Tanker | 57 | 3% | 25% | 1.7 |
| Deliver + Piracy/Tanker | 53 | 2% | 15% | 1.3 |
| Deliver + Escort/Piracy | 52 | 2% | 13% | 1.6 |
| Intercept + Salvage/Survey | 52 | 2% | 19% | 1.5 |
| Deliver + Piracy/Salvage | 50 | 2% | 20% | 1.6 |
| Intercept + Salvage/Tanker | 49 | 2% | 12% | 1.3 |
| Deliver + Escort/Survey | 47 | 2% | 28% | 1.6 |
| Destroy + Escort/Survey | 45 | 2% | 13% | 1.7 |
| Deliver + Salvage/Tanker | 45 | 2% | 33% | 1.8 |
| Deliver + Escort/Tanker | 43 | 2% | 35% | 1.9 |
| Deliver + Survey/Tanker | 42 | 2% | 40% | 1.9 |
| Destroy + Salvage/Salvage | 31 | 1% | 23% | 1.6 |
| Destroy + Escort/Escort | 29 | 1% | 28% | 1.5 |
| Intercept + Survey/Survey | 28 | 1% | 21% | 1.3 |
| Intercept + Salvage/Salvage | 27 | 1% | 11% | 1.5 |
| Deliver + Survey/Survey | 25 | 1% | 40% | 2 |
| Deliver + Piracy/Piracy | 24 | 1% | 8% | 1.1 |
| Intercept + Tanker/Tanker | 23 | 1% | 26% | 1.7 |
| Destroy + Tanker/Tanker | 22 | 1% | 32% | 1.4 |
| Deliver + Escort/Escort | 21 | 1% | 10% | 1.2 |
| Deliver + Tanker/Tanker | 21 | 1% | 57% | 2.1 |
| Destroy + Piracy/Piracy | 21 | 1% | 10% | 1.3 |
| Intercept + Escort/Escort | 20 | 1% | 5% | 1.3 |
| Intercept + Piracy/Piracy | 20 | 1% | 20% | 1.5 |
| Destroy + Survey/Survey | 17 | 1% | 35% | 1.7 |
| Deliver + Salvage/Salvage | 15 | 1% | 20% | 1.4 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,laser,ballistic_rack,shields,radiator | 773 | 36% | 27% |
| sensor_array,shields,shields,radiator,laser | 770 | 36% | 15% |
| fuel_compressor,shields,shields,radiator,laser | 617 | 29% | 25% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 55 | 16% |
| Destroy | 2314 | 773 | 33% | 57 | 21% |
| Intercept | 2285 | 770 | 34% | 49 | 12% |
| Survey | 1282 | 847 | 66% | 27 | 11% |
| Piracy | 1279 | 872 | 68% | 22 | 9% |
| Tanker | 1292 | 843 | 65% | 23 | 13% |
| Escort | 1327 | 893 | 67% | 29 | 11% |
| Salvage | 1300 | 865 | 67% | 14 | 7% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 83% | 3 | 9 / 14 / - | 8 | 55% | 16% |
| Destroy | target hit | 94% | 3 | - | 4 | 57% | 37% |
| Intercept | target scanned | 92% | 2 | 63 / 36 / - | 7 | 49% | 18% |
| Survey | dive made | 82% | 2 | 70 / 49 / - | 11 | 27% | 32% |
| Piracy | item taken | 69% | 6 | 71 / 28 / - | 9 | 22% | 22% |
| Tanker | in a planet's well with 5 fuel | 72% | 12 | 4 / 0 / 216 | 2 | 23% | 11% |
| Escort | marker placed | 58% | 7 | 49 / - / - | 8 | 29% | 15% |
| Salvage | box taken | 48% | 14 | 53 / 26 / - | 8 | 14% | 19% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard (for Escort, the marked ship), a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

