/**
 * The yard's lofts: the hull's clipped-corner section carried along the
 * thrust axis (+X), solid or hollow. Every hull is built from them, so they
 * share one section and read as one yard's work.
 */
import { BufferGeometry, Float32BufferAttribute } from 'three'

export type Station = [number, number, number] | [number, number, number, number]

/** The eight corners of the clipped section at x, half height h, half width w. */
function ring(x: number, h: number, w: number, lift: number) {
  const c = Math.min(h, w) * 0.35
  return [
    [h, w - c],
    [h - c, w],
    [-h + c, w],
    [-h, w - c],
    [-h, -w + c],
    [-h + c, -w],
    [h - c, -w],
    [h, -w + c],
  ].map(([y, z]) => [x, y + lift, z])
}

function geometryOf(vertices: number[]): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.computeVertexNormals()
  return geometry
}

/**
 * A cross section with clipped corners, lofted along the thrust axis. An
 * optional fourth number lifts a station's centre, so a loft can taper on one
 * side and keep the other flat. Stations run aft to fore: the faces point out
 * only that way.
 */
export function armoredSection(sections: Station[]): BufferGeometry {
  const rings = sections.map(([x, h, w, lift = 0]) => ring(x, h, w, lift))
  const vertices: number[] = []
  const tri = (a: number[], b: number[], c: number[]) => vertices.push(...a, ...b, ...c)
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8
      tri(rings[r][i], rings[r + 1][j], rings[r + 1][i])
      tri(rings[r][i], rings[r][j], rings[r + 1][j])
    }
  }
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8
    const [first, last] = [sections[0], sections.at(-1)!]
    tri([first[0], first[3] ?? 0, 0], rings[0][j], rings[0][i])
    tri([last[0], last[3] ?? 0, 0], rings.at(-1)![i], rings.at(-1)![j])
  }
  return geometryOf(vertices)
}

/**
 * The section hollow, from x0 aft to x1 forward, with its own [h, w, lift]
 * at each end outside and in: outside, inside and both ends, each wound to
 * face out of the solid. (An ExtrudeGeometry hole faces into the wall, which
 * reads as see-through from inside.)
 */
export function hollowSection(
  x0: number,
  x1: number,
  outer0: [number, number, number],
  outer1: [number, number, number],
  inner0: [number, number, number],
  inner1: [number, number, number]
): BufferGeometry {
  const o = [ring(x0, ...outer0), ring(x1, ...outer1)]
  const n = [ring(x0, ...inner0), ring(x1, ...inner1)]
  const vertices: number[] = []
  const tri = (a: number[], b: number[], c: number[]) => vertices.push(...a, ...b, ...c)
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8
    tri(o[0][i], o[1][j], o[1][i])
    tri(o[0][i], o[0][j], o[1][j])
    tri(n[0][i], n[1][i], n[1][j])
    tri(n[0][i], n[1][j], n[0][j])
    tri(n[0][i], o[0][j], o[0][i])
    tri(n[0][i], n[0][j], o[0][j])
    tri(n[1][i], o[1][i], o[1][j])
    tri(n[1][i], o[1][j], n[1][j])
  }
  return geometryOf(vertices)
}
