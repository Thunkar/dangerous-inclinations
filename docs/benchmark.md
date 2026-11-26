# Benchmark (2026-11-26)

120 games per seat count, seeds 20000+, bots choosing their own hands and hulls.

**Rules in force**

| rule | value |
|---|---|
| Points to win | 3 |
| Card values | Deliver 2, Destroy 2, Intercept 2, Survey 1, Piracy 1, Tanker 1, Escort 1, Salvage 1 |
| Hold | no limit; a pirate names the item it seizes |
| Stations | each buys one item from each player, once |
| The deal | 3 primaries keep 1; 3 secondaries keep 3 from a shuffled pile of Survey, Piracy, Tanker, Escort, Salvage |
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
| 3 | 100% | 27 | 35 | 1h21 | 2.9 | 3.7 | 5.8 | 53% | 35% | 18% | 3% | 33% / 37% / 31% | none |
| 4 | 100% | 28 | 42 | 1h52 | 6.3 | 4.2 | 6.8 | 55% | 34% | 22% | 5% | 33% / 14% / 23% / 30% | a kill per seat per game; seat spread 18% |
| 5 | 100% | 30 | 38 | 2h30 | 10.3 | 4.8 | 7.8 | 57% | 32% | 28% | 6% | 14% / 18% / 24% / 18% / 27% | a kill per seat per game |
| 6 | 100% | 27 | 39 | 2h42 | 12.8 | 5.4 | 8.9 | 57% | 32% | 29% | 6% | 16% / 14% / 22% / 20% / 13% / 15% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.58 | 0.63 | 0.68 | 0.7 |
| Won by a seat not leading at round 10 | 77% of 119 | 82% of 118 | 84% of 118 | 86% of 118 |
| First card completed (median round) | 9 | 9 | 6 | 8 |
| Escort markers per game: placed / paid / released (carrier died, escort died) | 2.51 / 0.28 / 1.43 (0.5, 0.93) | 4.94 / 0.31 / 3.53 (1.38, 2.14) | 8 / 0.35 / 6.25 (2.82, 3.43) | 10.98 / 0.38 / 9.07 (4.15, 4.92) |
| Marked sales with the escort out of the well, per game | 1.04 | 1.02 | 1.02 | 1.23 |
| Rounds from marker to Escort paid (median) | 10 | 8 | 5 | 4 |
| Wrecks left per game | 2.93 | 6.33 | 10.31 | 12.83 |
| Wrecks salvaged | 36% | 36% | 33% | 36% |
| Piracy seizures per game (crate / data) | 1 / 0.9 | 2.86 / 1.78 | 3.03 / 2.89 | 3.89 / 3.28 |
| Sales at a station, per game | 2.8 | 2.98 | 2.96 | 3.51 |
| Of those, sale named by the player | 100% | 99% | 100% | 100% |
| Fuel pumps per game | 0.35 | 0.33 | 0.37 | 0.39 |
| Turns ending in a planet well | 43% | 37% | 31% | 33% |
| Turns ending in the black hole | 57% | 63% | 69% | 67% |
| Turns ending moored | 9% | 7% | 6% | 6% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage/Tanker | 60 | 3% | 32% | 1.9 |
| Destroy + Piracy/Salvage/Survey | 59 | 3% | 10% | 1.6 |
| Intercept + Escort/Piracy/Tanker | 53 | 2% | 11% | 1.4 |
| Intercept + Escort/Survey/Tanker | 48 | 2% | 10% | 0.9 |
| Intercept + Piracy/Salvage/Tanker | 48 | 2% | 23% | 1.6 |
| Destroy + Escort/Piracy/Survey | 47 | 2% | 17% | 1.9 |
| Destroy + Salvage/Survey/Tanker | 47 | 2% | 32% | 1.9 |
| Intercept + Escort/Piracy/Salvage | 47 | 2% | 11% | 1.6 |
| Intercept + Piracy/Survey/Tanker | 46 | 2% | 20% | 1.2 |
| Destroy + Escort/Piracy/Tanker | 45 | 2% | 16% | 1.6 |
| Destroy + Escort/Survey/Tanker | 44 | 2% | 27% | 1.7 |
| Destroy + Escort/Piracy/Salvage | 42 | 2% | 26% | 1.9 |
| Destroy + Escort/Salvage/Survey | 42 | 2% | 24% | 1.9 |
| Intercept + Escort/Piracy/Survey | 39 | 2% | 15% | 1.3 |
| Intercept + Escort/Salvage/Survey | 38 | 2% | 32% | 1.7 |
| Intercept + Piracy/Salvage/Survey | 38 | 2% | 18% | 1.2 |
| Deliver + Escort/Piracy/Salvage | 37 | 2% | 35% | 2 |
| Deliver + Escort/Piracy/Tanker | 37 | 2% | 35% | 1.9 |
| Deliver + Piracy/Salvage/Tanker | 37 | 2% | 19% | 1.3 |
| Deliver + Escort/Piracy/Survey | 36 | 2% | 28% | 1.8 |
| Deliver + Piracy/Survey/Tanker | 36 | 2% | 22% | 1.5 |
| Deliver + Piracy/Salvage/Survey | 35 | 2% | 17% | 1.5 |
| Intercept + Escort/Salvage/Tanker | 34 | 2% | 21% | 1.4 |
| Intercept + Salvage/Survey/Tanker | 33 | 2% | 24% | 1.7 |
| Deliver + Escort/Survey/Tanker | 32 | 1% | 28% | 1.7 |
| Deliver + Escort/Salvage/Survey | 32 | 1% | 25% | 2.1 |
| Destroy + Piracy/Survey/Tanker | 31 | 1% | 26% | 1.8 |
| Destroy + Piracy/Salvage/Tanker | 29 | 1% | 24% | 1.7 |
| Destroy + Escort/Escort/Tanker | 26 | 1% | 15% | 1.2 |
| Destroy + Escort/Salvage/Salvage | 22 | 1% | 32% | 1.9 |
| Intercept + Escort/Survey/Survey | 22 | 1% | 18% | 1.5 |
| Intercept + Escort/Salvage/Salvage | 22 | 1% | 23% | 1.5 |
| Intercept + Survey/Survey/Tanker | 22 | 1% | 14% | 1.3 |
| Deliver + Escort/Salvage/Tanker | 22 | 1% | 32% | 2.1 |
| Intercept + Escort/Tanker/Tanker | 22 | 1% | 9% | 1.4 |
| Intercept + Salvage/Salvage/Survey | 22 | 1% | 36% | 1.7 |
| Intercept + Piracy/Piracy/Salvage | 21 | 1% | 19% | 1.4 |
| Intercept + Salvage/Salvage/Tanker | 20 | 1% | 10% | 1.4 |
| Destroy + Piracy/Piracy/Tanker | 20 | 1% | 20% | 1.7 |
| Deliver + Salvage/Survey/Survey | 20 | 1% | 40% | 2 |
| Destroy + Escort/Tanker/Tanker | 20 | 1% | 25% | 1.5 |
| Destroy + Survey/Survey/Tanker | 19 | 1% | 21% | 1.9 |
| Deliver + Escort/Salvage/Salvage | 19 | 1% | 42% | 2.4 |
| Deliver + Salvage/Survey/Tanker | 19 | 1% | 32% | 2.1 |
| Destroy + Piracy/Piracy/Salvage | 19 | 1% | 26% | 1.7 |
| Deliver + Escort/Escort/Salvage | 18 | 1% | 33% | 1.8 |
| Destroy + Salvage/Survey/Survey | 18 | 1% | 33% | 1.8 |
| Intercept + Escort/Escort/Survey | 18 | 1% | 11% | 0.8 |
| Deliver + Salvage/Salvage/Survey | 17 | 1% | 18% | 1.7 |
| Deliver + Escort/Escort/Survey | 17 | 1% | 24% | 1.9 |
| Destroy + Escort/Escort/Survey | 16 | 1% | 19% | 1.6 |
| Intercept + Survey/Tanker/Tanker | 16 | 1% | 19% | 1 |
| Destroy + Salvage/Tanker/Tanker | 16 | 1% | 44% | 2.1 |
| Destroy + Escort/Escort/Salvage | 16 | 1% | 25% | 1.8 |
| Intercept + Piracy/Tanker/Tanker | 16 | 1% | 13% | 1.4 |
| Intercept + Escort/Escort/Piracy | 16 | 1% | 13% | 1.1 |
| Deliver + Survey/Tanker/Tanker | 15 | 1% | 47% | 1.9 |
| Deliver + Salvage/Tanker/Tanker | 15 | 1% | 40% | 2.4 |
| Destroy + Escort/Escort/Piracy | 15 | 1% | 27% | 1.8 |
| Destroy + Salvage/Salvage/Tanker | 15 | 1% | 20% | 1.8 |
| Deliver + Piracy/Piracy/Tanker | 15 | 1% | 7% | 1.3 |
| Deliver + Piracy/Tanker/Tanker | 14 | 1% | 29% | 2 |
| Deliver + Piracy/Survey/Survey | 14 | 1% | 21% | 1.6 |
| Intercept + Piracy/Piracy/Tanker | 14 | 1% | 14% | 1.2 |
| Intercept + Piracy/Piracy/Survey | 14 | 1% | 21% | 1.1 |
| Intercept + Escort/Escort/Tanker | 14 | 1% | 21% | 1.1 |
| Destroy + Survey/Tanker/Tanker | 13 | 1% | 38% | 1.8 |
| Destroy + Piracy/Salvage/Salvage | 13 | 1% | 0% | 1.8 |
| Deliver + Escort/Survey/Survey | 13 | 1% | 23% | 1.8 |
| Deliver + Escort/Escort/Tanker | 13 | 1% | 38% | 2.2 |
| Deliver + Piracy/Piracy/Salvage | 13 | 1% | 15% | 1.8 |
| Destroy + Piracy/Survey/Survey | 13 | 1% | 8% | 1.8 |
| Intercept + Escort/Escort/Salvage | 13 | 1% | 8% | 1.2 |
| Intercept + Piracy/Survey/Survey | 12 | 1% | 17% | 1.3 |
| Deliver + Piracy/Piracy/Survey | 12 | 1% | 17% | 1.5 |
| Intercept + Escort/Piracy/Piracy | 12 | 1% | 17% | 1.8 |
| Destroy + Piracy/Tanker/Tanker | 12 | 1% | 8% | 1.6 |
| Destroy + Piracy/Piracy/Survey | 12 | 1% | 0% | 1.6 |
| Deliver + Escort/Escort/Piracy | 11 | 1% | 9% | 1.7 |
| Deliver + Piracy/Salvage/Salvage | 11 | 1% | 27% | 1.5 |
| Intercept + Salvage/Tanker/Tanker | 11 | 1% | 9% | 1.5 |
| Deliver + Escort/Piracy/Piracy | 11 | 1% | 18% | 1.5 |
| Destroy + Salvage/Salvage/Survey | 11 | 1% | 64% | 2.4 |
| Intercept + Piracy/Salvage/Salvage | 11 | 1% | 27% | 1.5 |
| Deliver + Escort/Tanker/Tanker | 11 | 1% | 27% | 2.3 |
| Deliver + Salvage/Salvage/Tanker | 11 | 1% | 64% | 2.5 |
| Deliver + Survey/Survey/Tanker | 10 | 0% | 20% | 1.2 |
| Destroy + Escort/Piracy/Piracy | 10 | 0% | 20% | 1.7 |
| Destroy + Escort/Survey/Survey | 10 | 0% | 10% | 1.6 |
| Intercept + Salvage/Survey/Survey | 9 | 0% | 44% | 2.3 |
| Intercept + Survey/Survey/Survey | 6 | 0% | 0% | 1.7 |
| Intercept + Tanker/Tanker/Tanker | 6 | 0% | 0% | 0.8 |
| Deliver + Piracy/Piracy/Piracy | 5 | 0% | 0% | 2 |
| Deliver + Survey/Survey/Survey | 4 | 0% | 25% | 1.3 |
| Destroy + Piracy/Piracy/Piracy | 4 | 0% | 25% | 1.8 |
| Intercept + Salvage/Salvage/Salvage | 3 | 0% | 0% | 1.3 |
| Destroy + Salvage/Salvage/Salvage | 3 | 0% | 0% | 0.7 |
| Destroy + Tanker/Tanker/Tanker | 2 | 0% | 50% | 1.5 |
| Deliver + Salvage/Salvage/Salvage | 2 | 0% | 0% | 1.5 |
| Intercept + Escort/Escort/Escort | 2 | 0% | 0% | 1.5 |
| Intercept + Piracy/Piracy/Piracy | 2 | 0% | 0% | 1 |
| Deliver + Tanker/Tanker/Tanker | 2 | 0% | 0% | 1 |
| Deliver + Escort/Escort/Escort | 1 | 0% | 0% | 2 |
| Destroy + Escort/Escort/Escort | 1 | 0% | 0% | 0 |
| Destroy + Survey/Survey/Survey | 1 | 0% | 0% | 2 |

