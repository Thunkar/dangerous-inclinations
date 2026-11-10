// The types of plates.mjs, which is plain JavaScript and not type-checked.

/** An STL's triangles as indexed vertices, its box moved to start at the origin. */
export interface Mesh {
  vertices: [number, number, number][]
  triangles: [number, number, number][]
  size: number[]
  lo: number[]
}

export function readStl(path: string): Mesh
export function loose(mesh: Mesh, near?: number): Omit<Mesh, 'lo'>[]
export function counts(plate: { parts: unknown[] }): [string, number][]
export function buildPlates(): {
  plate: { id: string; title: string; colour: string }
  file: string
  pieces: number
  used: [number, number]
  gap: number
}[]
