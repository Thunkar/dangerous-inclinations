# Benchmark (2026-10-02)

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
| Shields | 2 energy a point absorbed, which comes off the subsystem; its energy is heat every turn it is powered, and absorbing makes none |
| Table time assumes | 1 min per player-turn |

## By seat count

| seats | decided | rounds (median) | rounds (p75) | table time | kills/game | cards/game | points/game | burn | scoop | firing | lost | wins by seat | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 100% | 26 | 33 | 1h18 | 1.7 | 3.6 | 5.7 | 52% | 35% | 16% | 2% | 34% / 32% / 34% | none |
| 4 | 100% | 26 | 32 | 1h44 | 3.7 | 4.1 | 6.6 | 54% | 34% | 22% | 3% | 31% / 22% / 19% / 28% | none |
| 5 | 100% | 28 | 36 | 2h20 | 7 | 5 | 8.2 | 55% | 33% | 28% | 4% | 18% / 18% / 28% / 18% / 18% | a kill per seat per game |
| 6 | 100% | 27 | 33 | 2h42 | 9.6 | 5.4 | 9.1 | 55% | 32% | 30% | 5% | 13% / 22% / 19% / 16% / 17% / 14% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.54 | 0.62 | 0.63 | 0.76 |
| Won by a seat not leading at round 10 | 73% of 120 | 76% of 118 | 87% of 113 | 89% of 119 |
| First card completed (median round) | 9 | 9 | 8 | 7 |
| Escort markers placed per game | 0.49 | 0.91 | 1.41 | 1.79 |
| Rounds from marker to Escort paid (median) | 6 | 7 | 7 | 6 |
| Wrecks left per game | 1.67 | 3.71 | 7.03 | 9.64 |
| Wrecks salvaged | 26% | 26% | 25% | 23% |
| Piracy seizures per game (crate / data) | 0.22 / 0.4 | 0.26 / 0.79 | 0.46 / 1.7 | 0.73 / 2.35 |
| Sales at a station, per game | 2.69 | 2.88 | 3.14 | 3.39 |
| Of those, sale named by the player | 100% | 100% | 100% | 100% |
| Fuel pumps per game | 0.33 | 0.41 | 0.35 | 0.35 |
| Turns ending in a planet well | 44% | 39% | 34% | 33% |
| Turns ending in the black hole | 56% | 61% | 66% | 67% |
| Turns ending moored | 9% | 8% | 7% | 6% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 25% | 1.7 |
| Intercept + Escort/Piracy | 79 | 4% | 18% | 1.4 |
| Intercept + Escort/Tanker | 75 | 3% | 25% | 1.6 |
| Destroy + Escort/Tanker | 75 | 3% | 29% | 1.8 |
| Destroy + Survey/Tanker | 73 | 3% | 23% | 1.6 |
| Destroy + Salvage/Survey | 71 | 3% | 14% | 1.5 |
| Intercept + Piracy/Tanker | 71 | 3% | 10% | 1.3 |
| Intercept + Survey/Tanker | 70 | 3% | 20% | 1.7 |
| Intercept + Escort/Salvage | 69 | 3% | 28% | 1.7 |
| Destroy + Piracy/Survey | 68 | 3% | 13% | 1.5 |
| Intercept + Piracy/Salvage | 67 | 3% | 16% | 1.4 |
| Destroy + Escort/Piracy | 66 | 3% | 23% | 1.7 |
| Intercept + Escort/Survey | 63 | 3% | 29% | 1.6 |
| Destroy + Piracy/Salvage | 61 | 3% | 11% | 1.5 |
| Deliver + Piracy/Survey | 60 | 3% | 8% | 1.5 |
| Deliver + Escort/Salvage | 60 | 3% | 25% | 1.8 |
| Deliver + Salvage/Survey | 59 | 3% | 34% | 2.1 |
| Destroy + Piracy/Tanker | 58 | 3% | 26% | 1.8 |
| Intercept + Piracy/Survey | 57 | 3% | 12% | 1.3 |
| Destroy + Salvage/Tanker | 57 | 3% | 28% | 1.5 |
| Deliver + Piracy/Tanker | 53 | 2% | 17% | 1.6 |
| Deliver + Escort/Piracy | 52 | 2% | 15% | 1.6 |
| Intercept + Salvage/Survey | 52 | 2% | 19% | 1.5 |
| Deliver + Piracy/Salvage | 50 | 2% | 18% | 1.7 |
| Intercept + Salvage/Tanker | 49 | 2% | 24% | 1.9 |
| Deliver + Escort/Survey | 47 | 2% | 32% | 1.9 |
| Destroy + Escort/Survey | 45 | 2% | 18% | 1.7 |
| Deliver + Salvage/Tanker | 45 | 2% | 51% | 2.1 |
| Deliver + Escort/Tanker | 43 | 2% | 35% | 1.9 |
| Deliver + Survey/Tanker | 42 | 2% | 50% | 2.2 |
| Destroy + Salvage/Salvage | 31 | 1% | 19% | 1.6 |
| Destroy + Escort/Escort | 29 | 1% | 28% | 1.7 |
| Intercept + Survey/Survey | 28 | 1% | 21% | 1.8 |
| Intercept + Salvage/Salvage | 27 | 1% | 15% | 1.7 |
| Deliver + Survey/Survey | 25 | 1% | 36% | 1.9 |
| Deliver + Piracy/Piracy | 24 | 1% | 25% | 1.6 |
| Intercept + Tanker/Tanker | 23 | 1% | 17% | 1.5 |
| Destroy + Tanker/Tanker | 22 | 1% | 27% | 1.6 |
| Deliver + Escort/Escort | 21 | 1% | 24% | 1.8 |
| Deliver + Tanker/Tanker | 21 | 1% | 24% | 1.9 |
| Destroy + Piracy/Piracy | 21 | 1% | 5% | 1.3 |
| Intercept + Escort/Escort | 20 | 1% | 10% | 1.1 |
| Intercept + Piracy/Piracy | 20 | 1% | 5% | 0.9 |
| Destroy + Survey/Survey | 17 | 1% | 29% | 1.8 |
| Deliver + Salvage/Salvage | 15 | 1% | 13% | 1.5 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| fuel_compressor,shields,disruptor,radiator,laser | 285 | 13% | 35% |
| railgun,plasma_cannon,ballistic_rack,shields,radiator | 274 | 13% | 17% |
| sensor_array,shields,disruptor,radiator,plasma_cannon | 269 | 12% | 14% |
| sensor_array,missiles,missiles,radiator,shields | 264 | 12% | 21% |
| railgun,laser,ballistic_rack,shields,radiator | 261 | 12% | 25% |
| fuel_compressor,shields,shields,radiator,plasma_cannon | 239 | 11% | 15% |
| railgun,missiles,laser,shields,radiator | 238 | 11% | 22% |
| sensor_array,shields,shields,radiator,laser | 237 | 11% | 22% |
| fuel_compressor,shields,shields,radiator,laser | 93 | 4% | 31% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 70 | 17% |
| Destroy | 2314 | 773 | 33% | 63 | 17% |
| Intercept | 2285 | 770 | 34% | 60 | 15% |
| Survey | 1282 | 847 | 66% | 22 | 10% |
| Piracy | 1279 | 872 | 68% | 12 | 6% |
| Tanker | 1292 | 843 | 65% | 21 | 13% |
| Escort | 1327 | 893 | 67% | 25 | 14% |
| Salvage | 1300 | 865 | 67% | 12 | 7% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 94% | 3 | 8 / 10 / - | 8 | 70% | 17% |
| Destroy | target hit | 93% | 3 | - | 3 | 63% | 30% |
| Intercept | target scanned | 95% | 2 | 71 / 28 / - | 8 | 60% | 19% |
| Survey | dive made | 84% | 1 | 87 / 44 / - | 11 | 22% | 42% |
| Piracy | item taken | 61% | 8 | 79 / 26 / - | 10 | 12% | 24% |
| Tanker | in a planet's well with 5 fuel | 70% | 12 | 3 / 0 / 227 | 2 | 21% | 12% |
| Escort | marker placed | 51% | 12 | 43 / - / - | 6 | 25% | 15% |
| Salvage | box taken | 50% | 14 | 59 / 25 / - | 9 | 12% | 21% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard (for Escort, the marked ship), a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

