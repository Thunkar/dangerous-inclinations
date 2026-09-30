# Benchmark (2026-09-30)

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
| 3 | 100% | 26 | 33 | 1h18 | 1.9 | 3.6 | 5.8 | 52% | 34% | 18% | 2% | 35% / 26% / 39% | none |
| 4 | 100% | 27 | 36 | 1h48 | 4.3 | 4.2 | 6.9 | 53% | 34% | 24% | 3% | 30% / 23% / 23% / 23% | a kill per seat per game |
| 5 | 100% | 27 | 36 | 2h15 | 7.6 | 4.8 | 7.9 | 55% | 32% | 29% | 5% | 22% / 19% / 23% / 20% / 17% | a kill per seat per game |
| 6 | 100% | 30 | 38 | 3h00 | 10.3 | 5.4 | 8.9 | 55% | 33% | 31% | 5% | 13% / 16% / 18% / 24% / 15% / 15% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.6 | 0.66 | 0.68 | 0.75 |
| Won by a seat not leading at round 10 | 82% of 119 | 72% of 119 | 85% of 116 | 87% of 119 |
| First card completed (median round) | 9 | 9 | 8 | 9 |
| Escort markers placed per game | 0.45 | 0.99 | 1.51 | 1.93 |
| Rounds from marker to Escort paid (median) | 5 | 6 | 8 | 8 |
| Wrecks left per game | 1.93 | 4.29 | 7.62 | 10.33 |
| Wrecks salvaged | 20% | 27% | 25% | 26% |
| Piracy seizures per game (crate / data) | 0.12 / 0.37 | 0.41 / 0.83 | 0.63 / 1.9 | 0.83 / 2.53 |
| Sales at a station, per game | 2.68 | 2.94 | 2.98 | 3.43 |
| Of those, sale named by the player | 100% | 100% | 100% | 100% |
| Fuel pumps per game | 0.38 | 0.37 | 0.44 | 0.35 |
| Turns ending in a planet well | 44% | 37% | 32% | 33% |
| Turns ending in the black hole | 56% | 63% | 68% | 67% |
| Turns ending moored | 9% | 8% | 6% | 6% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 25% | 1.8 |
| Intercept + Escort/Piracy | 79 | 4% | 11% | 1.3 |
| Intercept + Escort/Tanker | 75 | 3% | 27% | 1.6 |
| Destroy + Escort/Tanker | 75 | 3% | 37% | 1.9 |
| Destroy + Survey/Tanker | 73 | 3% | 27% | 1.6 |
| Destroy + Salvage/Survey | 71 | 3% | 14% | 1.5 |
| Intercept + Piracy/Tanker | 71 | 3% | 14% | 1.5 |
| Intercept + Survey/Tanker | 70 | 3% | 23% | 1.7 |
| Intercept + Escort/Salvage | 69 | 3% | 10% | 1.5 |
| Destroy + Piracy/Survey | 68 | 3% | 18% | 1.5 |
| Intercept + Piracy/Salvage | 67 | 3% | 15% | 1.4 |
| Destroy + Escort/Piracy | 66 | 3% | 27% | 1.7 |
| Intercept + Escort/Survey | 63 | 3% | 16% | 1.4 |
| Destroy + Piracy/Salvage | 61 | 3% | 23% | 1.8 |
| Deliver + Piracy/Survey | 60 | 3% | 28% | 1.8 |
| Deliver + Escort/Salvage | 60 | 3% | 23% | 1.6 |
| Deliver + Salvage/Survey | 59 | 3% | 27% | 1.8 |
| Destroy + Piracy/Tanker | 58 | 3% | 31% | 1.9 |
| Intercept + Piracy/Survey | 57 | 3% | 23% | 1.4 |
| Destroy + Salvage/Tanker | 57 | 3% | 35% | 1.8 |
| Deliver + Piracy/Tanker | 53 | 2% | 19% | 1.6 |
| Deliver + Escort/Piracy | 52 | 2% | 12% | 1.8 |
| Intercept + Salvage/Survey | 52 | 2% | 15% | 1.3 |
| Deliver + Piracy/Salvage | 50 | 2% | 16% | 1.6 |
| Intercept + Salvage/Tanker | 49 | 2% | 12% | 1.6 |
| Deliver + Escort/Survey | 47 | 2% | 21% | 1.7 |
| Destroy + Escort/Survey | 45 | 2% | 33% | 1.9 |
| Deliver + Salvage/Tanker | 45 | 2% | 36% | 1.8 |
| Deliver + Escort/Tanker | 43 | 2% | 30% | 1.8 |
| Deliver + Survey/Tanker | 42 | 2% | 48% | 2.1 |
| Destroy + Salvage/Salvage | 31 | 1% | 10% | 1.3 |
| Destroy + Escort/Escort | 29 | 1% | 14% | 1.7 |
| Intercept + Survey/Survey | 28 | 1% | 36% | 2 |
| Intercept + Salvage/Salvage | 27 | 1% | 11% | 1.5 |
| Deliver + Survey/Survey | 25 | 1% | 48% | 2 |
| Deliver + Piracy/Piracy | 24 | 1% | 4% | 1.3 |
| Intercept + Tanker/Tanker | 23 | 1% | 9% | 1.5 |
| Destroy + Tanker/Tanker | 22 | 1% | 32% | 1.8 |
| Deliver + Escort/Escort | 21 | 1% | 5% | 1.2 |
| Deliver + Tanker/Tanker | 21 | 1% | 38% | 1.8 |
| Destroy + Piracy/Piracy | 21 | 1% | 19% | 1.6 |
| Intercept + Escort/Escort | 20 | 1% | 20% | 1.6 |
| Intercept + Piracy/Piracy | 20 | 1% | 10% | 1.5 |
| Destroy + Survey/Survey | 17 | 1% | 18% | 1.9 |
| Deliver + Salvage/Salvage | 15 | 1% | 13% | 1.4 |

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
| Deliver | 1881 | 617 | 33% | 68 | 16% |
| Destroy | 2314 | 773 | 33% | 66 | 20% |
| Intercept | 2285 | 770 | 34% | 60 | 13% |
| Survey | 1282 | 847 | 66% | 23 | 12% |
| Piracy | 1279 | 872 | 68% | 12 | 8% |
| Tanker | 1292 | 843 | 65% | 22 | 14% |
| Escort | 1327 | 893 | 67% | 23 | 11% |
| Salvage | 1300 | 865 | 67% | 9 | 5% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 93% | 3 | 12 / 11 / - | 8 | 68% | 17% |
| Destroy | target hit | 94% | 3 | - | 4 | 66% | 28% |
| Intercept | target scanned | 96% | 2 | 73 / 27 / - | 8 | 60% | 17% |
| Survey | dive made | 84% | 1 | 98 / 49 / - | 12 | 23% | 38% |
| Piracy | item taken | 60% | 7 | 93 / 33 / - | 10 | 12% | 21% |
| Tanker | in a planet's well with 5 fuel | 71% | 12 | 3 / 0 / 233 | 2 | 22% | 14% |
| Escort | marker placed | 52% | 10 | 57 / - / - | 7 | 23% | 13% |
| Salvage | box taken | 49% | 13 | 81 / 29 / - | 9 | 9% | 21% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard (for Escort, the marked ship), a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

