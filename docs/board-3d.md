# The 3D board: plan

A second renderer for the board in the middle of the table. Same `GameView`,
same plan previews, same events; the black hole, the planets and the ships
drawn in WebGL with lighting, motion and effects. The rest of the UI (mats,
action column, log, talk, dice) does not change, and the 2D board stays
available behind a toggle.

This is a playtest aid, not a rule. Nothing in it may make a position, range
or path read differently from the paper board: every coordinate still comes
from `components/board/geometry.ts`, every rule answer from the engine.

## 1. What exists today

`components/board/GameBoard.tsx` does two jobs at once:

1. **Derives a render model** from three contexts. From `GameContext`: the
   view. From `AnimationContext`: the turn overlay (ship positions, facings,
   in-flight tweens, missiles, stations), the transient effects and the clock.
   From `PlanContext`: planned path, weapon range, targetable ships, planned
   missile paths, jumpable lanes, route planner state, deployment sectors.
2. **Draws it as SVG** through seven layers under one pan/zoom `<g>`, with
   its own click-versus-drag logic and three buttons.

Everything the board knows about coordinates lives in `geometry.ts`: an
origin-centred plane, black hole at (0,0), planets 645 units out at 120°,
ring radii, sector angles, `positionPoint`, `interpolatePositions`,
`sectorWedgePath`. Nothing rule-shaped is in there.

`AnimationContext` replays a turn's `GameEvent[]` over a snapshot and
publishes: `overlay` (with `motion: {from, start, duration}` per moving
ship), `effects` (`beam`, `burst`, `float`, `tween`; each `{start,
duration}` with points in board coordinates), `dice`, `pulses`, `now`. The
`now` value is bumped through React state on every animation frame while an
effect is alive, which re-renders every consumer of the context (the whole
`TableScreen`) at 60 fps.

Board usages: `TableScreen` (live game and replay, via `TableRoot`) and
`DeploymentScreen`. Both have a header slot where a toggle can sit.

## 2. Architecture

### 2.1 One model, two renderers

```
                      ┌───────────────────┐
  GameContext ──────▶ │                   │ ──▶ GameBoardSvg   (today's layers, unchanged)
  AnimationContext ─▶ │  useBoardModel()  │
  PlanContext ──────▶ │                   │ ──▶ GameBoardThree (new, lazy-loaded)
                      └───────────────────┘
                              ▲
                      BoardModeContext ('2d' | '3d', persisted)
```

- **`useBoardModel()`** (`components/board/model.ts`): the derivation half
  of today's `GameBoard.tsx`, extracted verbatim. Returns `ships`, `homes`,
  `stations`, `missiles`, `plannedPoints`, `focusWeapon`, `selectableIds`,
  `missilePreviews`, `activeLaneIds`, `freeDeploymentSectors`, `route`,
  `picking`, the callbacks (`pickTarget`, `setRouteDestination`, `onDeploy`),
  `overlay`, `effects`, and `colorOf`/`nameOf`. Both renderers consume it, so
  a rule preview can never diverge between the two boards.
- **`GameBoard.tsx`** keeps its name and props and becomes the switch:
  reads the mode, renders `GameBoardSvg` or a `React.lazy` `GameBoardThree`
  inside `Suspense` with a small "loading 3D board" plate. Callers do not
  change.
- **`BoardModeContext`** (`context/BoardModeContext.tsx`): `mode`,
  `setMode`, `canRender3d`. Persisted in `localStorage` under
  `di.boardMode` (the same pattern as `playerId`). `canRender3d` probes for
  a WebGL2 context once; without it the mode is forced to `2d` and the
  toggle is disabled with a tooltip saying why. A `?board=3d|2d` query flag
  overrides the stored value for the session (useful for screenshots and
  deep links, like `?game=`).
- **`BoardModeToggle`**: a two-state chip (`2D` / `3D`) in the header of
  `TableScreen` next to the rules chip, and in the `DeploymentScreen`
  header. Style follows the existing chips (transparent, plate edge, amber
  when selected).

### 2.2 The clock leaves React state

Move the per-frame `now` out of `AnimationContext`:

