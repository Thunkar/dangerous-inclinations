# Shipyard integration and UI design plan

Status: the first production implementation is in place. The sequence below
records its design and review criteria. Sensor/radiator refinements, shared models,
validated cosmetics, the production loadout screen, board integration, and shared
UI styling have been implemented. Physical printing and additional engine-layout
customization remain later work.

The Kestrel workshop becomes the basis of the production loadout editor, its ship
becomes the 3D board miniature, and its visual language becomes the application's
shared design system. Keep the standalone workshop as a development playground
using the same model and editor components.

## 1. Design commitments

- Preserve the current corvette's default proportions, engine dimensions, and
  integrated stern. These are the reference design for the first release.
- Preserve the longitudinal compressor tanks, four-warhead missile silos, exposed
  shield coils, paired railgun rails, and PDC turret direction.
- Keep five interchangeable subsystem mounts: one forward and four side mounts.
  Customization must preserve their interfaces and readable silhouettes.
- Separate body paint, player identification, and interface interaction colors.
  Player identification stays fixed by seat throughout a match.
- Appearance has no effect on stats, movement, targeting, or loadout legality.
- Develop the display model now. Manufacturing geometry is a later deliverable;
  attachment conventions should make replacing the model straightforward.

## 2. Final geometry pass in the workshop

### Sensor array

Replace the single dish with a compact, faceted sensor assembly: three or four
flat antenna faces looking in different directions, a paired optical/infrared
lens cluster, and a short protected antenna spine. Repeated panel elements should
make it read as an array even from the board camera. Recess the assembly into the
existing bow collar, with enough exposed faces to remain visible from above.

Use broad supports and shallow relief. Avoid a tall mast or a forest of fragile
antennae. Keep the forward magnetic shoe and the current nose envelope.

### Radiator

Replace the deep fin cassette with two thin, broad panels running fore–aft,
canted slightly away from the hull on a shallow root manifold. Give each panel a
clear front and back, a slim perimeter frame, and restrained parallel coolant
traces. The broad faces should dominate its appearance; pipes and brackets are
secondary details.

The panels gain area along the hull and vertically, with substantially less
outward projection than the current cassette. Check adjacent modules at both
port and starboard mounts, especially the compressor and turret. A small number
of supported panels also provides a better starting point for a future printed
part than many fine fins. Panel thickness remains a visual parameter until a
physical scale and manufacturing process are chosen.

**Review artifact:** matching perspective, top, broadside, and miniature-size
views of both revisions, plus crowded mixed loadouts. Settle these shapes in the
workshop before carrying them into production.

## 3. Player customization

Offer a small set of useful controls in an **Appearance** tab. Default every
control to today's corvette; include a clear reset action.

| Control         | First production version                                               |
| --------------- | ---------------------------------------------------------------------- |
| Hull paint      | Curated industrial swatches and a custom color picker.                 |
| Secondary paint | Smaller armor panels and trim, independently colored.                  |
| Livery          | A few panel/stripe patterns that preserve dedicated identity markings. |
| Surface finish  | Matte paint or exposed metal; subtle, bounded roughness changes.       |
| Armor relief    | A short slider changing panel depth within a tested envelope.          |
| Dorsal profile  | Low, standard, or raised spine, preserving mount clearances.           |
| Wear            | A restrained clean-to-weathered setting; no effect on damage state.    |
| Identification  | Read-only seat-color swatch, applied to protected hull markings.       |

Keep hull length and engine size at the accepted baseline in the first release.
The workshop retains its wider length, beam, armor, and engine controls. Additional
player options, including the one-/five-engine arrangements, can follow once
their board silhouettes and module clearances have been reviewed. This gives
players visible design choices without making every authoring parameter part of
the multiplayer contract.

Identification bands need a contrasting neutral backing, a seat symbol/number,
and the existing board marker. A player's body paint may resemble another seat's
color; identification must remain clear regardless. Body colors cannot replace
or recolor those dedicated markings. The UI's warm interaction color is a separate
theme token and is never treated as a player's ship accent.

### Save and synchronization contract

Introduce a small, versioned `ShipAppearance` value in the shared engine types,
separate from `ShipLoadout`. It contains only approved cosmetic parameters, with
central defaults and bounds. It contains no seat accent, subsystem choices,
camera settings, print dimensions, or arbitrary asset URLs.

