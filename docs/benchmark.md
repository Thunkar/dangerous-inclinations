# Benchmark (2026-11-10)

120 games per seat count, seeds 20000+, bots choosing their own hands and hulls.

**Rules in force**

| rule | value |
|---|---|
| Points to win | 3 |
| Card values | Deliver 2, Destroy 2, Intercept 2, Survey 1, Piracy 1, Tanker 1, Escort 1, Salvage 1 |
| Hold | no limit; a pirate names the item it seizes |
| Stations | each buys one item from each player, once |
| The deal | 3 primaries keep 1; 3 secondaries keep any 2 from a shuffled pile of Survey, Piracy, Tanker, Escort, Salvage |
| Seats allowed | 3–6 |
| Drift | black hole 8/6/4/2/1, planet 6/4/2/1 (station on planet ring 2) |
| Starting hull | 10 |
| Heat track | 10; above it is hull damage, then dissipate 5 (+2 per radiator) and carry the rest |
| Shields | 1 or 2 energy, 1 point absorbed a cube, which is spent until that player's turn ends; its energy is heat every turn it is powered, and every point absorbed is heat too |
| Ballistic rack | rolls at up to 4 missiles a turn while powered; answering is 2 heat on the track, however many |
| Table time assumes | 1 min per player-turn |

## By seat count