- The context keeps `overlay`, `effects`, `dice`, `pulses`, `skip`. Effects
  expire on a timer per effect (their durations are known) instead of being
  pruned inside the rAF loop.
- A `useBoardClock(active)` hook owns the rAF loop and returns `now`; only
  `GameBoardSvg` calls it. The 2D board looks exactly as before, and the
  mats, log and action column stop re-rendering at 60 fps.
- `GameBoardThree` never reads `now` from React. Its `useFrame` callbacks
  read `performance.now()` and evaluate the same `{from, start, duration}`
  tweens and `{start, duration}` effects directly.

This refactor is a prerequisite: a React re-render storm inside a
react-three-fiber scene is the single most common cause of a slow 3D UI.

### 2.3 Coordinates

`geometry.ts` stays the single source. `components/board/three/world.ts`
adds:

- `toWorld(point: Point, elevation = 0): Vector3` mapping board `(x, y)` to
  world `(x, elevation, y)` with Y up. Viewed from above, the 3D board is the
  2D board: sector 0 of the black hole is away from the default camera,
  sectors increase clockwise, the planets sit where they are printed.
- `ringElevation(wellId, ring)`: the black hole's rings dip toward the
  horizon (a shallow gravity funnel) and the planets' rings dimple slightly.
  Tokens, paths and wedges sample it, so nothing floats. The funnel is a
  display choice; a `FLAT_BOARD` constant switches it off. See §6.
- A **layer table** of small elevations (plate 0, rings, lanes, wedges,
  paths, tokens) so overlays never z-fight with the surface.
- `arcSamples(from, to, n)`: `interpolatePositions` lifted to 3D for
  ribbons, dashed paths and tweens.

### 2.4 Interaction parity

Every affordance of the SVG board exists in the 3D one:

| 2D today | 3D |
| --- | --- |
| Wheel zoom, drag pan, +/−/recentre | Damped camera controls (orbit, pan, dolly) bounded to the board; same three buttons plus camera presets (§4.7) |
| Click a targetable ship | Raycast click on the ship mesh; a press that travels more than 4 px is a camera drag, not a click (same threshold as today) |
| Deployment wedges, hover glow | Wedge meshes with hover material; click deploys |
| Sector picker (route destination) | Invisible wedge meshes over every sector, hover-lit, crosshair cursor |
| `<title>` tooltips | drei `Html` tooltips styled like the MUI tooltip, shown on hover, never between pointer and target |
| Active-player ring, selectable pulse, "me" dot | Same marks as lit rings and emissive pulses around the hull |
| Lane highlight for jumpable arcs | Brighter, flowing lane ribbon |

Hidden information does not change: the model is derived from `GameView`
and the filtered events, exactly as now.

## 3. Dependencies

| Package | Version checked 2026‑09‑15 | Why |
| --- | --- | --- |
| `three` | 0.186.0 | renderer |
| `@types/three` | 0.186.0 | types |
| `@react-three/fiber` | 9.7.0 | React 19 reconciler for three (peer `react >=19 <19.3`; we run 19.2.0) |
| `@react-three/drei` | 10.7.8 | `CameraControls`, `Text` (SDF glyphs), `Html`, `Line`, `Trail`, `Stars`, `Billboard` |
| `@react-three/postprocessing` + `postprocessing` | 3.1.1 / 6.39.5 | bloom, vignette, optional lensing pass |

All added to `ui/` only. The 3D board is a separate Vite chunk (via
`React.lazy`, plus a `manualChunks` entry for `three` so a 2D user never
downloads it). No binary assets in the first pass: ships, stations and
planets are procedural meshes and shaders. Optional glTF hulls can come
later under `ui/public/assets/models/`.

## 4. The scene

Palette and type stay within `theme.ts`: graphite/navy space, amber for
anything interactive or hot, player colours on ships and homes, planet
colours from `WELL_VISUALS`, monospace for every number.

### 4.1 Environment
- Deep-space backdrop: a `Stars` field with slow parallax and a faint
  nebula gradient shader in the theme's navy so the board never sits on
  pure black.
- Lighting: one cool key light from above, the accretion disc as an amber
  point light at the centre, a dim hemisphere fill. Bloom (threshold high,
  so only emissive elements glow) and a soft vignette.

