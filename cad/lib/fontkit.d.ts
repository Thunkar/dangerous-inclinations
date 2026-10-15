// The little of fontkit (FluidCAD's font engine) the board's numbers use.
declare module "fontkit" {
  export interface PathCommand {
    command: "moveTo" | "lineTo" | "quadraticCurveTo" | "bezierCurveTo" | "closePath";
    args: number[];
  }
  export interface Glyph {
    path: { commands: PathCommand[] };
  }
  export interface Font {
    unitsPerEm: number;
    layout(text: string): {
      glyphs: Glyph[];
      positions: { xAdvance: number; xOffset: number; yOffset: number }[];
    };
  }
  export function openSync(path: string): Font;
}
