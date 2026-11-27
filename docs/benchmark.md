# Benchmark (2026-11-27)

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
| 3 | 100% | 21 | 26 | 1h03 | 2.4 | 3.4 | 5.4 | 53% | 31% | 19% | 4% | 38% / 33% / 30% | none |
| 4 | 100% | 21 | 27 | 1h24 | 4.8 | 4.2 | 6.5 | 56% | 31% | 25% | 5% | 33% / 20% / 23% / 24% | a kill per seat per game |
| 5 | 100% | 21 | 27 | 1h45 | 7.5 | 4.6 | 7.5 | 56% | 31% | 30% | 6% | 25% / 15% / 17% / 19% / 24% | a kill per seat per game |
| 6 | 100% | 21 | 27 | 2h06 | 9.3 | 5.1 | 8.2 | 56% | 31% | 32% | 6% | 18% / 15% / 18% / 20% / 13% / 16% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.5 | 0.48 | 0.61 | 0.72 |
| Won by a seat not leading at round 10 | 73% of 114 | 66% of 109 | 83% of 111 | 81% of 108 |
| First card completed (median round) | 8 | 8 | 7 | 8 |
| Escort markers per game: placed / paid / released (carrier died, escort died) | 2.12 / 0.13 / 1.03 (0.29, 0.74) | 4.04 / 0.35 / 2.64 (1.08, 1.56) | 6.18 / 0.25 / 4.62 (2.01, 2.61) | 8.63 / 0.34 / 6.55 (2.94, 3.61) |
| Marked sales with the escort out of the well, per game | 1.14 | 1.1 | 1.18 | 1.54 |
| Rounds from marker to Escort paid (median) | 3 | 7 | 3 | 4 |
| Wrecks left per game | 2.36 | 4.81 | 7.52 | 9.33 |
| Wrecks salvaged | 35% | 35% | 31% | 34% |
| Piracy seizures per game (crate / data) | 0.45 / 0.63 | 1.14 / 1.67 | 0.87 / 2.36 | 0.95 / 2.88 |
| Sales at a station, per game | 2.74 | 2.92 | 3.04 | 3.45 |
| Of those, sale named by the player | 100% | 99% | 100% | 100% |
| Fuel pumps per game | 0.36 | 0.28 | 0.42 | 0.28 |
| Turns ending in a planet well | 41% | 36% | 32% | 32% |
| Turns ending in the black hole | 59% | 64% | 68% | 68% |
| Turns ending moored | 12% | 10% | 9% | 9% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage/Tanker | 60 | 3% | 25% | 1.6 |
| Destroy + Piracy/Salvage/Survey | 59 | 3% | 17% | 1.3 |
| Intercept + Escort/Piracy/Tanker | 53 | 2% | 9% | 1 |
| Intercept + Escort/Survey/Tanker | 48 | 2% | 10% | 0.9 |
| Intercept + Piracy/Salvage/Tanker | 48 | 2% | 15% | 1.2 |
| Destroy + Escort/Piracy/Survey | 47 | 2% | 32% | 1.8 |
| Destroy + Salvage/Survey/Tanker | 47 | 2% | 57% | 2.1 |
| Intercept + Escort/Piracy/Salvage | 47 | 2% | 11% | 1.2 |
| Intercept + Piracy/Survey/Tanker | 46 | 2% | 26% | 1.5 |
| Destroy + Escort/Piracy/Tanker | 45 | 2% | 16% | 1.4 |
| Destroy + Escort/Survey/Tanker | 44 | 2% | 36% | 1.8 |
| Destroy + Escort/Piracy/Salvage | 42 | 2% | 21% | 1.7 |
| Destroy + Escort/Salvage/Survey | 42 | 2% | 31% | 1.9 |
| Intercept + Escort/Piracy/Survey | 39 | 2% | 18% | 1.4 |
| Intercept + Escort/Salvage/Survey | 38 | 2% | 16% | 1.3 |
| Intercept + Piracy/Salvage/Survey | 38 | 2% | 16% | 1.1 |
| Deliver + Escort/Piracy/Salvage | 37 | 2% | 19% | 1.5 |
| Deliver + Escort/Piracy/Tanker | 37 | 2% | 16% | 1.6 |
| Deliver + Piracy/Salvage/Tanker | 37 | 2% | 11% | 1.4 |
| Deliver + Escort/Piracy/Survey | 36 | 2% | 11% | 1.6 |
| Deliver + Piracy/Survey/Tanker | 36 | 2% | 19% | 1.6 |
| Deliver + Piracy/Salvage/Survey | 35 | 2% | 20% | 1.7 |
| Intercept + Escort/Salvage/Tanker | 34 | 2% | 12% | 1.3 |
| Intercept + Salvage/Survey/Tanker | 33 | 2% | 18% | 1.4 |
| Deliver + Escort/Survey/Tanker | 32 | 1% | 34% | 2.2 |
| Deliver + Escort/Salvage/Survey | 32 | 1% | 34% | 2.1 |
| Destroy + Piracy/Survey/Tanker | 31 | 1% | 29% | 1.7 |
| Destroy + Piracy/Salvage/Tanker | 29 | 1% | 10% | 1.6 |
| Destroy + Escort/Escort/Tanker | 26 | 1% | 12% | 1.3 |
| Destroy + Escort/Salvage/Salvage | 22 | 1% | 32% | 1.7 |
| Intercept + Escort/Survey/Survey | 22 | 1% | 14% | 0.9 |
| Intercept + Escort/Salvage/Salvage | 22 | 1% | 14% | 0.7 |
| Intercept + Survey/Survey/Tanker | 22 | 1% | 23% | 1.8 |
| Deliver + Escort/Salvage/Tanker | 22 | 1% | 45% | 2 |
| Intercept + Escort/Tanker/Tanker | 22 | 1% | 14% | 0.8 |
| Intercept + Salvage/Salvage/Survey | 22 | 1% | 41% | 1.8 |
| Intercept + Piracy/Piracy/Salvage | 21 | 1% | 5% | 1 |
| Intercept + Salvage/Salvage/Tanker | 20 | 1% | 10% | 1.4 |
| Destroy + Piracy/Piracy/Tanker | 20 | 1% | 25% | 1.5 |
| Deliver + Salvage/Survey/Survey | 20 | 1% | 50% | 2.4 |
| Destroy + Escort/Tanker/Tanker | 20 | 1% | 30% | 1.4 |
| Destroy + Survey/Survey/Tanker | 19 | 1% | 21% | 1.7 |
| Deliver + Escort/Salvage/Salvage | 19 | 1% | 53% | 2.4 |
| Deliver + Salvage/Survey/Tanker | 19 | 1% | 16% | 1.5 |
| Destroy + Piracy/Piracy/Salvage | 19 | 1% | 26% | 1.5 |
| Deliver + Escort/Escort/Salvage | 18 | 1% | 33% | 2.2 |
| Destroy + Salvage/Survey/Survey | 18 | 1% | 11% | 1.4 |
| Intercept + Escort/Escort/Survey | 18 | 1% | 11% | 0.8 |
| Deliver + Salvage/Salvage/Survey | 17 | 1% | 35% | 1.9 |
| Deliver + Escort/Escort/Survey | 17 | 1% | 18% | 1.7 |
| Destroy + Escort/Escort/Survey | 16 | 1% | 44% | 2 |
| Intercept + Survey/Tanker/Tanker | 16 | 1% | 13% | 1.2 |
| Destroy + Salvage/Tanker/Tanker | 16 | 1% | 19% | 1.1 |
| Destroy + Escort/Escort/Salvage | 16 | 1% | 0% | 1.4 |
| Intercept + Piracy/Tanker/Tanker | 16 | 1% | 6% | 0.9 |
| Intercept + Escort/Escort/Piracy | 16 | 1% | 0% | 0.9 |
| Deliver + Survey/Tanker/Tanker | 15 | 1% | 33% | 1.8 |
| Deliver + Salvage/Tanker/Tanker | 15 | 1% | 60% | 2.7 |
| Destroy + Escort/Escort/Piracy | 15 | 1% | 20% | 1.3 |
| Destroy + Salvage/Salvage/Tanker | 15 | 1% | 53% | 2 |
| Deliver + Piracy/Piracy/Tanker | 15 | 1% | 7% | 1.1 |
| Deliver + Piracy/Tanker/Tanker | 14 | 1% | 21% | 1.6 |
| Deliver + Piracy/Survey/Survey | 14 | 1% | 21% | 1.9 |
| Intercept + Piracy/Piracy/Tanker | 14 | 1% | 0% | 0.8 |
| Intercept + Piracy/Piracy/Survey | 14 | 1% | 7% | 1.4 |
| Intercept + Escort/Escort/Tanker | 14 | 1% | 21% | 1.4 |
| Destroy + Survey/Tanker/Tanker | 13 | 1% | 46% | 1.8 |
| Destroy + Piracy/Salvage/Salvage | 13 | 1% | 23% | 1.8 |
| Deliver + Escort/Survey/Survey | 13 | 1% | 23% | 1.6 |
| Deliver + Escort/Escort/Tanker | 13 | 1% | 54% | 2.4 |
| Deliver + Piracy/Piracy/Salvage | 13 | 1% | 15% | 1.1 |
| Destroy + Piracy/Survey/Survey | 13 | 1% | 31% | 1.8 |
| Intercept + Escort/Escort/Salvage | 13 | 1% | 8% | 0.8 |
| Intercept + Piracy/Survey/Survey | 12 | 1% | 25% | 1.6 |
| Deliver + Piracy/Piracy/Survey | 12 | 1% | 17% | 1.7 |
| Intercept + Escort/Piracy/Piracy | 12 | 1% | 25% | 1.6 |
| Destroy + Piracy/Tanker/Tanker | 12 | 1% | 25% | 1.9 |
| Destroy + Piracy/Piracy/Survey | 12 | 1% | 25% | 1.2 |
| Deliver + Escort/Escort/Piracy | 11 | 1% | 45% | 2 |
| Deliver + Piracy/Salvage/Salvage | 11 | 1% | 9% | 1.3 |
| Intercept + Salvage/Tanker/Tanker | 11 | 1% | 9% | 1.2 |
| Deliver + Escort/Piracy/Piracy | 11 | 1% | 0% | 1.6 |
| Destroy + Salvage/Salvage/Survey | 11 | 1% | 36% | 1.7 |
| Intercept + Piracy/Salvage/Salvage | 11 | 1% | 18% | 1.6 |
| Deliver + Escort/Tanker/Tanker | 11 | 1% | 45% | 2.3 |
| Deliver + Salvage/Salvage/Tanker | 11 | 1% | 27% | 2 |
| Deliver + Survey/Survey/Tanker | 10 | 0% | 50% | 1.9 |
| Destroy + Escort/Piracy/Piracy | 10 | 0% | 10% | 2.1 |
| Destroy + Escort/Survey/Survey | 10 | 0% | 30% | 1.9 |
| Intercept + Salvage/Survey/Survey | 9 | 0% | 22% | 1.6 |
| Intercept + Survey/Survey/Survey | 6 | 0% | 50% | 2 |
| Intercept + Tanker/Tanker/Tanker | 6 | 0% | 0% | 0.7 |
| Deliver + Piracy/Piracy/Piracy | 5 | 0% | 0% | 1.2 |
| Deliver + Survey/Survey/Survey | 4 | 0% | 0% | 0.8 |
| Destroy + Piracy/Piracy/Piracy | 4 | 0% | 0% | 1.5 |
| Intercept + Salvage/Salvage/Salvage | 3 | 0% | 67% | 2 |
| Destroy + Salvage/Salvage/Salvage | 3 | 0% | 0% | 1.7 |
| Destroy + Tanker/Tanker/Tanker | 2 | 0% | 0% | 0.5 |
| Deliver + Salvage/Salvage/Salvage | 2 | 0% | 50% | 1.5 |
| Intercept + Escort/Escort/Escort | 2 | 0% | 0% | 1 |
| Intercept + Piracy/Piracy/Piracy | 2 | 0% | 0% | 2 |
| Deliver + Tanker/Tanker/Tanker | 2 | 0% | 0% | 1.5 |
| Deliver + Escort/Escort/Escort | 1 | 0% | 0% | 2 |
| Destroy + Escort/Escort/Escort | 1 | 0% | 0% | 0 |
| Destroy + Survey/Survey/Survey | 1 | 0% | 100% | 3 |

