/**
 * Stars, with somewhere to be.
 *
 * A single sphere of identical white dots is wallpaper. Depth comes from
 * drawing three shells at different radii turning at different rates: orbit the
 * board and the near shell slides against the far one, which is the only cue
 * that says the board is in a place rather than on a background.
 *
 * Each star carries its own size, colour temperature and twinkle phase as
 * attributes, so the whole field is one draw call and nothing is computed per
 * frame except one time uniform. Points are kept small — a couple of pixels —
 * because the expensive part of a star field is fill rate, not vertex count,
 * and because a sky of fat blobs competes with the board.
 */
export const STARFIELD_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aTint;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uTwinkle;
  varying vec3 vTint;
  varying float vBright;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    // Slow, shallow scintillation: enough to keep the sky alive, not enough
    // to read as flicker on a still screenshot.
    float flicker = 0.82 + 0.18 * sin(uTime * uTwinkle + aPhase);
    vBright = flicker;
    vTint = aTint;
    gl_PointSize = aSize * uPixelRatio * (0.88 + 0.12 * flicker);
  }
`

export const STARFIELD_FRAGMENT = /* glsl */ `
  varying vec3 vTint;
  varying float vBright;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    // No discard: additive blending makes a zero alpha free, and a discard
    // costs a software rasteriser its whole early-out path.
    float core = pow(max(1.0 - r * 2.0, 0.0), 2.4);
    gl_FragColor = vec4(vTint * vBright, core);
  }
`