### 4.2 Black hole
- Event horizon: a black sphere with a thin amber rim (Fresnel shader).
- Accretion disc: a flat ring with a custom shader (rotating noise, hotter
  toward the inner edge, additive blending), tilted a few degrees so it
  reads as a disc rather than a line.
- Gravity funnel: the five rings drawn as emissive ribbons at their
  `ringElevation`, the plate between them as a dark shaded surface, so the
  well is visibly a well.
- Ring velocity made visible: each ring carries a faint dashed pattern that
  drifts prograde at a speed proportional to `velocity` (8 on ring 1, 1 on
  ring 5). This is the movement rule, animated. Sector ticks and all 24
  labels per ring stay, laid flat on the ring surface in SDF text, sector 0
  in amber, sized by the same rule as the SVG board.
- Second pass (optional, §5 phase 4): lensing, as a screen-space distortion
  of the starfield around the horizon.

### 4.3 Planets
- Spheres with a procedural surface shader per planet (banded gas giant,
  cratered rock, ocean world) in the planet's colour, slow rotation, an
  atmosphere rim glow, and a name label below as today.
- Rings and labels as for the black hole, shallower dimple.
- Station (`scene/Station.tsx`): a depot built from the corvette's own
  material vocabulary — plated structure, steel truss, copper plumbing, cyan
  for anything live, out of `ships/palette.ts` — so it reads as coming off the
  same drawings as the ships. Storeys clear each other so the silhouette reads:
  a docking deck, radiator wings, a turning habitat ring of eight lit cans, a
  core, a mast and a beacon. The planet's colour is spent on the deck's face,
  which is the surface the table camera looks down on and the only thing that
  has to carry at that range; the deck is deliberately wider than the ring so
  the ring cannot cover it. The deck's underside clears a moored hull, so a
  docked ship parks under the station rather than inside it. It moves with
  `stations_moved` like any token.

### 4.4 Lanes
- Each lane is the same pair of 4‑sector arcs, drawn as glowing ribbons in
  the planet's colour. Direction is shown by flow: a dash pattern moving
  from the departure arc toward the arrival arc. Departure arcs are solid,
  arrival arcs dashed, A/B badges as billboarded labels. No connector
  lines across the map (a fixed point from earlier feedback).
- The arc you can jump from now brightens and flows faster.

### 4.5 Ships
- Procedural low-poly hull (a wedge fuselage, two side pods, a stern
  nozzle) scaled to about one sector wide on ring 4, player colour on the
  hull, emissive engine glow at the stern, a small light on the bow so
  facing is unmistakable from any angle.
- Marks: active player's ring on the surface below the ship; a pulsing
  amber dashed ring when targetable; a dot on your own hull.
- Homes: four landing-pad brackets in the player's colour, extruded a
  little above the surface, exactly where the 2D brackets are.
- Hover tooltip with name, hull, heat, facing (as today).

### 4.6 Missiles and paths
- Missile: a glowing dart with a short `Trail`. The projected path (drift
  arc, then flight steps) is drawn on the surface as today: solid then
  dashed, a dot at the end. Planned launches are drawn dimmer.
- Planned path and route overlay: dashed emissive lines on the surface,
  numbered pips as billboards, the destination diamond.
- Weapon range: wedge meshes on the surface with a translucent amber
  material; the sector picker and deployment wedges reuse the same wedge
  geometry generator (angles from `geometry.ts`).

### 4.7 Camera
- Default "Table" view: three‑quarter perspective from the near edge,
  pitch about 55°, framing the whole board. "Top" view: straight down, near
  orthographic, the 2D board with lighting. "Follow": frame your ship's
  well. Double‑click a body to fly to it. Transitions are damped.
- Bounds: dolly between a close well view and the full board; pan clamped
  to the board; polar angle clamped so the camera never goes under the
  plane.
- Device pixel ratio clamped to 1.5; `frameloop` runs continuously (the
  disc, planets and stars are alive) but drops to on-demand in the
  low‑power setting.

