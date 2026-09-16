# Kestrel ship workshop

The standalone authoring workshop for the modular Kestrel ship miniature. Open
`/dev-ship.html` on the UI development server; no game, login, or backend is needed.

```sh
yarn workspace @dangerous-inclinations/ui dev --host 127.0.0.1 --port 5175
```

Then open <http://127.0.0.1:5175/dev-ship.html>.

The entry point is separate from the application and is not a production build
input. Its geometry and viewport now come from `ui/src/ships/`, shared with the
real loadout screen and 3D board. The game UI retains its original subsystem
icons; the authoring workshop uses its own line drawings. It uses installed
dependencies and local assets only.

For a standalone preview of the **production loadout screen**, open
<http://127.0.0.1:5175/dev-loadout.html>. It deals a local two-seat game, enforces
real mission/loadout requirements, and lets you submit into the waiting state.
Reloading resets that preview match; unsubmitted drafts and cosmetic preferences
are remembered locally. The actual game persists submitted appearance on the
server and in recordings.

## Try it

- Pick Hunter, Raider, Hauler, or Scout. These are the engine's actual presets.
- Click a mount on the ship or in the list, then choose a compatible subsystem.
  Removing a module exposes its magnetic interface; an incomplete loadout remains
  editable and is marked incomplete.
- Use **Exploded** and its separation slider to inspect the two magnet seats and
  the alignment key on each mounting shoe. The hull's protective shoulders and
  bow collar stay in place as the modules slide out of their equipment bays.
- Adjust hull proportions, the drive cluster, and reference magnet dimensions in
  **Hull**. Try **Heavy frigate** and the **Engines** camera together.
- Change armor and identification colors in **Finish**, or use unpainted resin
  to inspect the geometry without paint or illuminated engines.
- **Concealed loadout** replaces installed systems with matching blank covers.
  This is a visual preview of face-down tiles, not a game visibility implementation.
- The small top view keeps the ship's length at 96 CSS pixels to check whether
  the silhouette and modules survive board scale. This is not a physical scale
  calibration or a preview of a particular board camera.

Drag to orbit, scroll to zoom, and right-drag to pan. Camera buttons restore a
known angle; Recenter restores framing. The main scene renders on demand unless
Auto orbit is enabled.

## Keep an iteration

Changes are saved in this browser under `di-ship-workshop-v1`. **Save design**
downloads a versioned JSON file containing the loadout, proportions, colors, and
reference dimensions. **Open design** validates and restores it. Camera position
and inspection controls are not part of the saved design.

**Copy link** encodes that same design in the URL; the recipient needs access to
the same development server. No upload or hosted sharing service is involved.

**Export GLB** downloads the ship in its current assembled or exploded pose,
including the current finish and concealed covers when enabled. The stage,
lighting, and HTML labels are excluded. **Snapshot** saves the 3D viewport as PNG,
without the editor controls or HTML mount labels.

## Model conventions and future integration

- `+X` is forward, `+Y` is dorsal, `-Z` is port.
- Forward mount: `forward-0`. Port forward/aft: `side-0`, `side-1`.
  Starboard forward/aft: `side-2`, `side-3`, matching the existing ship mat.
- Local `+Y` is outward from every attachment point. All subsystem models share
  a paired magnetic shoe and a directional key.
- Side shoes run fore–aft; the forward shoe runs across the bow, with the two
  railgun rails side by side. The nose mount sits back inside an armored collar.
- Side modules include longitudinal pressure tanks, a four-cell missile silo
  with exposed noses, a compact laser collar, and exposed shield coils in an open
  cage. Radiators have two thin fore–aft panels, shallow coolant manifolds, and
  exposed broad faces. Sensors have four faceted arrays around paired optics.
  Ballistics use an armored PDC turret with visible traverse and
  elevation joints; these joints are posed geometry, not animated tracking.
- The railgun has two heavy rails separated by a narrow channel, individual coil
  jackets, fasteners, and cooling conduits.
- An `integrated_aft_hull` group joins the hull to the thrust bulkhead. Its shape
  follows hull proportions, engine size, and the one-, three-, or five-bell layout;
  armor strakes and feed lines carry through to the recessed engine roots.
- Fixed engines, maneuvering thrusters, and the fuel scoop belong to the hull.
- Shared `ui/src/ships/config.ts` owns parameters, slot transforms, and authoring
  JSON validation. Workshop-specific storage remains in the development entry.
- Shared `model.ts` builds named `hull_fixed_systems`, `fixed_engines`, `mount_*`, and
  `module_*` groups. Its geometry/materials are explicitly disposed on replacement.
- Shared `Viewer.tsx` owns cameras, lighting, selection, and inspection poses.
  Paint changes reuse the hull; refitting replaces only the changed module.
- `main.tsx` and `workshop.css` are the throwaway editor.

An eventual authored hull and module set can replace the geometry builders while
keeping slot IDs and attachment transforms. The production
board consumes only filtered `PlayerView` slots: each unknown slot has an
identical cover, scans remain private, and known broken modules are darkened.
Board geometry is batched by material and omits small fittings/magnetic internals.
Engine anchors feed the existing thrust animation; hull motion and targeting keep
the board's established behavior. Production render metadata contains no full
workshop configuration or hidden loadout.

The production editor separates appearance from loadout. Body/secondary paint,
livery, finish, armor relief, dorsal profile, and wear are cosmetic. Player color
is fixed by seat and remains on backed hull markings. Length, drive dimensions,
and physical-interface controls stay in this authoring workshop.

## Physical-model boundary

This is a visual concept, not a print-ready CAD assembly. Reference hull length
and magnet diameter establish relative visual scale; GLB coordinates remain
concept units. The display model has intersecting meshes and fine detailing.
Before printing, the design needs watertight solids, actual magnet pocket depth,
wall thickness, clearances, polarity/key design, printer tolerances, and a review
of protruding weapons and radiator fins. No STL or manufacturing claim is made.