_Every hand is one primary and three secondaries, which is five points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| fuel_compressor,ballistic_rack,ballistic_rack,shields,radiator | 411 | 19% | 20% |
| railgun,plasma_cannon,plasma_cannon,laser,radiator | 371 | 17% | 22% |
| sensor_array,missiles,missiles,radiator,shields | 370 | 17% | 15% |
| missiles,laser,laser,laser,radiator | 250 | 12% | 32% |
| sensor_array,laser,ballistic_rack,shields,radiator | 246 | 11% | 13% |
| fuel_compressor,missiles,missiles,radiator,shields | 175 | 8% | 39% |
| disruptor,plasma_cannon,plasma_cannon,shields,radiator | 117 | 5% | 30% |
| sensor_array,jump_drive,shields,radiator,laser | 116 | 5% | 22% |
| sensor_array,shields,disruptor,radiator,plasma_cannon | 38 | 2% | 3% |
| railgun,laser,ballistic_rack,shields,radiator | 35 | 2% | 31% |
| fuel_compressor,disruptor,laser,plasma_cannon,radiator | 27 | 1% | 37% |
| fuel_compressor,shields,shields,radiator,laser | 4 | 0% | 0% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 65 | 17% |
| Destroy | 2314 | 773 | 33% | 62 | 21% |
| Intercept | 2285 | 770 | 34% | 47 | 12% |
| Survey | 1282 | 1282 | 100% | 20 | 14% |
| Piracy | 1279 | 1279 | 100% | 11 | 7% |
| Tanker | 1292 | 1292 | 100% | 12 | 11% |
| Escort | 1327 | 1327 | 100% | 10 | 7% |
| Salvage | 1300 | 1300 | 100% | 12 | 11% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 91% | 3 | 8 / 10 / - | 6 | 65% | 18% |
| Destroy | target hit | 89% | 3 | - | 2 | 62% | 28% |
| Intercept | target scanned | 91% | 2 | 53 / 40 / - | 7 | 47% | 19% |
| Survey | dive made | 78% | 2 | 80 / 45 / - | 7 | 20% | 34% |
| Piracy | item taken | 63% | 6 | 77 / 44 / - | 7 | 11% | 23% |
| Tanker | in a planet's well with 5 fuel | 62% | 12 | 5 / 0 / 175 | 1 | 12% | 11% |
| Escort | marker placed | 88% | 4 | 88 / 65 / 51 | 4 | 10% | 46% |
| Salvage | box taken | 49% | 11 | 66 / 26 / - | 6 | 12% | 18% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard, a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. Escort's three are its own: the escort destroyed, the marked ship destroyed (either way the marker comes back) and the marked ship selling with the escort out of its well (the marker stays out). The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