### 4.8 Effects (from the same `AnimationContext` events)
| Event | Today | 3D |
| --- | --- | --- |
| coast / burn | token slides along the ring | hull follows the arc at ring elevation, banks slightly, engine glow flares on burns |
| jump | slide plus amber burst | hull streaks in a straight line between the two arcs, flat, with a warp flash at both ends |
| weapon_fired | beam line with a head | emissive beam (railgun: thick bright bolt; laser: thin continuous line; ballistic/missile: dashed tracer) with bloom |
| attack_resolved | MISS / CRIT / -n floats, burst | same floats as billboards; hit spark particles on the hull; crit adds a white flash |
| missile_intercepted | PDC beam, INTERCEPTED | cyan tracer, small detonation puff |
| ship_destroyed | red burst, DESTROYED | debris particles, hull fades, red shockwave ring |
| docked / mission_completed | green burst, DOCKED / MISSION | green pulse from the station, float |
| heat_damage | "n heat" float | float plus a brief orange shimmer on the hull |
| respawned / deployed | green burst | hull fades in over the Home brackets |
| subsystem_broken / revealed | mat pulse (unchanged) | mat pulse (unchanged) |

Durations and the `BEAT` table are untouched; the 3D board only changes
what is drawn during each beat, never how long a turn takes to play.

## 5. Phases

Each phase leaves the app working and the 2D board unchanged.

**Phase 1 — Split and toggle (no visual change).**
Extract `useBoardModel`; move the SVG renderer to `board/svg/`; move the
clock into `useBoardClock`; add `BoardModeContext`, the toggle chip in both
headers, the lazy switch with a placeholder for the 3D side. Verify with
before/after screenshots of the live table and the deployment screen
(recipe in memory notes; add the `?board=` flag to it).

**Phase 2 — 3D skeleton with full parity.**
Dependencies, `Canvas`, camera rig with bounds and presets, `world.ts`,
wells as ribbons and labels, lanes, ships as simple wedges, stations,
homes, missiles and paths, all overlays (range, planned path, route,
sector picker, deployment), click and hover. Acceptance: every row of the
§2.4 table works in 3D; a full bot game and a deployment can be played
entirely on the 3D board.

**Phase 3 — Animation parity.**
Tweens from `overlay.motion`, beams, bursts, floats, jump streaks, destroy
and dock effects, driven by the existing context in `useFrame`. Acceptance:
a replay played at 900 ms per turn shows every event in both boards with
the same timing.

**Phase 4 — Showcase.**
Accretion disc and horizon shaders, gravity funnel, planet surface and
atmosphere shaders, starfield and nebula, bloom and vignette, ring‑velocity
flow, lane flow, engine glow, trails, particles, camera fly‑to. Optional:
lensing pass, glTF hulls.

**Phase 5 — Hardening.**
WebGL fallback, low‑power mode, DPR clamp, disposal of GPU resources when
toggling or leaving the table, headless screenshot recipe with
`--use-angle=swiftshader --enable-unsafe-swiftshader`, a dev-only
`?showcase=1` page that renders the 3D board from a canned `GameView` and a
scripted turn of events so effects can be tuned without a server. Update
`CLAUDE.md` (key files) and the live‑run memory note.

Rough sizes: phase 1 about a day; phase 2 two to three; phase 3 one to
two; phase 4 open‑ended art, three to five days for a first good version;
phase 5 one.

## 6. Decisions for the designer

**Decided 15 Sept 2026:** the recommendations below were accepted as
written (funnel on with a `FLAT_BOARD` switch, all labels always present
with proximity fading, Table camera by default, procedural hulls; 3D stays
opt-in until playtesters have used both). Implementation is under way in
the phases of §5.


1. **Funnel or flat.** A shallow gravity funnel is the strongest single
   image the 3D board can offer and it animates the "inner rings are
   faster" rule. It also makes the black hole rings not coplanar with the
   planets', which the paper board never shows. Recommendation: funnel on
   by default, `FLAT_BOARD` constant to turn it off; decide after seeing
   phase 4.
2. **Labels at distance.** In 3D, inner‑ring numbers are unreadable from
   the full‑board view no matter what. Options: keep all 24 always (as the
   2D rule says), or fade inner-ring labels in as the camera gets close to a
   well. Recommendation: always present, opacity rising with proximity,
   never removed.