| seats | decided | rounds (median) | rounds (p75) | table time | kills/game | cards/game | points/game | burn | scoop | firing | lost | wins by seat | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 100% | 26 | 32 | 1h18 | 2.2 | 3.6 | 5.7 | 51% | 35% | 17% | 3% | 38% / 33% / 29% | none |
| 4 | 100% | 27 | 34 | 1h48 | 5.7 | 4.1 | 6.7 | 55% | 33% | 24% | 4% | 29% / 28% / 21% / 23% | a kill per seat per game |
| 5 | 100% | 32 | 44 | 2h40 | 10.8 | 4.7 | 7.7 | 56% | 33% | 28% | 6% | 19% / 20% / 19% / 20% / 22% | a kill per seat per game |
| 6 | 100% | 29 | 37 | 2h54 | 12.2 | 5.1 | 8.6 | 57% | 32% | 31% | 6% | 12% / 15% / 27% / 18% / 17% / 13% | a kill per seat per game; seat spread 15% |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.49 | 0.65 | 0.64 | 0.74 |
| Won by a seat not leading at round 10 | 69% of 119 | 75% of 118 | 79% of 119 | 86% of 118 |
| First card completed (median round) | 9 | 9 | 8 | 8 |
| Escort markers per game: placed / paid / released (carrier died, escort died) | 1.63 / 0.21 / 0.86 (0.29, 0.57) | 3.4 / 0.26 / 2.37 (1.03, 1.33) | 6.22 / 0.2 / 5.06 (2.3, 2.76) | 7.28 / 0.22 / 5.9 (2.71, 3.19) |
| Marked sales with the escort out of the well, per game | 0.7 | 0.75 | 0.98 | 1.08 |
| Rounds from marker to Escort paid (median) | 7 | 5 | 4 | 5 |
| Wrecks left per game | 2.19 | 5.7 | 10.78 | 12.19 |
| Wrecks salvaged | 33% | 32% | 28% | 32% |
| Piracy seizures per game (crate / data) | 0.41 / 0.42 | 2.38 / 1.13 | 2.25 / 2.27 | 2.33 / 2.45 |
| Sales at a station, per game | 2.88 | 2.91 | 3.13 | 3.45 |
| Of those, sale named by the player | 100% | 100% | 100% | 100% |
| Fuel pumps per game | 0.43 | 0.31 | 0.42 | 0.38 |
| Turns ending in a planet well | 46% | 37% | 31% | 32% |
| Turns ending in the black hole | 54% | 63% | 69% | 68% |
| Turns ending moored | 10% | 8% | 6% | 6% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 20% | 1.6 |
| Intercept + Escort/Piracy | 79 | 4% | 9% | 1 |
| Intercept + Escort/Tanker | 75 | 3% | 15% | 1.3 |
| Destroy + Escort/Tanker | 75 | 3% | 20% | 1.4 |
| Destroy + Survey/Tanker | 73 | 3% | 36% | 1.7 |
| Destroy + Salvage/Survey | 71 | 3% | 25% | 1.7 |
| Intercept + Piracy/Tanker | 71 | 3% | 11% | 1.2 |
| Intercept + Survey/Tanker | 70 | 3% | 16% | 1.4 |
| Intercept + Escort/Salvage | 69 | 3% | 25% | 1.6 |
| Destroy + Piracy/Survey | 68 | 3% | 21% | 1.7 |
| Intercept + Piracy/Salvage | 67 | 3% | 16% | 1.5 |
| Destroy + Escort/Piracy | 66 | 3% | 23% | 2 |
| Intercept + Escort/Survey | 63 | 3% | 14% | 1.2 |
| Destroy + Piracy/Salvage | 61 | 3% | 23% | 1.7 |
| Deliver + Piracy/Survey | 60 | 3% | 17% | 1.6 |
| Deliver + Escort/Salvage | 60 | 3% | 38% | 2.2 |
| Deliver + Salvage/Survey | 59 | 3% | 41% | 2.1 |
| Destroy + Piracy/Tanker | 58 | 3% | 19% | 1.7 |
| Intercept + Piracy/Survey | 57 | 3% | 11% | 1.2 |
| Destroy + Salvage/Tanker | 57 | 3% | 40% | 1.8 |
| Deliver + Piracy/Tanker | 53 | 2% | 34% | 1.8 |
| Deliver + Escort/Piracy | 52 | 2% | 13% | 1.6 |
| Intercept + Salvage/Survey | 52 | 2% | 17% | 1.5 |
| Deliver + Piracy/Salvage | 50 | 2% | 20% | 1.7 |
| Intercept + Salvage/Tanker | 49 | 2% | 16% | 1.5 |
| Deliver + Escort/Survey | 47 | 2% | 32% | 1.8 |
| Destroy + Escort/Survey | 45 | 2% | 11% | 1.4 |
| Deliver + Salvage/Tanker | 45 | 2% | 44% | 2.1 |
| Deliver + Escort/Tanker | 43 | 2% | 35% | 1.8 |
| Deliver + Survey/Tanker | 42 | 2% | 38% | 1.7 |
| Destroy + Salvage/Salvage | 31 | 1% | 32% | 2.2 |
| Destroy + Escort/Escort | 29 | 1% | 7% | 1.3 |
| Intercept + Survey/Survey | 28 | 1% | 25% | 1.4 |
| Intercept + Salvage/Salvage | 27 | 1% | 15% | 1.7 |
| Deliver + Survey/Survey | 25 | 1% | 32% | 1.7 |
| Deliver + Piracy/Piracy | 24 | 1% | 4% | 1 |
| Intercept + Tanker/Tanker | 23 | 1% | 17% | 1.4 |
| Destroy + Tanker/Tanker | 22 | 1% | 18% | 1.5 |
| Deliver + Escort/Escort | 21 | 1% | 24% | 1.5 |
| Deliver + Tanker/Tanker | 21 | 1% | 29% | 1.4 |
| Destroy + Piracy/Piracy | 21 | 1% | 14% | 1.9 |
| Intercept + Escort/Escort | 20 | 1% | 15% | 1 |
| Intercept + Piracy/Piracy | 20 | 1% | 10% | 1.6 |
| Destroy + Survey/Survey | 17 | 1% | 24% | 1.6 |
| Deliver + Salvage/Salvage | 15 | 1% | 33% | 2 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| fuel_compressor,ballistic_rack,ballistic_rack,shields,radiator | 350 | 16% | 23% |
| railgun,plasma_cannon,plasma_cannon,laser,radiator | 274 | 13% | 21% |
| sensor_array,missiles,missiles,radiator,shields | 264 | 12% | 19% |
| missiles,laser,laser,laser,radiator | 238 | 11% | 28% |
| sensor_array,laser,ballistic_rack,shields,radiator | 237 | 11% | 13% |
| fuel_compressor,missiles,missiles,radiator,shields | 179 | 8% | 40% |
| sensor_array,shields,shields,radiator,laser | 155 | 7% | 15% |
| disruptor,plasma_cannon,plasma_cannon,shields,radiator | 149 | 7% | 15% |
| sensor_array,shields,disruptor,radiator,plasma_cannon | 114 | 5% | 12% |
| railgun,laser,ballistic_rack,shields,radiator | 112 | 5% | 30% |
| fuel_compressor,disruptor,laser,plasma_cannon,radiator | 63 | 3% | 35% |
| fuel_compressor,shields,shields,radiator,laser | 25 | 1% | 32% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 68 | 19% |
| Destroy | 2314 | 773 | 33% | 65 | 19% |
| Intercept | 2285 | 770 | 34% | 55 | 12% |
| Survey | 1282 | 847 | 66% | 21 | 11% |
| Piracy | 1279 | 872 | 68% | 12 | 7% |
| Tanker | 1292 | 843 | 65% | 22 | 12% |
| Escort | 1327 | 893 | 67% | 12 | 6% |
| Salvage | 1300 | 865 | 67% | 20 | 14% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 93% | 3 | 13 / 10 / - | 8 | 68% | 18% |
| Destroy | target hit | 92% | 3 | - | 3 | 65% | 26% |
| Intercept | target scanned | 95% | 2 | 71 / 32 / - | 8 | 55% | 16% |
| Survey | dive made | 85% | 1 | 112 / 49 / - | 12 | 21% | 38% |
| Piracy | item taken | 70% | 8 | 93 / 136 / - | 8 | 12% | 21% |
| Tanker | in a planet's well with 5 fuel | 71% | 12 | 6 / 0 / 226 | 2 | 22% | 11% |
| Escort | marker placed | 94% | 5 | 112 / 90 / 50 | 5 | 12% | 47% |
| Salvage | box taken | 69% | 12 | 95 / 27 / - | 8 | 20% | 26% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard, a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. Escort's three are its own: the escort destroyed, the marked ship destroyed (either way the marker comes back) and the marked ship selling with the escort out of its well (the marker stays out). The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

