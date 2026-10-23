// The station that orbits each planet, printed from the game's own model
// (`ui/src/ships/station.ts`): upright on its foot, every part as the board
// draws it but grown to join and thickened to print, the lights and windows
// left off. One piece, for all three planets.
import { createStation, UNITS_PER_MM } from "../../ui/src/ships/station.ts";
import { placedSolids } from "../../ui/src/ships/solid.ts";
import { FDM } from "../spec.ts";
import { subtract } from "fluidcad/core";
import { placeSolid, printFrame, unite } from "../lib/kit.ts";
import { block, type Solid } from "../lib/solids.ts";

export function buildStation(): Solid {
  const model = createStation("#ffffff");
  // The model is in mm, drawn at UNITS_PER_MM: the print undoes that and stands it up.
  const frame = printFrame(0, 1 / UNITS_PER_MM);
  const placed = placedSolids(model.root).filter((p) => p.spec.kind !== "detail");
  const pieces = placed
    .map((p) => ({ p, s: placeSolid(p, frame, { min: FDM.minFeature, grow: FDM.join }) }))
    .filter((x): x is { p: (typeof placed)[number]; s: Solid } => x.s !== null);
  // Everything touches the spine: it anchors the fuse.
  const spine = pieces.findIndex(({ p }) => p.path.at(-1) === "station_spine");
  // The foot grown to join reaches under the bed: cut it flat.
  return subtract(
    unite(
      pieces.map(({ s }) => s),
      60,
      spine
    ),
    block([-60, -60, -5], [60, 60, 0])
  );
}