3. **Default camera.** "Table" three‑quarter view versus "Top". Top is
   safest for reading positions; Table is the showcase. Recommendation:
   Table by default with the preset buttons one click away; the choice is
   remembered with the mode.
4. **Procedural versus modelled hulls.** Procedural keeps the repository
   free of binaries and matches the instrument aesthetic; glTF hulls look
   better but need an artist and a licence. Recommendation: procedural
   first.
5. **Making 3D the default** once phase 4 lands, with 2D as the fallback.
   Not before playtesters have used both.

## 6b. What was built, and what it measured

Recorded as the phases landed, so the next person does not re-derive it.

**The flat board is provably unchanged.** The split was verified by pixel
comparison of the `?showcase=1` board at two turns: 0 differing pixels of
946,530, and 0 again over a 51-frame sweep through a turn's animation
captured under a virtual clock (`performance.now`, timers and rAF all driven
from the test), which is the only way to compare an animation frame for
frame. The whole-page diff is 327 pixels, all inside the new header chip.

**Nothing rule-shaped is left in a renderer.** Weapon range and missile paths
moved into the model. Range equivalence was checked exhaustively against the
old in-renderer sweep: 10 subsystem types x 2 slot groups x 4 energy levels x
every well, ring, sector and facing = 53,760 combinations, 0 mismatches.

**The clock refactor did what it was for.** Idle: 0 animation frames
requested. Through a played turn the board asks for frames and the rest of
the table does not re-render: over 350 drawn frames, the 3D effects tree
rendered 46 times and the ships tree 70, every one on an event boundary.

**Legibility.** Sector numbers roughly doubled from the first pass, then came
back about a tenth once the art landed, because at their largest they read as
the subject of the picture rather than as labels on a map. Black hole ring 1
holds around 7.8 pixels of ink at 1440x900, against about 4 on the flat board
in the same pane. 9 pixels is not reachable: a ring-1 sector is too short an
arc for two digits at that height without neighbours touching. Inner-ring
labels fade up as the camera approaches and are never removed.

**Opening the board out, and why it did nothing.** The wells were nearly
touching — the black hole's plate ended at 391 units, a planet's at 246, and
planets orbited at 645, leaving 8 units of clear space — so the board was grown
1.42x (bounds 1656x1507 -> 2364x2140), which put 132 units between plates.

On screen that changed nothing at all, and could not have. Both renderers fit
whatever board they are handed: the camera solves its framing from the artwork,
the viewBox is cut to it. Multiplying every board unit by the same factor is the
identity. What it did do was shrink the tokens, which deliberately keep their
board-unit size, and shrink each well, because the wells were pushed apart
inside a picture that still had to fit. The black hole came out the same size it
had been, to the pixel.

**Spending proportion instead, and framing.** Only two things can change what is
on the screen: the proportion between the board and what stands on it, and how
much of the board you are shown.

*Framing.* Neither board opens on the whole board any more. Four wells across a
triangle 2364 units wide leave each of them a fifth of the pane; the game is
played in the black hole's well, where everyone deploys and every Home is. Both
renderers now open on that well plus half as much again (`HOME_VIEW_RADIUS` in
`geometry.ts` — the flat board solves a zoom from it, the rig frames a
silhouette from it) and the planets fall off the edges. Recentre is what fits
the whole board, in one click, in both. At 1440x900 this alone is worth 1.48x on
every length in that well.

*Ring layout.* Ring 1's circumference is what caps the type on the entire board,
because 24 numbers have to fit round it, and everything inside it is the room the
body has. Ring 1 came out to meet ring 5, which did not move: the black hole's
rings went 180…476 to 250…476 and a planet's 172…300 to 192…300. Ring-1 arc per
sector 47 -> 65, its numbers up to the same cap every other ring prints at, and
the black hole from 0.416 of ring 1 to 0.500 — 75 units of radius to 125, against
a ring 5 in the same place. Paid for out of radial gap: 74 units between two
rings to 56.5, which also cost the ring captions a fifth of their size and the
funnel a third of its depth.

