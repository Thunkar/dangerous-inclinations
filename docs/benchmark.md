# Benchmark (2026-10-08)

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
| Shields | 1 or 2 energy, 1 point absorbed a cube, which comes off the subsystem; its energy is heat every turn it is powered, and every point absorbed is heat too |
| Ballistic rack | rolls at up to 4 missiles a turn while powered; answering is 2 heat on the track, however many |
| Table time assumes | 1 min per player-turn |

## By seat count

| seats | decided | rounds (median) | rounds (p75) | table time | kills/game | cards/game | points/game | burn | scoop | firing | lost | wins by seat | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 100% | 27 | 32 | 1h21 | 2.4 | 3.6 | 5.8 | 52% | 34% | 17% | 3% | 39% / 30% / 31% | none |
| 4 | 100% | 27 | 33 | 1h48 | 5.3 | 4.1 | 6.6 | 55% | 33% | 24% | 4% | 33% / 21% / 23% / 23% | a kill per seat per game |
| 5 | 100% | 33 | 43 | 2h45 | 10.6 | 4.8 | 8 | 57% | 32% | 28% | 6% | 14% / 17% / 24% / 22% / 23% | a kill per seat per game |
| 6 | 100% | 28 | 38 | 2h48 | 13.2 | 5.1 | 8.5 | 57% | 32% | 31% | 6% | 18% / 17% / 15% / 18% / 18% / 16% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.49 | 0.59 | 0.66 | 0.67 |
| Won by a seat not leading at round 10 | 69% of 119 | 73% of 118 | 78% of 119 | 87% of 118 |
| First card completed (median round) | 9 | 9 | 8 | 8 |
| Escort markers per game: placed / paid / released (carrier died, escort died) | 1.8 / 0.25 / 0.94 (0.29, 0.65) | 3.3 / 0.24 / 2.28 (0.78, 1.49) | 6.14 / 0.27 / 4.92 (2.13, 2.79) | 7.73 / 0.27 / 6.3 (2.93, 3.38) |
| Marked sales with the escort out of the well, per game | 0.83 | 0.87 | 0.98 | 0.95 |
| Rounds from marker to Escort paid (median) | 12 | 5 | 6 | 3 |
| Wrecks left per game | 2.43 | 5.33 | 10.58 | 13.16 |
| Wrecks salvaged | 30% | 31% | 29% | 34% |
| Piracy seizures per game (crate / data) | 0.38 / 0.48 | 1.68 / 1.08 | 1.78 / 2.01 | 2.73 / 2.65 |
| Sales at a station, per game | 2.86 | 2.93 | 3.1 | 3.41 |
| Of those, sale named by the player | 100% | 100% | 99% | 100% |
| Fuel pumps per game | 0.41 | 0.33 | 0.35 | 0.39 |
| Turns ending in a planet well | 46% | 39% | 33% | 32% |
| Turns ending in the black hole | 54% | 61% | 68% | 68% |
| Turns ending moored | 10% | 8% | 6% | 6% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 23% | 1.6 |
| Intercept + Escort/Piracy | 79 | 4% | 14% | 1.3 |
| Intercept + Escort/Tanker | 75 | 3% | 20% | 1.6 |
| Destroy + Escort/Tanker | 75 | 3% | 28% | 1.7 |
| Destroy + Survey/Tanker | 73 | 3% | 30% | 1.8 |
| Destroy + Salvage/Survey | 71 | 3% | 23% | 1.9 |
| Intercept + Piracy/Tanker | 71 | 3% | 21% | 1.2 |
| Intercept + Survey/Tanker | 70 | 3% | 23% | 1.6 |
| Intercept + Escort/Salvage | 69 | 3% | 19% | 1.3 |
| Destroy + Piracy/Survey | 68 | 3% | 24% | 1.7 |
| Intercept + Piracy/Salvage | 67 | 3% | 21% | 1.5 |
| Destroy + Escort/Piracy | 66 | 3% | 15% | 1.7 |
| Intercept + Escort/Survey | 63 | 3% | 14% | 1.2 |
| Destroy + Piracy/Salvage | 61 | 3% | 13% | 1.7 |
| Deliver + Piracy/Survey | 60 | 3% | 15% | 1.6 |
| Deliver + Escort/Salvage | 60 | 3% | 25% | 1.9 |
| Deliver + Salvage/Survey | 59 | 3% | 29% | 1.8 |
| Destroy + Piracy/Tanker | 58 | 3% | 26% | 1.9 |
| Intercept + Piracy/Survey | 57 | 3% | 21% | 1.4 |
| Destroy + Salvage/Tanker | 57 | 3% | 39% | 1.7 |
| Deliver + Piracy/Tanker | 53 | 2% | 28% | 1.9 |
| Deliver + Escort/Piracy | 52 | 2% | 19% | 1.6 |
| Intercept + Salvage/Survey | 52 | 2% | 21% | 1.6 |
| Deliver + Piracy/Salvage | 50 | 2% | 32% | 1.9 |
| Intercept + Salvage/Tanker | 49 | 2% | 31% | 1.7 |
| Deliver + Escort/Survey | 47 | 2% | 30% | 1.8 |
| Destroy + Escort/Survey | 45 | 2% | 13% | 1.3 |
| Deliver + Salvage/Tanker | 45 | 2% | 31% | 1.8 |
| Deliver + Escort/Tanker | 43 | 2% | 26% | 1.7 |
| Deliver + Survey/Tanker | 42 | 2% | 36% | 1.9 |
| Destroy + Salvage/Salvage | 31 | 1% | 39% | 2 |
| Destroy + Escort/Escort | 29 | 1% | 3% | 1.3 |
| Intercept + Survey/Survey | 28 | 1% | 18% | 1.3 |
| Intercept + Salvage/Salvage | 27 | 1% | 15% | 1.6 |
| Deliver + Survey/Survey | 25 | 1% | 24% | 1.8 |
| Deliver + Piracy/Piracy | 24 | 1% | 13% | 1.2 |
| Intercept + Tanker/Tanker | 23 | 1% | 9% | 1.5 |
| Destroy + Tanker/Tanker | 22 | 1% | 27% | 1.5 |
| Deliver + Escort/Escort | 21 | 1% | 19% | 1.8 |
| Deliver + Tanker/Tanker | 21 | 1% | 38% | 1.6 |
| Destroy + Piracy/Piracy | 21 | 1% | 5% | 1.4 |
| Intercept + Escort/Escort | 20 | 1% | 10% | 1 |
| Intercept + Piracy/Piracy | 20 | 1% | 5% | 1.5 |
| Destroy + Survey/Survey | 17 | 1% | 12% | 1.5 |
| Deliver + Salvage/Salvage | 15 | 1% | 13% | 1.8 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| fuel_compressor,ballistic_rack,ballistic_rack,shields,radiator | 350 | 16% | 23% |
| railgun,plasma_cannon,plasma_cannon,laser,radiator | 274 | 13% | 18% |
| sensor_array,missiles,missiles,radiator,shields | 264 | 12% | 22% |
| missiles,laser,laser,laser,radiator | 238 | 11% | 29% |
| sensor_array,laser,ballistic_rack,shields,radiator | 237 | 11% | 16% |
| fuel_compressor,missiles,missiles,radiator,shields | 179 | 8% | 27% |
| sensor_array,shields,shields,radiator,laser | 155 | 7% | 21% |
| disruptor,plasma_cannon,plasma_cannon,shields,radiator | 149 | 7% | 19% |
| sensor_array,shields,disruptor,radiator,plasma_cannon | 114 | 5% | 16% |
| railgun,laser,ballistic_rack,shields,radiator | 112 | 5% | 27% |
| fuel_compressor,disruptor,laser,plasma_cannon,radiator | 63 | 3% | 37% |
| fuel_compressor,shields,shields,radiator,laser | 25 | 1% | 24% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 68 | 17% |
| Destroy | 2314 | 773 | 33% | 66 | 18% |
| Intercept | 2285 | 770 | 34% | 57 | 15% |
| Survey | 1282 | 847 | 66% | 20 | 11% |
| Piracy | 1279 | 872 | 68% | 13 | 9% |
| Tanker | 1292 | 843 | 65% | 21 | 13% |
| Escort | 1327 | 893 | 67% | 14 | 6% |
| Salvage | 1300 | 865 | 67% | 18 | 12% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 94% | 3 | 14 / 11 / - | 8 | 68% | 16% |
| Destroy | target hit | 91% | 3 | - | 3 | 66% | 24% |
| Intercept | target scanned | 95% | 2 | 76 / 32 / - | 8 | 57% | 15% |
| Survey | dive made | 85% | 1 | 110 / 46 / - | 12 | 20% | 44% |
| Piracy | item taken | 70% | 8 | 96 / 119 / - | 10 | 13% | 18% |
| Tanker | in a planet's well with 5 fuel | 75% | 12 | 5 / 0 / 231 | 2 | 21% | 11% |
| Escort | marker placed | 92% | 4 | 121 / 89 / 53 | 5 | 14% | 47% |
| Salvage | box taken | 69% | 12 | 99 / 30 / - | 8 | 18% | 31% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard, a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. Escort's three are its own: the escort destroyed, the marked ship destroyed (either way the marker comes back) and the marked ship selling with the escort out of its well (the marker stays out). The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

