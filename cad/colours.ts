// The printed pieces' colours. The game is the source of truth: wherever it
// draws the same thing, the colour is read from its code, and whoever prints
// takes the nearest filament they have. The seats are the game's player
// colours; a planet's pieces (its station, sale chips, sector numbers, lane
// markers and coloured bands) are the planet's colour; the accretion disc,
// hull, fuel and the energy and heat cubes are the table's. Grey (the ship,
// its base and subsystems, for painting), white and black are print choices:
// the game draws those pieces in no colour a filament comes in.
import { getPlayerColor } from "../ui/src/utils/playerColors.ts";
import { wellColor, ACCRETION_ORANGE } from "../ui/src/components/board/geometry.ts";
import { TABLE } from "../ui/src/design/tokens.ts";

export const COLOUR = {
  grey: "#8c8f93",
  white: "#f2efe6",
  black: "#2b2b2d",
  alpha: wellColor("planet-alpha"),
  beta: wellColor("planet-beta"),
  gamma: wellColor("planet-gamma"),
  disc: ACCRETION_ORANGE,
  hull: TABLE.hull,
  fuel: TABLE.fuel,
  energy: TABLE.energy,
  heat: TABLE.heat,
};

export type Colour = keyof typeof COLOUR;

/** The seats' colours, in seat order. */
export const PLAYER_COLOURS = Array.from({ length: 6 }, (_, i) => getPlayerColor(i));

/** The planets, by the names the cad's parts use. */
export const PLANETS = ["alpha", "beta", "gamma"] as const;
