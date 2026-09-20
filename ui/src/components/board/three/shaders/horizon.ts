/**
 * The shaders that make a hole visible.
 *
 * A black sphere on a black sky is nothing, so the horizon is drawn as an edge
 * rather than as a body:
 *
 *  - `HORIZON_*` paints the sphere itself. It is genuinely black in the middle
 *    (darker than the felt, so it reads as a hole cut in the table) with one
 *    hard amber line at the silhouette. The line is a high power of the Fresnel
 *    term, which makes it a rim and not a halo; a halo would fog the numbers.
 *  - `PHOTON_RING_*` is a camera-facing annulus a hair outside the silhouette:
 *    the light that went round. It carries two rings, the bright photon ring
 *    itself and a much fainter second one just outside it, the next order of
 *    the same image, and, under both, a short glow that stands for the light
 *    scattered off the hole's shoulder. It is the one lensing cue that costs
 *    nothing, and it is what stops the horizon looking like a sticker.
 *  - `LIGHT_POOL_*` is the glow pooling in the pit, on a quad lying flat in the
 *    board plane. It falls off exponentially *and* is forced to zero at the
 *    quad's edge, so it is spent long before ring 1: the numbers there must
 *    stay ink on black. A faint mottle, turning at the rate of the gas at the
 *    disc's outer edge, keeps it from reading as an airbrushed circle, and
 *    makes the widest, flattest, most face-on thing the black hole draws agree
 *    with the disc above it about which way round the light is going.
 */
import { GLSL_NOISE } from './noise'

export const HORIZON_VERTEX = /* glsl */ `
  varying vec3 vNormalWorld;
  varying vec3 vViewDirection;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

export const HORIZON_FRAGMENT = /* glsl */ `
  uniform vec3 uRim;
  uniform vec3 uVoid;
  uniform float uPower;
  uniform float uIntensity;
  varying vec3 vNormalWorld;
  varying vec3 vViewDirection;
  void main() {
    float facing = max(dot(normalize(vNormalWorld), normalize(vViewDirection)), 0.0);
    // A hard edge: at power 14 the rim is a couple of pixels wide at any zoom.
    float rim = pow(1.0 - facing, uPower);
    gl_FragColor = vec4(uVoid + uRim * rim * uIntensity, 1.0);
  }
`

/** A flat annulus or disc, kept square to the camera by its parent. */
export const PHOTON_RING_VERTEX = /* glsl */ `
  varying vec2 vPlane;
  void main() {
    vPlane = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const PHOTON_RING_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uRadius;
  uniform float uWidth;
  uniform float uIntensity;
  uniform float uHalo;
  uniform float uHaloRadius;
  uniform float uHaloRadiusUp;
  varying vec2 vPlane;
  void main() {
    float r = length(vPlane);
    // Square to the camera, so local +y is up the screen, where ring 1's far
    // numbers are. The shoulder is pulled in there and given its full reach
    // everywhere else, the same split the lensed arc is drawn with.
    float up = clamp(vPlane.y / max(r, 0.001), 0.0, 1.0);
    float haloRadius = mix(uHaloRadius, uHaloRadiusUp, up);
    float d = abs(r - uRadius) / max(uWidth, 0.001);
    // Gaussian rather than smoothstep: a bright core with a short tail reads
    // as light and not as a drawn circle.
    float ring = exp(-d * d * 2.2);
    // The next order of the same image, a third of the way out again and an
    // order of magnitude fainter. Two rings say "lensed"; one says "outline".
    float d2 = abs(r - uRadius * 1.055) / max(uWidth * 0.8, 0.001);
    ring += exp(-d2 * d2 * 2.6) * 0.22;
    // A short shoulder of light under both, killed at the edge of the quad.
    float g = clamp((r - uRadius) / max(haloRadius - uRadius, 0.001), 0.0, 1.0);
    float halo = exp(-g * 3.4) * (1.0 - g) * (1.0 - g) * uHalo * step(uRadius, r);
    gl_FragColor = vec4(uColor, clamp(ring * uIntensity + halo, 0.0, 1.0));
  }
`

export const LIGHT_POOL_VERTEX = PHOTON_RING_VERTEX

export const LIGHT_POOL_FRAGMENT = /* glsl */ `
  ${GLSL_NOISE}

  uniform vec3 uColor;
  uniform float uRadius;
  uniform float uFalloff;
  uniform float uIntensity;
  uniform float uTime;
  uniform float uSpin;
  varying vec2 vPlane;
  void main() {
    float t = clamp(length(vPlane) / max(uRadius, 0.001), 0.0, 1.0);
    float angle = atan(vPlane.y, vPlane.x);
    float glow = exp(-t * uFalloff);
    // A turning mottle, so the pool is light thrown by something moving rather
    // than a printed gradient. It turns at uSpin (the rate of the gas at the
    // disc's outer edge, the gas actually throwing it) and prograde like the
    // disc, so the floor of the pit and the light above it agree. Faint on
    // purpose: this is a reflection, not a second disc.
    float phase = angle - uTime * uSpin;
    float mottle = fbm3(vec3(cos(phase), sin(phase), t * 2.0 - uTime * 0.05) * 2.6);
    glow *= mix(0.78, 1.28, mottle);
    // Forced to nothing at the edge of the quad: no seam, and nothing left
    // over by the time the ring-1 labels start.
    glow *= (1.0 - t) * (1.0 - t);
    gl_FragColor = vec4(uColor, clamp(glow * uIntensity, 0.0, 1.0));
  }
`