*Tokens.* The hull was 64 long against that 74-unit gap and a 47-unit sector, so
it overhung both and sat across the number it was standing on. It is 40 now —
0.71 of the gap, 0.61 of the sector — and lands within a sixth of the pixels it
used to, because the framing gave back more than the hull gave up.

**The black hole's ceiling, corrected.** `bodies.ts` proves that nothing the
black hole draws climbs past the far side of ring 1's numbers as they land on
screen. The test had its sign inverted — it had height *buying* ceiling instead
of spending it — which cost nothing while the hole was a marble in a wide pit and
cashed itself in the moment the hole grew: the disc's far limb went through ring
1's 22 and 1. With the sign right, the ceiling is `ink·sin P` against a reach of
`1.1·r + lift·cos P` (the lensed arc, not the silhouette, is the outermost bright
thing). Two things were bought back against it: the Table camera's shallowest
pitch, 55° -> 62°, worth about a percent of black hole per degree; and settling
the horizon 0.72 of a radius into the floor of its own pit instead of resting it
on top, which is invisible — the plate is opaque and the cut is black on dark —
and worth a sixth.

Since a camera and a viewBox both fit whatever the board is, a printed size
left alone simply lands smaller on screen. So every printed size is written as
the number it was tuned at times `PRINT_SCALE` (`geometry.ts`, shared by both
renderers): type and lane ribbons keep their apparent size, tokens keep their
board-unit size on purpose and come out smaller against a roomier board, and
opening the board out again carries the printing with it. The funnel's depth
limit follows ring spacing rather than the board, so it deepened from 170 to
197 units rim to floor.

**Trajectories bow off their ring.** A leg travelling along a ring used to be
sampled at that ring's own radius, so the track was the ring: dashes vanished
into it on the flat board and fought it for pixels in three dimensions. A track
now leaves its ring by a share of the gap to the next one, runs beside it, and
eases back down at both ends, so every mark that means a sector still sits on
the sector it names. Outward, because the inside of a ring carries its ticks
and numbers. The bow is a share of the gap and scales with how far the track
rides, so it survived the board being resized underneath it with no edit.

**Framing** went from 0.69 x 0.73 of the viewport to 0.90 on the binding axis,
centred, at every pane the table produces, and held there through the rescale.

**The funnel** is terraced: each ring sits on a flat terrace so its ribbon,
ticks and 24 numbers lie in one plane, with ramps between. Depth is set at the
occlusion limit -- from 55 degrees a ramp of length L hides the terrace below it
once its drop exceeds about 1.27 L -- which is solved rather than tuned, so it
followed the board when the rings moved apart.

**Live.** The 3D board was driven through a real three-seat game on the
server: clicking a deployment wedge placed a ship, the server accepted it and
the table played on, with no console errors in either renderer.

**Not photographed, because the bots never do it:** a point-defence intercept
and a ballistic rack. 120 seeds x 80 turns at 3 and 4 seats produced neither.
The same cyan tracer is exercised by a scan.

**Opening the rings out, and paying for it.** The rings were too close together
and the lines and numbers on them too heavy — a dial rather than a map. Ring 1
cannot move inward (24 numbers cap the type on it, and the body sits inside it),
so the gap had to be taken outward, which grows the well; and since both boards
open on that well, growing it shrinks everything in it. The bill was settled by
tightening the opening framing by exactly as much as the well grew: the margin
around the plate went from 38% of it to 16%, which is the same 691 board units
framed as before, on a plate that went from 502 to 596. The black hole rings are
250…570 (gaps 80, from 56.5) and a planet's 192…332 (gaps 70, from 54).

Measured at 1440x900 in the view the board opens in, with the same pane both
times: the ring gap 35.4 -> 49.6 px in three dimensions and 33.0 -> 46.8 px flat;
the ring line 2.49 -> 1.49 px and 0.99 -> 0.70 px; a ring-1 digit 12.2 -> 10.1 px
and 7.9 -> 6.8 px; the gap measured in ring-line widths 14.2 -> 33.2 and 33.2 ->
66.4. The black hole's body is 136.1 px before and 136.1 px after, to the tenth
of a pixel, and ring 1's on-screen radius and arc per sector are unchanged the
same way: nothing inside ring 1 moved, and everything outside it opened. A
two-digit sector number now has 2.21 times its own width of arc to sit in rather
than 1.82 (3.50 rather than 3.03 on the flat board).