- Store appearance on the match's `Player` record, so ship reconstruction during
  setup or respawn cannot accidentally erase it.
- Extend the existing loadout submission to accept appearance alongside the
  loadout and mission IDs. Validate the entire submission and save it atomically.
  Lock appearance with the submitted loadout for that match.
- Publish submitted appearance through `PlayerView`. Unsaved edits stay local.
  Derive accent from the existing seat mapping in `utils/playerColors.ts`.
- Keep a local draft keyed by game and player, and a separate remembered cosmetic
  preference for the next game. Server state wins after submission/reconnection.
  Cross-device cosmetic profiles can be added later.
- Missing appearance in older submissions, saves, recordings, bots, and simulator
  fixtures resolves to the default corvette. Reject malformed new submissions;
  use explicit version migration/fallback for stored designs.
- Persist appearance in game state so recordings capture it in their initial
  state and snapshots. Verify replay, rewind, fork, and respawn preserve it.
  Cosmetic defaults and bot variation must not consume gameplay RNG.
- Keep old recording states structurally intact when possible: resolve missing
  appearance at the presentation boundary rather than silently rewriting every
  historical snapshot. Adding an optional field should not require invalidating
  otherwise compatible recordings.

## 4. Shared ship rendering

Extract the geometry from `src/dev/ship-workshop` into a production module, for
example `ui/src/ships/`. Separate appearance, mount definitions, hull/module
builders, materials, and the React viewport. The workshop becomes a consumer.

There should be two adapters into one visual model:

1. **Editor adapter:** a private loadout draft plus appearance, selected mount,
   and inspection settings.
2. **Game adapter:** a filtered `PlayerView` plus seat identity and the existing
   animation state. It never needs an opponent's authoritative loadout.

Represent slots explicitly as empty, unknown, or known. A known slot carries
type, knowledge source, and permitted condition/energy data. Unknown is not an
empty bay: every unknown slot uses a standard opaque cover regardless of its
underlying subsystem. A privately scanned module appears only to that observer;
publicly revealed modules appear to everyone. Broken visuals require known
damage information.

The prototype's global concealed toggle is insufficient for this. Its root also
stores the full workshop config in `userData`; production metadata must contain
only permitted visual data. Unknown identity must not affect mesh names,
silhouettes, shadows, tooltips, thumbnails, exports, or cached render variants.

Keep the current axes (`+X` forward, `+Y` up, `-Z` port) and mount IDs. Expose stable
anchors for mount selection, engine nozzles, exhaust, and a hull impact envelope.
The existing movement, banking, recoil, arrival, and impact effects should use
these anchors when the board's old dart mesh is replaced.

### Detail and performance

Use one design with two detail levels: a detailed editor view and a simplified
board view. The board needs recognizable modules and identity markings; tiny
fasteners and concealed internal mounting geometry can disappear at that scale.

- Reuse immutable geometry and batch compatible meshes by material, retaining
  logical groups where selection or animation requires them.
- Keep mutable paint, selection, and engine-glow materials owned by the instance.
  Repainting should not rebuild geometry; changing one module should not rebuild
  the whole ship. Define disposal ownership for shared resources explicitly.
- Render editor scenes on demand. Use cached thumbnails or a shared rendering
  path for small cards instead of mounting a full WebGL canvas in every card.
- Preserve lazy loading and the existing 2D board. Provide an accessible slot-list
  editor when WebGL is unavailable; ship setup must remain fully usable.
- Record draw calls, frame time, memory, and loading cost before/after on the same
  four-player board and mobile viewport. Establish a measured budget before
  enabling the detailed model in production. Repeated editor changes must not
  accumulate GPU resources.

## 5. The production loadout editor

Use the workshop's stage-and-inspector layout, with game setup integrated into it:

| Area                 | Contents                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Main stage           | Ship, selectable mount labels, camera presets, recenter, optional exploded inspection.                     |
| Systems inspector    | Five-slot list, compatible modules, selected-system details, actual engine-derived stats, loadout presets. |
| Appearance inspector | Cosmetic controls and fixed identification swatch.                                                         |
| Mission area         | Offered missions, selected count, subsystem requirements, and clear missing-requirement feedback.          |
| Persistent footer    | Slot/mission readiness, the blocking reason if any, and the existing submission action.                    |

