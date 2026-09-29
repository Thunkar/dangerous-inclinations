# Benchmark (2026-09-29)

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
| 3 | 100% | 26 | 30 | 1h18 | 1.7 | 3.7 | 6 | 52% | 34% | 16% | 2% | 33% / 30% / 38% | none |
| 4 | 100% | 27 | 33 | 1h48 | 3.7 | 4.4 | 7.1 | 54% | 33% | 23% | 3% | 33% / 26% / 19% / 23% | none |
| 5 | 100% | 27 | 34 | 2h15 | 6.5 | 4.7 | 7.8 | 56% | 31% | 29% | 5% | 23% / 17% / 16% / 19% / 26% | a kill per seat per game |
| 6 | 100% | 27 | 36 | 2h42 | 9.1 | 5.4 | 9 | 56% | 31% | 31% | 5% | 18% / 11% / 21% / 14% / 20% / 17% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.62 | 0.59 | 0.68 | 0.77 |
| Won by a seat not leading at round 10 | 79% of 120 | 72% of 119 | 80% of 114 | 85% of 119 |
| First card completed (median round) | 9 | 8 | 6 | 6 |
| Escort markers placed per game | 0.45 | 0.89 | 1.52 | 1.65 |
| Rounds from marker to Escort paid (median) | 6 | 7 | 8 | 7 |
| Wrecks left per game | 1.71 | 3.68 | 6.53 | 9.1 |
| Wrecks salvaged | 21% | 29% | 26% | 27% |
| Piracy seizures per game (crate / data) | 0.18 / 0.37 | 0.41 / 0.82 | 0.56 / 1.57 | 0.76 / 2.13 |
| Sales at a station, per game | 2.72 | 2.94 | 2.91 | 3.4 |
| Of those, sale named by the player | 100% | 100% | 100% | 100% |
| Fuel pumps per game | 0.37 | 0.36 | 0.38 | 0.35 |
| Turns ending in a planet well | 47% | 39% | 33% | 36% |
| Turns ending in the black hole | 53% | 61% | 67% | 64% |
| Turns ending moored | 9% | 8% | 7% | 6% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 30% | 1.8 |
| Intercept + Escort/Piracy | 79 | 4% | 11% | 1.3 |
| Intercept + Escort/Tanker | 75 | 3% | 19% | 1.5 |
| Destroy + Escort/Tanker | 75 | 3% | 45% | 2 |
| Destroy + Survey/Tanker | 73 | 3% | 30% | 1.8 |
| Destroy + Salvage/Survey | 71 | 3% | 23% | 1.5 |
| Intercept + Piracy/Tanker | 71 | 3% | 15% | 1.6 |
| Intercept + Survey/Tanker | 70 | 3% | 13% | 1.5 |
| Intercept + Escort/Salvage | 69 | 3% | 19% | 1.6 |
| Destroy + Piracy/Survey | 68 | 3% | 16% | 1.5 |
| Intercept + Piracy/Salvage | 67 | 3% | 15% | 1.5 |
| Destroy + Escort/Piracy | 66 | 3% | 26% | 1.8 |
| Intercept + Escort/Survey | 63 | 3% | 14% | 1.4 |
| Destroy + Piracy/Salvage | 61 | 3% | 26% | 1.8 |
| Deliver + Piracy/Survey | 60 | 3% | 17% | 1.6 |
| Deliver + Escort/Salvage | 60 | 3% | 15% | 1.6 |
| Deliver + Salvage/Survey | 59 | 3% | 27% | 1.9 |
| Destroy + Piracy/Tanker | 58 | 3% | 36% | 2.1 |
| Intercept + Piracy/Survey | 57 | 3% | 9% | 1.1 |
| Destroy + Salvage/Tanker | 57 | 3% | 40% | 1.9 |
| Deliver + Piracy/Tanker | 53 | 2% | 19% | 1.7 |
| Deliver + Escort/Piracy | 52 | 2% | 10% | 1.6 |
| Intercept + Salvage/Survey | 52 | 2% | 19% | 1.6 |
| Deliver + Piracy/Salvage | 50 | 2% | 18% | 1.7 |
| Intercept + Salvage/Tanker | 49 | 2% | 16% | 1.5 |
| Deliver + Escort/Survey | 47 | 2% | 23% | 1.8 |
| Destroy + Escort/Survey | 45 | 2% | 36% | 1.8 |
| Deliver + Salvage/Tanker | 45 | 2% | 29% | 1.9 |
| Deliver + Escort/Tanker | 43 | 2% | 26% | 1.7 |
| Deliver + Survey/Tanker | 42 | 2% | 40% | 1.9 |
| Destroy + Salvage/Salvage | 31 | 1% | 16% | 1.5 |
| Destroy + Escort/Escort | 29 | 1% | 34% | 2.1 |
| Intercept + Survey/Survey | 28 | 1% | 39% | 2 |
| Intercept + Salvage/Salvage | 27 | 1% | 15% | 1.3 |
| Deliver + Survey/Survey | 25 | 1% | 36% | 1.8 |
| Deliver + Piracy/Piracy | 24 | 1% | 8% | 1.2 |
| Intercept + Tanker/Tanker | 23 | 1% | 0% | 1.4 |
| Destroy + Tanker/Tanker | 22 | 1% | 27% | 1.5 |
| Deliver + Escort/Escort | 21 | 1% | 19% | 1.5 |
| Deliver + Tanker/Tanker | 21 | 1% | 29% | 1.6 |
| Destroy + Piracy/Piracy | 21 | 1% | 19% | 1.7 |
| Intercept + Escort/Escort | 20 | 1% | 20% | 1.8 |
| Intercept + Piracy/Piracy | 20 | 1% | 5% | 1.1 |
| Destroy + Survey/Survey | 17 | 1% | 18% | 1.8 |
| Deliver + Salvage/Salvage | 15 | 1% | 13% | 1.2 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,laser,ballistic_rack,shields,radiator | 773 | 36% | 29% |
| sensor_array,shields,shields,radiator,laser | 770 | 36% | 15% |
| fuel_compressor,shields,shields,radiator,laser | 617 | 29% | 22% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 66 | 14% |
| Destroy | 2314 | 773 | 33% | 68 | 24% |
| Intercept | 2285 | 770 | 34% | 60 | 12% |
| Survey | 1282 | 847 | 66% | 21 | 10% |
| Piracy | 1279 | 872 | 68% | 13 | 8% |
| Tanker | 1292 | 843 | 65% | 21 | 13% |
| Escort | 1327 | 893 | 67% | 24 | 12% |
| Salvage | 1300 | 865 | 67% | 12 | 7% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 94% | 3 | 8 / 15 / - | 8 | 66% | 18% |
| Destroy | target hit | 96% | 3 | - | 3 | 68% | 28% |
| Intercept | target scanned | 95% | 2 | 67 / 27 / - | 8 | 60% | 16% |
| Survey | dive made | 83% | 2 | 76 / 41 / - | 10 | 21% | 39% |
| Piracy | item taken | 62% | 7 | 75 / 27 / - | 9 | 13% | 21% |
| Tanker | in a planet's well with 5 fuel | 74% | 12 | 3 / 0 / 215 | 2 | 21% | 14% |
| Escort | marker placed | 49% | 9 | 52 / - / - | 7 | 24% | 12% |
| Salvage | box taken | 49% | 14 | 63 / 25 / - | 8 | 12% | 22% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard (for Escort, the marked ship), a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

