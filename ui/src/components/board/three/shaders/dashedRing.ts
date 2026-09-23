/**
 * The pulsing dashed ring the SVG board draws around a targetable ship.
 *
 * Same mark, same reading: the table's red, dashed, breathing. The dashes and the pulse
 * are both computed from the shared scene clock, so no ship costs the CPU
 * anything per frame.
 */
export const DASHED_RING_VERTEX = /* glsl */ `
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const DASHED_RING_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uDashes;
  uniform float uDuty;
  uniform float uPulse;
  uniform float uOpacity;
  varying vec2 vLocal;

  void main() {
    float turn = atan(vLocal.y, vLocal.x) / 6.2831853 + 0.5;
    float cell = fract(turn * uDashes);
    float dash = 1.0 - smoothstep(uDuty - 0.06, uDuty, cell);
    float pulse = mix(1.0, 0.4 + 0.6 * (0.5 + 0.5 * sin(uTime * 4.2)), uPulse);
    gl_FragColor = vec4(uColor, dash * pulse * uOpacity);
  }
`
