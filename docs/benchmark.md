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
| 3 | 100% | 27 | 33 | 1h21 | 2 | 3.6 | 5.8 | 52% | 35% | 18% | 2% | 36% / 28% / 36% | none |
| 4 | 100% | 26 | 33 | 1h44 | 3.2 | 4.1 | 6.7 | 54% | 34% | 24% | 3% | 28% / 28% / 23% / 23% | none |
| 5 | 100% | 27 | 33 | 2h15 | 6.5 | 4.8 | 8 | 55% | 34% | 28% | 4% | 16% / 25% / 18% / 20% / 21% | a kill per seat per game |
| 6 | 100% | 30 | 39 | 3h00 | 9.8 | 5.5 | 9.1 | 55% | 34% | 31% | 5% | 19% / 9% / 19% / 19% / 13% / 20% | a kill per seat per game |

_Table time is the median game at the stated pace: rounds x seats player-turns. Cards are cards completed; points count a primary as 2 and a secondary as 1. `lost` is the share of turns spent respawning. `wins by seat` is turn order, first seat first._

## How games unfold

| measure | 3 seats | 4 seats | 5 seats | 6 seats |
|---|---|---|---|---|
| Lead changes per game | 0.49 | 0.67 | 0.75 | 0.74 |
| Won by a seat not leading at round 10 | 73% of 118 | 79% of 118 | 89% of 118 | 87% of 120 |
| First card completed (median round) | 9 | 9 | 9 | 7 |
| Escort markers placed per game | 0.48 | 0.87 | 1.4 | 2.03 |
| Rounds from marker to Escort paid (median) | 5 | 6 | 8 | 7 |
| Wrecks left per game | 1.99 | 3.2 | 6.53 | 9.76 |
| Wrecks salvaged | 24% | 26% | 26% | 26% |
| Piracy seizures per game (crate / data) | 0.15 / 0.44 | 0.33 / 0.84 | 0.53 / 1.68 | 0.88 / 2.56 |
| Sales at a station, per game | 2.71 | 2.97 | 3.18 | 3.41 |
| Of those, sale named by the player | 100% | 100% | 100% | 100% |
| Fuel pumps per game | 0.38 | 0.38 | 0.42 | 0.34 |
| Turns ending in a planet well | 44% | 39% | 35% | 35% |
| Turns ending in the black hole | 56% | 61% | 65% | 65% |
| Turns ending moored | 9% | 8% | 7% | 6% |

_The leader is the one seat with the most points; a tie leaves nobody leading, and the first seat to lead is not a change. The comeback row counts games still being played after round 10 that someone won, and a tie at round 10 counts as not leading. A marker taken back when its ship dies is not timed. A visit whose sale nobody named makes the default, the sale that scores most._

## Hands the bots kept

| hand | seats | share of seats | win rate | points scored |
|---|---|---|---|---|
| Destroy + Escort/Salvage | 79 | 4% | 30% | 1.8 |
| Intercept + Escort/Piracy | 79 | 4% | 13% | 1.4 |
| Intercept + Escort/Tanker | 75 | 3% | 20% | 1.6 |
| Destroy + Escort/Tanker | 75 | 3% | 40% | 1.9 |
| Destroy + Survey/Tanker | 73 | 3% | 18% | 1.4 |
| Destroy + Salvage/Survey | 71 | 3% | 13% | 1.3 |
| Intercept + Piracy/Tanker | 71 | 3% | 11% | 1.3 |
| Intercept + Survey/Tanker | 70 | 3% | 30% | 1.7 |
| Intercept + Escort/Salvage | 69 | 3% | 12% | 1.4 |
| Destroy + Piracy/Survey | 68 | 3% | 22% | 1.6 |
| Intercept + Piracy/Salvage | 67 | 3% | 13% | 1.3 |
| Destroy + Escort/Piracy | 66 | 3% | 21% | 1.7 |
| Intercept + Escort/Survey | 63 | 3% | 24% | 1.5 |
| Destroy + Piracy/Salvage | 61 | 3% | 18% | 1.5 |
| Deliver + Piracy/Survey | 60 | 3% | 23% | 1.7 |
| Deliver + Escort/Salvage | 60 | 3% | 22% | 1.8 |
| Deliver + Salvage/Survey | 59 | 3% | 34% | 1.9 |
| Destroy + Piracy/Tanker | 58 | 3% | 21% | 1.9 |
| Intercept + Piracy/Survey | 57 | 3% | 21% | 1.5 |
| Destroy + Salvage/Tanker | 57 | 3% | 28% | 1.6 |
| Deliver + Piracy/Tanker | 53 | 2% | 23% | 1.7 |
| Deliver + Escort/Piracy | 52 | 2% | 13% | 1.8 |
| Intercept + Salvage/Survey | 52 | 2% | 13% | 1.4 |
| Deliver + Piracy/Salvage | 50 | 2% | 16% | 1.8 |
| Intercept + Salvage/Tanker | 49 | 2% | 10% | 1.5 |
| Deliver + Escort/Survey | 47 | 2% | 28% | 1.9 |
| Destroy + Escort/Survey | 45 | 2% | 27% | 2.1 |
| Deliver + Salvage/Tanker | 45 | 2% | 42% | 2 |
| Deliver + Escort/Tanker | 43 | 2% | 42% | 2 |
| Deliver + Survey/Tanker | 42 | 2% | 55% | 2.2 |
| Destroy + Salvage/Salvage | 31 | 1% | 16% | 1.3 |
| Destroy + Escort/Escort | 29 | 1% | 24% | 1.7 |
| Intercept + Survey/Survey | 28 | 1% | 39% | 2 |
| Intercept + Salvage/Salvage | 27 | 1% | 11% | 1.4 |
| Deliver + Survey/Survey | 25 | 1% | 36% | 2.1 |
| Deliver + Piracy/Piracy | 24 | 1% | 4% | 1.3 |
| Intercept + Tanker/Tanker | 23 | 1% | 9% | 1.5 |
| Destroy + Tanker/Tanker | 22 | 1% | 18% | 1.5 |
| Deliver + Escort/Escort | 21 | 1% | 24% | 1.7 |
| Deliver + Tanker/Tanker | 21 | 1% | 38% | 2 |
| Destroy + Piracy/Piracy | 21 | 1% | 5% | 1.3 |
| Intercept + Escort/Escort | 20 | 1% | 20% | 2.1 |
| Intercept + Piracy/Piracy | 20 | 1% | 5% | 1.5 |
| Destroy + Survey/Survey | 17 | 1% | 24% | 1.5 |
| Deliver + Salvage/Salvage | 15 | 1% | 13% | 1.6 |

