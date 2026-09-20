/**
 * The GLSL every transient effect is drawn with.
 *
 * Three programs, each compiled once and shared by every material of its kind:
 * a bolt (a tube that travels, bows over the funnel and may run in dashes), a
 * shockwave (a ring expanding across a disc) and a spark puff (points thrown
 * out of a point). Everything an effect varies (colour, progress, dash pitch)
 * is a uniform, so a frame costs a handful of number writes and nothing else.
 *
 * It lives here rather than in `three/shaders/` because nothing else on the
 * board draws with it: a beam is not a printed surface.
 */

/**
 * The bow is applied in world space, after the model matrix: a beam is a
 * straight cylinder scaled between two hulls, and the lift has to be along the
 * board's up axis whatever way the tube is pointing. `vAlong` runs 0 at the
 * muzzle to 1 at the target.
 */
export const BOLT_VERTEX = /* glsl */ `
  uniform float uBow;
  varying float vAlong;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vAlong = position.y + 0.5;
    vec4 world = modelMatrix * vec4(position, 1.0);
    world.y += uBow * sin(3.141592653589793 * vAlong);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

/**
 * The shot's head travels out over `uHead` and the shaft behind it glows at
 * `uBase`; the flat board draws exactly the same two things as a line and a
 * dot. `uDashes` above zero breaks the shaft into a tracer, and `uSoft` fades
 * the tube out toward its own silhouette so a bolt reads as round light rather
 * than as a plank: full strength on the envelope, barely on the core.
 */
export const BOLT_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uHead;
  uniform float uFade;
  uniform float uTail;
  uniform float uBase;
  uniform float uDashes;
  uniform float uDuty;
  uniform float uSpeed;
  uniform float uSoft;
  uniform float uTime;
  varying float vAlong;
  varying vec3 vNormal;
  varying vec3 vView;

  void main() {
    if (vAlong > uHead) discard;
    float tail = 1.0 - smoothstep(0.0, uTail, uHead - vAlong);
    float dash = 1.0;
    if (uDashes > 0.5) {
      float cell = fract(vAlong * uDashes - uTime * uSpeed);
      dash = smoothstep(0.0, 0.12, cell) * (1.0 - smoothstep(uDuty - 0.12, uDuty, cell));
    }
    float round = pow(abs(dot(normalize(vNormal), normalize(vView))), 1.2);
    float intensity = uFade * dash * (uBase + (1.0 - uBase) * tail) * mix(1.0, round, uSoft);
    if (intensity <= 0.002) discard;
    gl_FragColor = vec4(uColor * (0.75 + 0.9 * tail), intensity);
  }
`

export const SHOCK_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * One disc carries the whole shockwave: the wavefront is a ring at `uRadius`
 * of the disc's own radius, and `uCore` is the flash that fills it for the
 * first moment. Expanding in the shader rather than by scaling the mesh keeps
 * the front the same thickness however wide it has grown.
 */
export const SHOCK_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uRadius;
  uniform float uWidth;
  uniform float uFade;
  uniform float uCore;
  varying vec2 vUv;

  void main() {
    float d = length(vUv * 2.0 - 1.0);
    float front = 1.0 - smoothstep(0.0, uWidth, abs(d - uRadius));
    float core = uCore * (1.0 - smoothstep(0.0, max(uRadius, 0.001), d));
    float intensity = uFade * (front + core * 0.5);
    if (intensity <= 0.002) discard;
    gl_FragColor = vec4(uColor, intensity);
  }
`

/**
 * The spark puff: unit directions in the geometry, everything else a uniform.
 * Each spark keeps its own `aSeed` so they do not fly out as one shell.
 */
export const PUFF_VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uProgress;
  uniform float uRadius;
  uniform float uSize;
  varying float vSeed;
  void main() {
    vSeed = aSeed;
    float reach = uRadius * (0.15 + 1.35 * uProgress) * (0.5 + 0.8 * aSeed);
    vec3 offset = position * reach;
    offset.y += uRadius * 0.4 * uProgress * (0.25 + aSeed);
    vec4 mv = modelViewMatrix * vec4(offset, 1.0);
    gl_PointSize = uSize * (1.0 - 0.7 * uProgress) * (420.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`

export const PUFF_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFade;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float spark = 1.0 - smoothstep(0.3, 1.0, d);
    float intensity = uFade * spark * (0.45 + 0.75 * vSeed);
    if (intensity <= 0.002) discard;
    gl_FragColor = vec4(uColor, intensity);
  }
`