Keep missions visible alongside ship preparation on desktop. On a narrow screen,
stack the stage and use Systems / Appearance / Missions tabs, with readiness and
the submit action always reachable. Reuse selection and inspection patterns from
the workshop, with larger text and touch targets where production requires them.

Clicking a mount selects its inspector entry; every action also works through
ordinary focusable controls. Drag-and-drop can remain an enhancement. Presets
change loadout without resetting cosmetics. Changing a system immediately updates
stats and mission compatibility without silently removing chosen missions.

Preserve `validateLoadout`, `canInstallInSlot`, calculated stats, the required
mission count, and `missionsMissingSubsystems`. Intercept and Survey currently
require sensors; those constraints must be as clear here as in today's screen.
Preserve errors, pending submission, submitted/waiting state, reconnect handling,
spectator behavior, and table talk.

Keep resin inspection, physical dimensions, GLB export, unrestricted proportions,
and full-design JSON links in the development workshop. Production can offer a
cosmetic preset save/reset without accidentally sharing private mission or loadout
data. Existing workshop saves get an explicit conversion to supported cosmetic
settings if import is offered; they are not multiplayer submission payloads.

## 6. Carry the workshop aesthetic throughout the UI

Build on the existing MUI theme and shared components. Extract the workshop's
design tokens instead of importing its global stylesheet into the application.

- **Surfaces:** matte graphite and green-gray plates, subtle elevation changes,
  restrained borders, and less saturated decorative glow.
- **Typography:** clear sans-serif headings/body text; monospace for quantities,
  slot labels, and technical annotations. Avoid making ordinary instructions tiny.
- **Color:** bone-white primary text, sage-gray secondary text, warm sand/copper
  interactions. Preserve distinct semantic colors for energy, heat, hull, fuel,
  errors, and player identity.
- **Controls:** consistent compact buttons, segmented tabs, sliders, swatches,
  cards, focus rings, disabled states, and selection treatments.
- **Layout:** the workshop's calm spacing and strong content hierarchy, scaled
  for a dense game table as well as a spacious setup screen.

Define tokens independently of React so both MUI and the Three.js palette can
consume them. Update hard-coded board ink and lighting deliberately, reviewing
range overlays, sector labels, selection, and player contrast in both renderers.

### Screen coverage

| Surface                         | Intended treatment                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| App shell, lobby browser, lobby | Shared navigation, plate/card styling, readable player identity and readiness.                                     |
| Loadout                         | Full workshop-derived experience described above.                                                                  |
| Deployment                      | New miniature, matched control panels, preserved sector selection.                                                 |
| Active table                    | Consistent action, route, sequence, status, and mission panels.                                                    |
| Own ship and opponents          | Ship imagery and matching module language, with immediate energy controls and clear hidden/revealed/broken states. |
| Log, chat, dice, rules, dialogs | Same typography, surfaces, semantic colors, and interaction states.                                                |
| Results and recordings          | Consistent standings, recording lists, replay controls, and ship identity.                                         |

The energy mat remains optimized for powering systems quickly. A decorative ship
view must not add camera manipulation to energy allocation or obscure the cubes.
Keep public energy visible on unknown opponent slots. Reuse module names/icons
and selected-state treatments across setup and play.

Review desktop, narrow screens, keyboard focus, reduced motion, and colorblind
identification. The UI redesign includes the 2D fallback and error/loading states.

## 7. Implementation sequence and completion gates

Each stage should leave a runnable application and a concrete review artifact.

| Stage                   | Deliverable                                                                                          | Completion gate                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1. Model refinement     | New sensor array and radiator in the standalone workshop.                                            | Agreed shapes visible at editor and board scale; adjacent modules fit; reference corvette and engines retained.                    |
| 2. Shared foundations   | Production ship builder/viewport, appearance defaults, shared visual tokens; workshop consumes them. | Existing workshop features still work; per-slot visual states supported; ownership/disposal and baseline render costs established. |
| 3. Cosmetic persistence | Optional validated appearance submission, public view, defaults, local drafts.                       | Two clients agree on appearance and fixed seat identity; old saves/bots work; reconnect/replay/respawn preserve it.                |
| 4. New loadout screen   | Stage, Systems/Appearance controls, mission selection, ready state.                                  | Complete setup with mouse, keyboard, mobile, and no WebGL; all existing legality and mission constraints retained.                 |
| 5. Board integration    | Simplified ship in deployment, live games, and replay.                                               | Correct facing/scale, hidden information, effects, picking, and measured four-player performance.                                  |
| 6. UI-wide adoption     | Remaining screens and shared component styles.                                                       | Whole navigation/setup/play/replay flow has coherent visuals; semantic colors and dense controls remain legible.                   |

