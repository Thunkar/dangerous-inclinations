import { GLSL_NOISE, withOctaves } from '../../shaders/noise'

/**
 * The GLSL every transient effect is drawn with.
 *
 * Seven programs, each compiled once and shared by every material of its
 * kind: a bolt (a tube that travels, bows over the funnel and may run in
 * dashes), a shockwave (a ring expanding across a disc), a spark puff (points
 * thrown out of a point), a field (a disruptor's pulse flooding the sectors it
 * covers), a shell (a shield's bubble, bright at its rim and where it is
 * struck), plasma (a ball of burning gas, drawn out along its flight) and
 * embers (what a plasma burst sheds as it flies). Everything an effect varies (colour, progress, dash pitch)
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

/**
 * A disruptor's pulse over the cells it floods. The cells are one merged
 * buffer laid on the surface; the pulse is a front running out from the
 * attacker across them (`uFront`, in board units from `uOrigin`), each patch
 * flashing as it is reached and settling to a crackling wash behind it. The
 * flat board draws the same front and the same flash.
 */
export const FIELD_VERTEX = /* glsl */ `
  varying vec2 vBoard;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vBoard = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

export const FIELD_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec2 uOrigin;
  uniform float uFront;
  uniform float uFade;
  uniform float uTime;
  varying vec2 vBoard;

  void main() {
    float d = distance(vBoard, uOrigin);
    float lit = clamp((uFront - d) / 26.0, 0.0, 1.0);
    float flash = lit * clamp(1.0 - (uFront - d) / 120.0, 0.0, 1.0);
    float front = 1.0 - smoothstep(0.0, 7.0, abs(d - uFront));
    float crackle = 0.75 + 0.25 * sin(d * 0.45 - uTime * 22.0);
    float intensity = uFade * (lit * (0.2 + 0.5 * flash) * crackle + front * 0.95);
    if (intensity <= 0.002) discard;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), front * 0.55), intensity);
  }
`

/**
 * A shield's bubble: faint across its face, bright at its silhouette, and
 * brightest where a shot struck it (`uStrike`, a unit direction from the
 * bubble's centre toward whoever fired).
 */
export const SHELL_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    vLocal = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

export const SHELL_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFade;
  uniform vec3 uStrike;
  uniform float uStrikeAmount;
  uniform vec3 uAccent;
  uniform float uRipple;
  uniform float uPhase;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;

  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
    float strike = pow(max(0.0, dot(vLocal, uStrike)), 7.0) * uStrikeAmount;
    // What struck the shield, spreading over it from where it hit: rings
    // running out across the bubble (an angle from the strike, 0 to pi).
    float away = acos(clamp(dot(vLocal, uStrike), -1.0, 1.0));
    float ripple = 0.0;
    for (int i = 0; i < 3; i++) {
      float front = uPhase - float(i) * 0.55;
      float ring = 1.0 - smoothstep(0.0, 0.22, abs(away - front));
      ripple += ring * step(0.0, front) * (1.0 - float(i) * 0.25);
    }
    ripple *= uRipple * (1.0 - smoothstep(1.8, 3.1, away));
    float intensity = uFade * (0.07 + 0.85 * rim + 1.3 * strike + 1.1 * ripple);
    if (intensity <= 0.002) discard;
    vec3 color = mix(uColor, vec3(1.0), min(1.0, strike * 0.7));
    color = mix(color, uAccent, min(1.0, ripple * 1.5));
    gl_FragColor = vec4(color, intensity);
  }
