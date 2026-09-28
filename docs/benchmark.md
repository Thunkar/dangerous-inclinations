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
| 3 | 100% | 27 | 36 | 1h21 | 1.7 | 3.6 | 5.6 | 53% | 34% | 17% | 2% | 41% / 33% / 26% | none |
| 4 | 100% | 26 | 34 | 1h44 | 3.3 | 4.1 | 6.3 | 54% | 34% | 22% | 3% | 30% / 23% / 29% / 18% | none |
| 5 | 100% | 27 | 36 | 2h15 | 6.4 | 4.6 | 7.1 | 56% | 32% | 28% | 4% | 18% / 17% / 24% / 24% / 18% | a kill per seat per game |
| 6 | 100% | 27 | 39 | 2h42 | 9.2 | 5.3 | 8.2 | 56% | 32% | 30% | 4% | 15% / 20% / 18% / 18% / 11% / 18% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.74 | 0.79 | 0.76 | 0.86 |
| Won by a seat not leading at round 10 | 64% of 119 | 73% of 115 | 67% of 119 | 77% of 119 |
| First card completed (median round) | 8 | 8 | 6 | 6 |
| Escort markers placed per game | 0.62 | 1.02 | 1.55 | 2.05 |
| Rounds from marker to Escort paid (median) | 8 | 7 | 8 | 7 |
| Wrecks left per game | 1.7 | 3.28 | 6.43 | 9.23 |
| Wrecks salvaged | 26% | 27% | 25% | 27% |
| Piracy seizures per game (crate / data) | 0.19 / 0.54 | 0.38 / 1.08 | 0.48 / 1.88 | 0.87 / 2.44 |
| Sales at a station, per game | 2.69 | 2.91 | 2.96 | 3.39 |
| Of those, sale named by the player | 100% | 100% | 100% | 100% |
| Fuel pumps per game | 0.41 | 0.41 | 0.36 | 0.46 |
| Turns ending in a planet well | 43% | 38% | 31% | 32% |
| Turns ending in the black hole | 57% | 62% | 69% | 68% |
| Turns ending moored | 8% | 7% | 6% | 6% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 29% | 1.8 |
| Intercept + Escort/Piracy | 79 | 4% | 8% | 1.2 |
| Intercept + Escort/Tanker | 75 | 3% | 13% | 1.3 |
| Destroy + Escort/Tanker | 75 | 3% | 33% | 1.8 |
| Destroy + Survey/Tanker | 73 | 3% | 16% | 1.2 |
| Destroy + Salvage/Survey | 71 | 3% | 20% | 1.3 |
| Intercept + Piracy/Tanker | 71 | 3% | 15% | 1.4 |
| Intercept + Survey/Tanker | 70 | 3% | 20% | 1.6 |
| Intercept + Escort/Salvage | 69 | 3% | 16% | 1.3 |
| Destroy + Piracy/Survey | 68 | 3% | 24% | 1.5 |
| Intercept + Piracy/Salvage | 67 | 3% | 15% | 1.3 |
| Destroy + Escort/Piracy | 66 | 3% | 24% | 1.8 |
| Intercept + Escort/Survey | 63 | 3% | 14% | 1.3 |
| Destroy + Piracy/Salvage | 61 | 3% | 31% | 1.6 |
| Deliver + Piracy/Survey | 60 | 3% | 8% | 1.3 |
| Deliver + Escort/Salvage | 60 | 3% | 12% | 1.3 |
| Deliver + Salvage/Survey | 59 | 3% | 25% | 1.8 |
| Destroy + Piracy/Tanker | 58 | 3% | 29% | 1.6 |
| Intercept + Piracy/Survey | 57 | 3% | 18% | 1.1 |
| Destroy + Salvage/Tanker | 57 | 3% | 30% | 1.7 |
| Deliver + Piracy/Tanker | 53 | 2% | 36% | 1.6 |
| Deliver + Escort/Piracy | 52 | 2% | 12% | 1.5 |
| Intercept + Salvage/Survey | 52 | 2% | 19% | 1.4 |
| Deliver + Piracy/Salvage | 50 | 2% | 26% | 1.6 |
| Intercept + Salvage/Tanker | 49 | 2% | 14% | 1.3 |
| Deliver + Escort/Survey | 47 | 2% | 30% | 1.6 |
| Destroy + Escort/Survey | 45 | 2% | 13% | 1.7 |
| Deliver + Salvage/Tanker | 45 | 2% | 51% | 2.1 |
| Deliver + Escort/Tanker | 43 | 2% | 44% | 2.1 |
| Deliver + Survey/Tanker | 42 | 2% | 52% | 2 |
| Destroy + Salvage/Salvage | 31 | 1% | 16% | 1.4 |
| Destroy + Escort/Escort | 29 | 1% | 21% | 1.6 |
| Intercept + Survey/Survey | 28 | 1% | 29% | 1.5 |
| Intercept + Salvage/Salvage | 27 | 1% | 11% | 1.4 |
| Deliver + Survey/Survey | 25 | 1% | 44% | 2.2 |
| Deliver + Piracy/Piracy | 24 | 1% | 4% | 0.8 |
| Intercept + Tanker/Tanker | 23 | 1% | 13% | 1.5 |
| Destroy + Tanker/Tanker | 22 | 1% | 27% | 1.5 |
| Deliver + Escort/Escort | 21 | 1% | 0% | 1 |
| Deliver + Tanker/Tanker | 21 | 1% | 62% | 2.2 |
| Destroy + Piracy/Piracy | 21 | 1% | 24% | 1.7 |
| Intercept + Escort/Escort | 20 | 1% | 15% | 1.5 |
| Intercept + Piracy/Piracy | 20 | 1% | 15% | 1.7 |
| Destroy + Survey/Survey | 17 | 1% | 18% | 1.2 |
| Deliver + Salvage/Salvage | 15 | 1% | 27% | 1.4 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,laser,ballistic_rack,shields,radiator | 773 | 36% | 25% |
| sensor_array,shields,shields,radiator,laser | 770 | 36% | 15% |
| fuel_compressor,shields,shields,radiator,laser | 617 | 29% | 28% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 53 | 18% |
| Destroy | 2314 | 773 | 33% | 56 | 20% |
| Intercept | 2285 | 770 | 34% | 49 | 12% |
| Survey | 1282 | 847 | 66% | 25 | 11% |
| Piracy | 1279 | 872 | 68% | 21 | 9% |
| Tanker | 1292 | 843 | 65% | 23 | 14% |
| Escort | 1327 | 893 | 67% | 28 | 10% |
| Salvage | 1300 | 865 | 67% | 16 | 8% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 82% | 3 | 7 / 13 / - | 9 | 53% | 20% |
| Destroy | target hit | 94% | 3 | - | 4 | 56% | 38% |
| Intercept | target scanned | 93% | 2 | 64 / 36 / - | 7 | 49% | 20% |
| Survey | dive made | 82% | 2 | 70 / 49 / - | 11 | 25% | 33% |
| Piracy | item taken | 69% | 6 | 78 / 27 / - | 8 | 21% | 20% |
| Tanker | in a planet's well with 6 fuel | 65% | 12 | 2 / 0 / 148 | 3 | 23% | 8% |
| Escort | marker placed | 57% | 7 | 47 / - / - | 7 | 28% | 15% |
| Salvage | box taken | 48% | 14 | 58 / 29 / - | 8 | 16% | 17% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard (for Escort, the marked ship), a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