Two things fell out of it. The funnel's depth is solved from the ramp between two
terraces, so wider rings would have deepened the black hole's pit from 121 units
to 223 — and depth is not free, because a camera above the table is further from
the floor of a pit than from its rim, so 100 units of extra fall took 4.6% off
the black hole's on-screen diameter. Depth is now the lesser of the occlusion
limit and half of ring 1, which is one body radius and the fall the well already
had. And `PRINT_SCALE` was measured against the board's overall height, which is
a size nobody ever sees: pushing the planets apart to keep the wells from
touching would have swollen every letter on the board. It is measured against
the framing now.

**Recentre means the opening view.** The Table preset lost its button for being
the same control twice, so Recentre is the only way back to the three-quarter
view: in both renderers it now restores the framing, pitch and zoom the board
opened in — and drops Top or Follow if one is selected — rather than fitting the
whole board. The whole board is still one or two clicks of zoom-out away, and
`frameAll` is still there for it; no control calls it.

## 7. Risks

- **Legibility at an oblique angle.** Mitigated by SDF text, the Top
  preset, proximity fading and a minimum on-screen glyph size.
- **Performance on integrated GPUs.** Bloom and the lensing pass are the
  costly parts; both sit behind the low‑power switch. Continuous frame loop
  is required for the idle animations; on-demand when low power.
- **React re-render storms.** Prevented by §2.2 and by keeping every
  per‑frame value in refs and `useFrame`.
- **Bundle size.** `three` alone is several hundred kilobytes minified.
  Lazy chunk; the 2D-only user never fetches it.
- **Drift between the two boards.** Prevented structurally by
  `useBoardModel`: neither renderer computes anything rule‑shaped.
- **Headless verification.** WebGL in headless Chromium needs the
  SwiftShader flags; screenshots will be slower (a few seconds more) but
  work.

## 8. File layout as built

```
ui/src/context/BoardModeContext.tsx   which renderer draws; persisted, ?board= overrides
ui/src/components/board/
  GameBoard.tsx            the switch (same name and props as before)
  BoardModeToggle.tsx      the 2D/3D chip in the table and deployment headers
  model.ts                 useBoardModel: everything either renderer draws
  geometry.ts              board coordinates (unchanged)
  useBoardClock.ts         rAF clock, used by the flat board only
  svg/GameBoardSvg.tsx     the flat board
  svg/layers/*.tsx         its seven layers
  three/
    GameBoardThree.tsx     Canvas, HTML overlay, dev flags
    world.ts               toWorld, the funnel profile, layer elevations, wedge geometry
    surfaces.ts            ribbon / plate / tick buffers, shared and disposed
    bodies.ts palette.ts clock.ts usePointerDrag.ts FrameStats.tsx
    CameraRig.tsx cameraRigContext.ts   controls, bounds, presets, fly-to
    fonts/                 vendored Liberation Mono (drei otherwise fetches a face)
    scene/
      Environment.tsx      sky, lights, composer, the adaptive quality ladder
      Wells.tsx BlackHole.tsx Planet.tsx RingLabels.tsx
      Lanes.tsx Markers.tsx Station.tsx Ships.tsx
      Missiles.tsx Overlays.tsx  overlays/{marks,paths,wedges,fixture}
      Effects.tsx          effects/{Beam,Burst,Float,glsl,impacts,resources,renders}
    shaders/               accretion, horizon, atmosphere, planetSurface,
                           starfield, nebula, noise, ribbon, dashedRing, quality
    dev/fixtureModel.ts    the quiet fixture for /dev-three.html
ui/src/dev/                ShowcaseScreen.tsx, showcaseGame.ts  (?showcase=1)
ui/dev-three.html, ui/dev-overlays.html   dev harnesses, not in the production build
```

Dev flags: `?board=2d|3d`, `?showcase=1&seed=&turns=&seat=`, `?preset=table|top|follow`,
`?fx=on|off`, `?quality=high|low`, `?stats=1`.
