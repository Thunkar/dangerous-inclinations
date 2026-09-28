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
| 3 | 100% | 27 | 33 | 1h21 | 1.5 | 3.6 | 5.7 | 51% | 34% | 15% | 1% | 34% / 29% / 37% | none |
| 4 | 100% | 26 | 33 | 1h44 | 3 | 4.2 | 6.8 | 54% | 33% | 21% | 3% | 30% / 31% / 14% / 25% | seat spread 17% |
| 5 | 100% | 27 | 35 | 2h15 | 5.5 | 4.8 | 7.8 | 55% | 32% | 27% | 4% | 21% / 21% / 13% / 19% / 27% | a kill per seat per game |
| 6 | 100% | 27 | 37 | 2h42 | 7.5 | 5.5 | 9.2 | 54% | 32% | 28% | 4% | 7% / 23% / 21% / 19% / 15% / 16% | a kill per seat per game; seat spread 16% |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.61 | 0.66 | 0.73 | 0.81 |
| Won by a seat not leading at round 10 | 82% of 119 | 75% of 117 | 90% of 118 | 89% of 115 |
| First card completed (median round) | 9 | 9 | 9 | 7 |
| Escort markers placed per game | 0.45 | 0.81 | 1.34 | 1.63 |
| Rounds from marker to Escort paid (median) | 6 | 7 | 7 | 7 |
| Wrecks left per game | 1.46 | 2.97 | 5.5 | 7.53 |
| Wrecks salvaged | 23% | 28% | 24% | 26% |
| Piracy seizures per game (crate / data) | 0.18 / 0.38 | 0.46 / 0.79 | 0.55 / 1.35 | 0.52 / 1.83 |
| Sales at a station, per game | 2.78 | 3.06 | 3.07 | 3.63 |
| Of those, sale named by the player | 100% | 100% | 99% | 100% |
| Fuel pumps per game | 0.35 | 0.33 | 0.35 | 0.39 |
| Turns ending in a planet well | 49% | 42% | 36% | 38% |
| Turns ending in the black hole | 51% | 58% | 64% | 62% |
| Turns ending moored | 9% | 8% | 7% | 7% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 25% | 1.7 |
| Intercept + Escort/Piracy | 79 | 4% | 15% | 1.5 |
| Intercept + Escort/Tanker | 75 | 3% | 21% | 1.5 |
| Destroy + Escort/Tanker | 75 | 3% | 36% | 1.8 |
| Destroy + Survey/Tanker | 73 | 3% | 26% | 1.6 |
| Destroy + Salvage/Survey | 71 | 3% | 20% | 1.3 |
| Intercept + Piracy/Tanker | 71 | 3% | 11% | 1.5 |
| Intercept + Survey/Tanker | 70 | 3% | 21% | 1.9 |
| Intercept + Escort/Salvage | 69 | 3% | 22% | 1.8 |
| Destroy + Piracy/Survey | 68 | 3% | 18% | 1.4 |
| Intercept + Piracy/Salvage | 67 | 3% | 12% | 1.4 |
| Destroy + Escort/Piracy | 66 | 3% | 26% | 1.8 |
| Intercept + Escort/Survey | 63 | 3% | 14% | 1.4 |
| Destroy + Piracy/Salvage | 61 | 3% | 28% | 1.5 |
| Deliver + Piracy/Survey | 60 | 3% | 18% | 1.7 |
| Deliver + Escort/Salvage | 60 | 3% | 17% | 1.9 |
| Deliver + Salvage/Survey | 59 | 3% | 36% | 2.1 |
| Destroy + Piracy/Tanker | 58 | 3% | 24% | 1.7 |
| Intercept + Piracy/Survey | 57 | 3% | 11% | 1.2 |
| Destroy + Salvage/Tanker | 57 | 3% | 19% | 1.4 |
| Deliver + Piracy/Tanker | 53 | 2% | 28% | 1.8 |
| Deliver + Escort/Piracy | 52 | 2% | 12% | 1.6 |
| Intercept + Salvage/Survey | 52 | 2% | 29% | 1.7 |
| Deliver + Piracy/Salvage | 50 | 2% | 24% | 1.9 |
| Intercept + Salvage/Tanker | 49 | 2% | 27% | 1.7 |
| Deliver + Escort/Survey | 47 | 2% | 26% | 1.8 |
| Destroy + Escort/Survey | 45 | 2% | 20% | 1.6 |
| Deliver + Salvage/Tanker | 45 | 2% | 27% | 1.9 |
| Deliver + Escort/Tanker | 43 | 2% | 23% | 1.7 |
| Deliver + Survey/Tanker | 42 | 2% | 48% | 2 |
| Destroy + Salvage/Salvage | 31 | 1% | 19% | 1.6 |
| Destroy + Escort/Escort | 29 | 1% | 34% | 1.8 |
| Intercept + Survey/Survey | 28 | 1% | 36% | 1.9 |
| Intercept + Salvage/Salvage | 27 | 1% | 11% | 1.5 |
| Deliver + Survey/Survey | 25 | 1% | 44% | 2.1 |
| Deliver + Piracy/Piracy | 24 | 1% | 8% | 1 |
| Intercept + Tanker/Tanker | 23 | 1% | 9% | 1.8 |
| Destroy + Tanker/Tanker | 22 | 1% | 9% | 1.2 |
| Deliver + Escort/Escort | 21 | 1% | 24% | 1.6 |
| Deliver + Tanker/Tanker | 21 | 1% | 33% | 2.1 |
| Destroy + Piracy/Piracy | 21 | 1% | 10% | 1.4 |
| Intercept + Escort/Escort | 20 | 1% | 20% | 1.6 |
| Intercept + Piracy/Piracy | 20 | 1% | 10% | 1.5 |
| Destroy + Survey/Survey | 17 | 1% | 29% | 1.8 |
| Deliver + Salvage/Salvage | 15 | 1% | 20% | 1.6 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,laser,ballistic_rack,shields,radiator | 773 | 36% | 24% |
| sensor_array,shields,shields,radiator,laser | 770 | 36% | 18% |
| fuel_compressor,shields,shields,radiator,laser | 617 | 29% | 25% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 71 | 16% |
| Destroy | 2314 | 773 | 33% | 58 | 19% |
| Intercept | 2285 | 770 | 34% | 64 | 14% |
| Survey | 1282 | 847 | 66% | 23 | 12% |
| Piracy | 1279 | 872 | 68% | 14 | 8% |
| Tanker | 1292 | 843 | 65% | 20 | 12% |
| Escort | 1327 | 893 | 67% | 24 | 11% |
| Salvage | 1300 | 865 | 67% | 9 | 6% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 94% | 3 | 7 / 13 / - | 8 | 71% | 17% |
| Destroy | target hit | 94% | 3 | - | 3 | 58% | 36% |
| Intercept | target scanned | 95% | 2 | 58 / 25 / - | 7 | 64% | 14% |
| Survey | dive made | 83% | 2 | 74 / 35 / - | 12 | 23% | 38% |
| Piracy | item taken | 61% | 7 | 62 / 25 / - | 9 | 14% | 20% |
| Tanker | in a planet's well with 5 fuel | 77% | 12 | 5 / 0 / 242 | 2 | 20% | 14% |
| Escort | marker placed | 47% | 9 | 45 / - / - | 7 | 24% | 12% |
| Salvage | box taken | 43% | 14 | 53 / 24 / - | 9 | 9% | 19% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard (for Escort, the marked ship), a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