_Every hand is one primary and three secondaries, which is five points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| fuel_compressor,ballistic_rack,ballistic_rack,shields,radiator | 411 | 19% | 24% |
| railgun,plasma_cannon,plasma_cannon,laser,radiator | 371 | 17% | 18% |
| sensor_array,missiles,missiles,radiator,shields | 370 | 17% | 21% |
| missiles,laser,laser,laser,radiator | 250 | 12% | 31% |
| sensor_array,laser,ballistic_rack,shields,radiator | 246 | 11% | 13% |
| fuel_compressor,missiles,missiles,radiator,shields | 175 | 8% | 34% |
| disruptor,plasma_cannon,plasma_cannon,shields,radiator | 117 | 5% | 21% |
| sensor_array,shields,shields,radiator,laser | 116 | 5% | 17% |
| sensor_array,shields,disruptor,radiator,plasma_cannon | 38 | 2% | 11% |
| railgun,laser,ballistic_rack,shields,radiator | 35 | 2% | 29% |
| fuel_compressor,disruptor,laser,plasma_cannon,radiator | 27 | 1% | 33% |
| fuel_compressor,shields,shields,radiator,laser | 4 | 0% | 25% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 65 | 17% |
| Destroy | 2314 | 773 | 33% | 70 | 18% |
| Intercept | 2285 | 770 | 34% | 54 | 14% |
| Survey | 1282 | 1282 | 100% | 15 | 10% |
| Piracy | 1279 | 1279 | 100% | 10 | 8% |
| Tanker | 1292 | 1292 | 100% | 13 | 11% |
| Escort | 1327 | 1327 | 100% | 12 | 9% |
| Salvage | 1300 | 1300 | 100% | 12 | 12% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 92% | 3 | 11 / 13 / - | 8 | 65% | 17% |
| Destroy | target hit | 91% | 3 | - | 3 | 70% | 22% |
| Intercept | target scanned | 94% | 2 | 69 / 41 / - | 8 | 54% | 16% |
| Survey | dive made | 82% | 2 | 110 / 54 / - | 12 | 15% | 37% |
| Piracy | item taken | 72% | 7 | 87 / 133 / - | 9 | 10% | 24% |
| Tanker | in a planet's well with 5 fuel | 65% | 12 | 7 / 0 / 218 | 2 | 13% | 10% |
| Escort | marker placed | 90% | 5 | 114 / 89 / 43 | 5 | 12% | 44% |
| Salvage | box taken | 60% | 13 | 85 / 25 / - | 8 | 12% | 27% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard, a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. Escort's three are its own: the escort destroyed, the marked ship destroyed (either way the marker comes back) and the marked ship selling with the escort out of its well (the marker stays out). The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

