/**
 * The room the board is in.
 *
 * The sky has to do two contradictory things: stop the board floating on flat
 * black, and stay so dark that it never lifts the black behind a sector number.
 * The way through is frequency, not brightness — big soft shapes at the
 * luminance of the felt itself, nothing anywhere near the luminance of the
 * plates.
 *
 * The clouds are baked once on the CPU into a small equirectangular texture
 * rather than evaluated per pixel. A nebula covers every pixel on screen, so a
 * four-octave fbm in the fragment shader is the single most expensive thing the
 * scene could possibly do and the single least valuable: the result is blurry
 * by design. Baking it costs about twenty milliseconds at start-up and nothing
 * afterwards. Nothing is fetched — the texture is generated, like every other
 * surface here.
 *
 * Mipmaps are off on purpose: the only visible artefact of an equirect sky is
 * the derivative blow-up at the ±pi seam, and with no mip levels to choose
 * between there is nothing for the driver to get wrong.
 */
import {
  Color,
  DataTexture,
  LinearFilter,
  LinearSRGBColorSpace,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'

export const NEBULA_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const NEBULA_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uHorizon;
  uniform float uIntensity;
  varying vec3 vDirection;

  void main() {
    vec3 d = normalize(vDirection);
    vec2 uv = vec2(atan(d.z, d.x) * 0.1591549 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.3183099 + 0.5);
    vec3 color = texture2D(uMap, uv).rgb * uIntensity;
    // The band just above the board's plane keeps a touch more light, so the
    // wells sit against something rather than in front of nothing.
    color += uHorizon * exp(-abs(d.y) * 2.6);
    // One bit of noise: at these luminances 8-bit output bands visibly.
    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    color += (dither - 0.5) * 0.0035;
    gl_FragColor = vec4(max(color, 0.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function hash3(x: number, y: number, z: number): number {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  h -= Math.floor(h)
  return h
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

function value3(x: number, y: number, z: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const fx = smooth(x - xi)
  const fy = smooth(y - yi)
  const fz = smooth(z - zi)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const c00 = lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), fx)
  const c10 = lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), fx)
  const c01 = lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), fx)
  const c11 = lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), fx)
  return lerp(lerp(c00, c10, fy), lerp(c01, c11, fy), fz)
}

function fbm(x: number, y: number, z: number, octaves: number, ridged = false): number {
  let sum = 0
  let norm = 0
  let amplitude = 0.5
  let px = x
  let py = y
  let pz = z
  for (let i = 0; i < octaves; i++) {
    const n = value3(px, py, pz)
    sum += amplitude * (ridged ? (1 - Math.abs(n * 2 - 1)) ** 2 : n)
    norm += amplitude
    px = px * 2.03 + 11.3
    py = py * 2.03 + 7.7
    pz = pz * 2.03 + 5.1
    amplitude *= 0.5
  }
  return sum / norm
}

export interface NebulaPalette {
  /** The darkest the sky ever gets — the table's own felt. */
  base: string
  /** The navy the clouds are made of. */
  cloud: string
  /** A colder second lobe, so the sky is not one flat wash. */
  cold: string
}

/**
 * Bake the sky. `width` is the equirect width; 320 is plenty for something this
 * soft, 160 for the cheap path. The caller owns the texture and disposes it.
 */
export function buildNebulaTexture(palette: NebulaPalette, width = 320, octaves = 4): DataTexture {
  const height = Math.max(2, Math.round(width / 2))
  const data = new Uint8Array(width * height * 4)
  // Mixed in display space and stored as sRGB bytes: eight bits of linear
  // would quantise a colour this dark to two or three distinguishable values.
  const base = new Color().setStyle(palette.base, LinearSRGBColorSpace)
  const cloud = new Color().setStyle(palette.cloud, LinearSRGBColorSpace)
  const cold = new Color().setStyle(palette.cold, LinearSRGBColorSpace)

  for (let j = 0; j < height; j++) {
    // Latitude, evenly in sin so the poles are not over-sampled.
    const v = (j + 0.5) / height
    const lat = (v - 0.5) * Math.PI
    const cy = Math.sin(lat)
    const cr = Math.cos(lat)
    for (let i = 0; i < width; i++) {
      const u = (i + 0.5) / width
      const lon = (u - 0.5) * Math.PI * 2
      const dx = Math.cos(lon) * cr
      const dz = Math.sin(lon) * cr

      // Two lobes at different scales, plus filaments, minus dust.
      const big = fbm(dx * 1.6, cy * 1.6, dz * 1.6, octaves)
      const lobe = Math.max(0, big - 0.42) / 0.58
      const veil = fbm(dx * 3.4 + 19, cy * 3.4 + 7, dz * 3.4 + 3, octaves)
      const filament = fbm(
        dx * 5.5 - 4,
        cy * 5.5 + 12,
        dz * 5.5 - 9,
        Math.max(2, octaves - 1),
        true
      )
      const dust = fbm(dx * 2.9 + 31, cy * 2.9 - 5, dz * 2.9 + 17, Math.max(2, octaves - 1))

      // The galaxy runs across the sky, not around the board's own plane.
      const plane = Math.exp(-((cy * 2.4 - dx * 0.5) ** 2) * 1.6)

      const cloudAmount = lobe ** 1.35 * (0.5 + 0.5 * plane) * (0.55 + 0.45 * filament)
      const coldAmount = Math.max(0, veil - 0.52) / 0.48
      const shadow = 1 - Math.max(0, dust - 0.58) / 0.42

      const r = base.r + (cloud.r * cloudAmount + cold.r * coldAmount * 0.42) * shadow
      const g = base.g + (cloud.g * cloudAmount + cold.g * coldAmount * 0.42) * shadow
      const b = base.b + (cloud.b * cloudAmount + cold.b * coldAmount * 0.42) * shadow

      const o = (j * width + i) * 4
      data[o] = Math.min(255, Math.round(r * 255))
      data[o + 1] = Math.min(255, Math.round(g * 255))
      data[o + 2] = Math.min(255, Math.round(b * 255))
      data[o + 3] = 255
    }
  }

  const texture = new DataTexture(data, width, height, RGBAFormat)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}