`

/**
 * A ball of burning gas. The mesh is a unit sphere whose local +Y is the way
 * it is flying: the back half is drawn out into a tail (`uStretch`, in radii)
 * and narrowed toward its end, so a bolt is a teardrop, and the whole surface
 * boils (`uBoil`) on noise that runs with the clock. A fireball is the same
 * program with no stretch and a harder boil.
 */
export const PLASMA_VERTEX = withOctaves(
  2,
  GLSL_NOISE +
    /* glsl */ `
  uniform float uStretch;
  uniform float uBoil;
  uniform float uTime;
  uniform float uSeed;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  varying float vTail;
  void main() {
    vec3 p = position;
    float back = max(0.0, -p.y);
    vTail = back;
    p.y -= back * back * uStretch;
    p.xz *= 1.0 - 0.55 * back * min(1.0, uStretch);
    float churn = fbm3(position * 2.2 + vec3(uSeed, uTime * 3.1, uSeed * 0.7)) - 0.5;
    p += normal * churn * uBoil;
    vLocal = position;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`
)

/**
 * White-yellow at the heart, the bolt's green through the body and a soft
 * corona that falls away to nothing at the silhouette, so there is never an
 * edge; turbulence eats into the corona and the tail, which is what makes it
 * flicker rather than glow.
 */
export const PLASMA_FRAGMENT = withOctaves(
  3,
  GLSL_NOISE +
    /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uGlow;
  uniform float uFade;
  uniform float uHeat;
  uniform float uTime;
  uniform float uSeed;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  varying float vTail;
  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float turbulence = fbm3(vLocal * 3.4 + vec3(uSeed, -uTime * 4.3, uTime * 1.7));
    float body = smoothstep(0.0, 0.85, facing);
    float heart = pow(facing, 5.0) * uHeat * (1.0 - 0.8 * vTail);
    float corona = body * (0.45 + 0.9 * turbulence) * (1.0 - 0.55 * vTail);
    float intensity = uFade * clamp(corona * 0.8 + heart, 0.0, 1.6);
    if (intensity <= 0.003) discard;
    vec3 color = mix(uGlow, uCore, clamp(heart * 1.2 + turbulence * 0.25 * body, 0.0, 1.0));
    gl_FragColor = vec4(color * (1.0 + heart), intensity);
  }
`
)

/**
 * What a plasma burst sheds, all of it worked out here from the bolts' flight
 * so a frame costs three numbers. Each point is either an ember (`aKind` 0),
 * dropped where its bolt was at `aSpawn` of its flight, drifting off its line
 * and shrinking as it cools; or a muzzle spark (1), thrown forward in a cone
 * as its bolt leaves. `uT` is how far each of the three bolts is through its
 * flight, past 1 once it has landed, so the embers go on cooling.
 */
export const EMBER_VERTEX = /* glsl */ `
  attribute float aBolt;
  attribute float aSpawn;
  attribute float aSeed;
  attribute float aKind;
  uniform vec3 uFrom;
  uniform vec3 uTo;
  uniform float uLob;
  uniform vec3 uAim;
  uniform vec3 uT;
  uniform float uLife;
  uniform float uSpark;
  uniform float uSize;
  varying float vLife;
  varying float vSeed;
  void main() {
    float t = aBolt < 0.5 ? uT.x : (aBolt < 1.5 ? uT.y : uT.z);
    vec3 at;
    float life;
    if (aKind < 0.5) {
      life = (t - aSpawn) / uLife;
      float age = clamp(life, 0.0, 1.0);
      at = mix(uFrom, uTo, aSpawn);
      at.y += uLob * sin(3.141592653589793 * aSpawn);
      at += position * (3.0 + 11.0 * aSeed) * age;
      at.y += 7.0 * aSeed * age;
      at -= uAim * 9.0 * aSeed * age;
    } else {
      life = t / uSpark;
      vec3 cone = normalize(uAim + position * 0.6);
      at = uFrom + cone * (6.0 + 40.0 * aSeed) * sqrt(clamp(life, 0.0, 1.0));
    }
    vLife = life;
    vSeed = aSeed;
    if (life < 0.0 || life > 1.0) {
      gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    vec4 mv = modelViewMatrix * vec4(at, 1.0);
    gl_PointSize = uSize * (1.0 - 0.75 * life) * (0.6 + 0.8 * aSeed) * (420.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`

export const EMBER_FRAGMENT = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uGlow;
  uniform float uFade;
  varying float vLife;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float spark = 1.0 - smoothstep(0.15, 1.0, d);
    float intensity = uFade * spark * (1.0 - vLife) * (0.6 + 0.6 * vSeed);
    if (intensity <= 0.003) discard;
    gl_FragColor = vec4(mix(uCore, uGlow, smoothstep(0.0, 0.45, vLife)), intensity);
  }
`
