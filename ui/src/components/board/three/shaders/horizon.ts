/**
 * The three shaders that make a hole visible.
 *
 * A black sphere on a black sky is nothing, so the horizon is drawn as an edge
 * rather than as a body:
 *
 *  - `HORIZON_*` paints the sphere itself. It is genuinely black in the middle
 *    — darker than the felt, so it reads as a hole cut in the table — with one
 *    hard amber line at the silhouette. The line is a high power of the Fresnel
 *    term, which makes it a rim and not a halo; a halo would fog the numbers.
 *  - `PHOTON_RING_*` is a camera-facing annulus a hair outside the silhouette:
 *    the light that went round. It is the one lensing cue that costs nothing,
 *    and it is what stops the horizon looking like a sticker.
 *  - `LIGHT_POOL_*` is the glow pooling in the pit, on a camera-facing quad.
 *    It falls off exponentially *and* is forced to zero at the quad's edge, so
 *    it is spent long before ring 1 — the numbers there must stay ink on black.
 */

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

/** A flat annulus, kept square to the camera by its parent. */
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
  varying vec2 vPlane;
  void main() {
    float d = abs(length(vPlane) - uRadius) / max(uWidth, 0.001);
    // Gaussian rather than smoothstep: a bright core with a short tail reads
    // as light and not as a drawn circle.
    float ring = exp(-d * d * 2.2);
    gl_FragColor = vec4(uColor, ring * uIntensity);
  }
`

export const LIGHT_POOL_VERTEX = PHOTON_RING_VERTEX

export const LIGHT_POOL_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uRadius;
  uniform float uFalloff;
  uniform float uIntensity;
  varying vec2 vPlane;
  void main() {
    float t = clamp(length(vPlane) / max(uRadius, 0.001), 0.0, 1.0);
    float glow = exp(-t * uFalloff);
    // Forced to nothing at the edge of the quad: no seam, and nothing left
    // over by the time the ring-1 labels start.
    glow *= (1.0 - t) * (1.0 - t);
    gl_FragColor = vec4(uColor, glow * uIntensity);
  }
`