_Every hand is one primary and two secondaries, which is four points held for the 3 that win, so the row is the primary a seat took and what it took beside it. A hand nobody keeps is a plan the table never tested._

## Hulls the bots chose

| hull | seats | share of seats | win rate |
|---|---|---|---|
| railgun,laser,ballistic_rack,shields,radiator | 773 | 36% | 23% |
| sensor_array,shields,shields,radiator,laser | 770 | 36% | 17% |
| fuel_compressor,shields,shields,radiator,laser | 617 | 29% | 28% |

_A hull's win rate is against the field, so the fair share is 1/seats, about 25% across a 3–6 seat mix._

## Cards

| card | offered | kept | pick rate | completed per 100 kept | share of winning cards |
|---|---|---|---|---|---|
| Deliver | 1881 | 617 | 33% | 73 | 18% |
| Destroy | 2314 | 773 | 33% | 62 | 18% |
| Intercept | 2285 | 770 | 34% | 60 | 14% |
| Survey | 1282 | 847 | 66% | 22 | 12% |
| Piracy | 1279 | 872 | 68% | 14 | 9% |
| Tanker | 1292 | 843 | 65% | 22 | 13% |
| Escort | 1327 | 893 | 67% | 23 | 11% |
| Salvage | 1300 | 865 | 67% | 9 | 6% |

_Pick rate is the read on a card: one nobody keeps does not exist, whatever it would score. Two piles serve the table and each is dealt against its own choice, so pick rates inside a pile compare and the two piles do not; setup takes out the rival cards a table this size cannot use, so the offered column is not flat across seat counts._

## Where cards fail

| card | first step | started | round started (median) | lost per 100 started: kill / Piracy / fuel | rounds from step to score (median) | scored | started, open at the end |
|---|---|---|---|---|---|---|---|
| Deliver | crate loaded | 95% | 3 | 7 / 12 / - | 8 | 73% | 15% |
| Destroy | target hit | 94% | 3 | - | 4 | 62% | 31% |
| Intercept | target scanned | 95% | 2 | 72 / 29 / - | 7 | 60% | 17% |
| Survey | dive made | 84% | 1 | 87 / 47 / - | 12 | 22% | 42% |
| Piracy | item taken | 63% | 8 | 84 / 29 / - | 9 | 14% | 22% |
| Tanker | in a planet's well with 5 fuel | 70% | 12 | 2 / 0 / 239 | 2 | 22% | 13% |
| Escort | marker placed | 49% | 10 | 57 / - / - | 6 | 23% | 13% |
| Salvage | box taken | 48% | 15 | 67 / 28 / - | 8 | 9% | 22% |

_Shares are of the cards kept. A loss is the item gone before it scored: the ship destroyed with it aboard (for Escort, the marked ship), a pirate taking it, or a Tanker leaving the planet's well or burning under the fuel it needs. The step to score is timed from the last time the step was done. A card still open at the end was started, holds its item, marker or fuel, and the game ended first._