Stage 1 comes first. Establish tokens in stage 2, then use them in the new loadout
screen before rolling them through every surface. Build the production editor
before replacing board ships so the same approved model and appearance contract
drive both. Keep the standalone entry point for future design iterations.

### Targeted regression coverage

- Appearance validation/defaults and API compatibility; cosmetic changes leave
  rule outcomes and gameplay RNG unchanged.
- Loadout and mission submission, failure recovery, and authoritative state after
  reconnect. Cosmetic drafts do not overwrite a submitted design.
- Own, unknown, scanned, revealed, and broken modules across two players and a
  spectator. Compare unknown representations for different underlying loadouts;
  check metadata as well as appearance.
- Reveal/repair/destruction changes during event playback and replay scrubbing,
  respecting the existing animation timeline and committing view changes at the
  correct point. No early reveal from the turn's final state.
- All appearance extremes, valid module placements, and mixed loadouts: finite
  geometry, no clipping, readable markings, stable board footprint.
- Coast/burn/jump/recoil, impact, respawn, target selection, drag-versus-click,
  and 2D/3D switching. Keep a stable board scale independent of module loadout;
  validate the largest permitted envelope instead of auto-scaling each ship.
- Old recordings, new recordings, rewind/fork, and repeated renderer mount/unmount.
  Capture representative screenshots and profile the actual worst-case scene.

## 8. File map for implementation

| Concern                       | Existing integration points                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Workshop model and editor     | `ui/src/dev/ship-workshop/{config,model,Viewer,main,workshop.css}`                                                           |
| Loadout flow                  | `ui/src/components/screens/LoadoutScreen.tsx`, `ui/src/components/loadout/`, `ui/src/context/GameContext.tsx`, UI API client |
| Appearance data and filtering | `engine/src/models/game.ts`, proposed appearance module, `engine/src/game/{setup,view}.ts`                                   |
| Server submission/persistence | `server/src/schemas/game.ts`, `server/src/routes/game.ts`, `server/src/services/gameService.ts`                              |
| Replay compatibility          | `engine/src/recording/`, `server/src/services/recordingService.ts`, replay context/screens                                   |
| Board model and effects       | `ui/src/components/board/model.ts`, `three/scene/Ships.tsx`, `three/scene/effects/`, `ui/src/context/AnimationContext.tsx`   |
| Shared styling and identity   | `ui/src/theme.ts`, `ui/src/utils/playerColors.ts`, `ui/src/components/common/`, `ui/src/components/board/three/palette.ts`   |
| Active play                   | `ui/src/components/table/`, `ui/src/components/ship/`, screen chrome and dialogs                                             |

## 9. Later: physical miniature and authored assets

Keep the mount IDs, coordinate conventions, appearance material roles, and effect
anchors documented as the asset contract. An authored hull/module set can later
implement the same contract using glTF assets. Document which cosmetic variations
an authored asset supports and provide sensible defaults for others.

A printable miniature needs a separate pass for solid geometry, actual units,
magnet pockets and polarity, tolerances, minimum walls, supported details, and
test prints. Retain the agreed visual proportions while simplifying small parts
as necessary. The thin radiator panels in particular need a physical thickness
and attachment review. Display GLB export is not a manufacturing deliverable.

Implementation review entry points:

- `/dev-ship.html`: unrestricted authoring workshop and print-reference controls.
- `/dev-loadout.html`: production loadout screen with a local two-seat game.
- `/?showcase=1&board=3d&bots=4`: production table/replay with filtered ship modules.

The first rendering check measured 408 meshes in a representative detailed ship
and 11 material batches / 16,550 triangles in its board version. This is a geometry
budget check; headless software rendering is not a mobile hardware performance
benchmark. Hardware profiling and visual iteration can continue in these harnesses.
