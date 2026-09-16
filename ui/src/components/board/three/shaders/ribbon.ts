/**
 * The ribbon shader: one dashed band that drifts.
 *
 * Rings use it to show their velocity — the dashes drift prograde at a speed
 * proportional to the ring's own velocity, so the movement rule is visible
 * standing still — and lanes use it to show direction of travel, the dashes
 * running from the departure arc toward the arrival one. Both animate entirely
 * on the GPU from `sceneTime`; the CPU does nothing per frame.
 *
 * `aPhase` is the vertex's board angle in turns (for rings, where the drift
 * must follow the sectors) and `aSpan` runs 0→1 along the arc (for lanes).
 */
export const RIBBON_VERTEX = /* glsl */ `
  attribute float aPhase;
  attribute float aSpan;
  varying float vPhase;
  varying float vSpan;
  void main() {
    vPhase = aPhase;
    vSpan = aSpan;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * `uAlongArc` picks which coordinate the dashes run in: 0 follows the board's
 * sectors (rings), 1 follows the arc from its start to its end (lanes).
 */
export const RIBBON_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uDashes;
  uniform float uBase;
  uniform float uDash;
  uniform float uDuty;
  uniform float uAlongArc;
  varying float vPhase;
  varying float vSpan;

  void main() {
    float coordinate = mix(vPhase, vSpan, uAlongArc);
    float cell = fract(coordinate * uDashes - uTime * uSpeed);
    float edge = 0.12;
    float pulse = smoothstep(0.0, edge, cell) * (1.0 - smoothstep(uDuty - edge, uDuty, cell));
    float alpha = uBase + uDash * pulse;
    gl_FragColor = vec4(uColor, alpha);
  }
`
