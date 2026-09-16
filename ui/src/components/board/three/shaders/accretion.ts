/**
 * The accretion disc: matter queueing to fall in, and visibly going round.
 *
 * The disc is drawn as a sheet of its own rather than as a flat annulus, so one
 * shader serves every treatment in `bodies.ts`. The vertex stage takes a unit
 * disc — an attribute carrying (fraction along the radius, azimuth) — and puts
 * it where the treatment says: tilted out of the board plane, optionally warped
 * so the tilt relaxes and the outer edge settles into the floor of the pit, and
 * offset along the normal by a flared scale height so the same geometry can be
 * drawn three times as a midplane and two shells and read as something with a
 * thickness instead of a decal. **`sheetPoint` and `sheetPuff` in `bodies.ts`
 * are mirrors of `discSheet` and `discPuff` below** — the budget solver has to
 * know where the sheet goes to prove it never reaches ring 1's numbers.
 *
 * ## Why the disc did not read as turning, and what carries the rotation now
 *
 * The first answer is blunt and has nothing to do with this file: **the disc was
 * not moving at all.** `uTime` never reached the GPU. Every `<shaderMaterial>`
 * has its uniforms run through three's `cloneUniforms`, which copies a number by
 * value, so the shared `sceneTime` object arrives as a private copy frozen a
 * fraction of a second after the board opens — measured on the board, the whole
 * disc was pixel-for-pixel identical over nine seconds. `scene/BlackHole.tsx`
 * describes the bug and writes the clock through the live material now; it is
 * still true of everything else the board draws.
 *
 * With the clock running, the disc turned — and still did not read as turning,
 * in four more ways, every one of which had to go before it read as a wheel:
 *
 *  1. **The cross-fade was inverted.** Keplerian shear winds a continuous field
 *     up without limit until the filaments are finer than a pixel, so the shear
 *     was bounded by advecting two copies of the turbulence half a cycle apart
 *     and cross-fading them. The weight was `abs(1 - 2f)`, which puts each copy
 *     at *full* strength at `f = 0` and `f = 0.5` — exactly the instants its own
 *     shear resets. So the differential rotation was never visible at full
 *     weight at all: it was seen only mid-fade, half of one wound state blended
 *     with half of another, and once every 34 seconds the whole pattern snapped
 *     back through five radians in plain sight. Measured off the pixels with
 *     the clock running, the old disc turned at 0.394 rad/s at the inner edge
 *     of its bright annulus and 0.394 rad/s two thirds of the way out — the
 *     same rate at both radii, which is a printed wheel and not a disc. The
 *     differential the shear existed to draw had been faded away to nothing.
 *  2. **Nothing had an angular identity.** Three octaves of value noise, folded
 *     into ridges, at a couple of noise units per sector: no feature large
 *     enough or distinct enough to pick out and follow round. A texture that
 *     rotates but has no landmarks is a texture that shimmers.
 *  3. **The bright parts did not move.** Almost all of the disc's light is in
 *     two structures that are axisymmetric or locked to the camera — the
 *     white-hot inner lip, and the Doppler-beamed approaching limb. Both are
 *     physically right and both stand perfectly still, so the eye, which reads
 *     the brightest thing in a picture first, concluded that nothing turned.
 *  4. **It was too small for what was moving.** The only thing that did move was
 *     the finest detail in the shader, a few pixels across at the board's
 *     default camera, under bloom.
 *
 * So the rotation is now carried by things that can be tracked, and the shear
 * is bounded by construction rather than by a timer:
 *
 *  - **Banded rigid rotation.** The gas is cut into `BANDS` annuli. Each band is
 *    a separate piece of turbulence, turning *rigidly* at the Keplerian rate of
 *    its own radius (ω ∝ r^-3/2), and neighbours are cross-faded across the
 *    outer third of each band. A rigid rotation never winds anything up, so
 *    there is no shear to bound, no cycle, no reset, and no moiré — for ever —
 *    while two neighbouring bands sliding past each other is precisely what
 *    shear looks like. The join is not a circle: it wobbles in azimuth and
 *    drifts, so the radius where two pieces of gas are mixed half and half
 *    never sits still long enough to read as a ring.
 *  - **Clumps.** A handful of bright knots of gas, each at one radius and
 *    therefore turning rigidly at that radius's own rate, each lit and put out
 *    again over a lifetime of a few seconds. These are the landmarks: a knot is
 *    tens of pixels across at the table camera, it is brighter than the gas
 *    around it, and it can be picked out of one frame and found again in the
 *    next. Because a knot never shears against itself it is bounded by
 *    construction too. Their positions are solved on the CPU once a frame —
 *    `writeKnots` below — and handed to the shader as a small uniform array,
 *    which is both cheaper than deriving them per pixel and the reason the
 *    midplane and its two shells show the same clumps.
 *  - **A turning lip.** The inner lip is the brightest thing the disc draws, so
 *    it is given hot spots at the inner orbit's own rate: three of them beaten
 *    against a fifth harmonic so the pattern is not a rosette. A bright ring
 *    that changes is worth more than any amount of fine detail that does not.
 *
 * What was kept: the static log-spiral winding that gives the arms their trail,
 * the temperature ramp, the radial profile that lights the whole annulus, and
 * the Doppler beaming — which, now that clumps go round, does something it could
 * not do before: each knot brightens as it swings toward you and dims as it goes
 * away, so it pulses once an orbit.
 *
 * Additive and depth-tested but never depth-writing: it only ever adds light,
 * and it is sized in `bodies.ts` to die out well inside ring 1's numbers. None
 * of the above moves a vertex or widens the sheet by a unit, so every ceiling
 * `bodies.ts` proves still holds.
 */
import { GLSL_NOISE, withOctaves } from './noise'

/**
 * The sheet. Shared by the vertex stage here and, in TypeScript, by the solver
 * in `bodies.ts`; keep the two the same.
 */
const GLSL_SHEET = /* glsl */ `
  float discPuff(float u) {
    return (1.0 - exp(-u * 9.0)) * exp(-u * 2.2);
  }

  /* The sheet: a circle rotated about the board's x axis, the rotation relaxing
     with radius when warped, and the whole thing settling toward the floor. */
  vec3 discSheet(float u, float theta, float radius, float tilt, float warp, float lift) {
    float lean = tilt * (1.0 - warp * smoothstep(0.0, 1.0, u));
    float settle = lift * warp * smoothstep(0.0, 1.0, (u - 0.12) / 0.88);
    return vec3(
      radius * cos(theta),
      radius * sin(theta) * sin(lean) - settle,
      radius * sin(theta) * cos(lean)
    );
  }
`

export const ACCRETION_VERTEX = /* glsl */ `
  ${GLSL_SHEET}

  attribute vec2 aPolar;
  uniform float uInner;
  uniform float uOuter;
  uniform float uTilt;
  uniform float uWarp;
  uniform float uLift;
  uniform float uPuff;
  uniform float uShell;
  varying vec2 vPolar;

  void main() {
    float u = aPolar.x;
    float theta = aPolar.y;
    float radius = mix(uInner, uOuter, u);
    vPolar = vec2(radius, theta);
    vec3 p = discSheet(u, theta, radius, uTilt, uWarp, uLift);
    // The shells stand off along the sheet's own normal.
    float lean = uTilt * (1.0 - uWarp * smoothstep(0.0, 1.0, u));
    float h = uShell * uPuff * discPuff(u);
    p += h * vec3(0.0, cos(lean), -sin(lean));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

/* ------------------------------------------------------------------- spin */

/**
 * Seconds the gas at the very inner edge of the disc takes to go round once.
 *
 * This is the one number that sets how fast the whole picture turns; everything
 * else follows from Kepler. It is a compromise between a disc you can watch
 * turn while you think about your move and one that pulls the eye off the board:
 * nine seconds is about a second and a half per sector of ring 1 as seen from
 * the table camera, which is a pace the eye tracks without being dragged.
 *
 * The spread it buys is set by how deep the annulus is, and that is `bodies.ts`
 * business, not this file's: the outer edge takes `INNER_PERIOD · (r_out /
 * r_in)^1.5` seconds. On the board as it is drawn today that is about 1.48
 * radii — 142.5 units to 210 — so the outer edge takes a little over sixteen
 * seconds against the inner edge's nine, and the inner laps the outer about
 * every twenty. Open the rings out, the disc grows into the room, the ratio
 * widens and the lap gets quicker with nothing here touched.
 */
export const INNER_PERIOD = 9

/** Radians a second at the inner edge. */
const INNER_RATE = (2 * Math.PI) / INNER_PERIOD

/**
 * Radians a second the gas turns at `radius`, given the disc's inner edge:
 * Kepler's law, ω ∝ r^-3/2. **Mirror of `kepler` in the fragment shader below.**
 */
export function orbitRate(radius: number, inner: number): number {
  const q = Math.max(radius / inner, 1)
  return INNER_RATE / (q * Math.sqrt(q))
}

/** Seconds for one turn at `radius`. Reporting and tests; the shader has rates. */
export function orbitPeriod(radius: number, inner: number): number {
  return (2 * Math.PI) / orbitRate(radius, inner)
}

/* ------------------------------------------------------------------ clumps */

/**
 * How many clumps of gas are alight at once, and how long each one lasts.
 *
 * The count is the same for the midplane and both shells — they share one
 * uniform array, so the three sheets are three slices of the same clumps rather
 * than three different discs — and it is what the fragment loop costs, ten
 * times a dozen instructions over the disc's pixels. Ten with a lifetime of
 * sixteen seconds leaves about five alight at any moment, staggered so the disc
 * never blinks.
 *
 * A clump has to live long enough to be followed round: sixteen seconds is a
 * turn and three quarters at the inner edge and a turn at the outer.
 */
export const KNOT_COUNT = 10
const KNOT_LIFE = 16

/**
 * Where clumps form, as a fraction along the annulus.
 *
 * Not out in the wisps: past about three fifths the radial profile and the
 * patchiness power between them have taken the gas down to nothing, so a clump
 * out there is a clump nobody can see, and the annulus this disc is allowed is
 * only 1.44 radii deep to begin with.
 */
const KNOT_INNER = 0.04
const KNOT_OUTER = 0.6

/** Two irrationals, for spreading a small integer sequence evenly over 0..1. */
const GOLDEN = 0.6180339887
const SILVER = 0.7548776662

function frac(x: number): number {
  return x - Math.floor(x)
}

/**
 * Where every clump is this frame.
 *
 * Solved here rather than in the shader because none of it varies per pixel: a
 * clump is five numbers, and deriving them from a hash at every fragment of a
 * disc drawn three times over is work done a hundred thousand times for an
 * answer that changes ten times a frame.
 *
 * `shape` takes four floats a clump — azimuth, the fraction along the annulus it
 * sits at, and the reciprocals of its angular and radial half-widths, so the
 * shader divides nothing — and `gain` one, its brightness, which rises and falls
 * over its life so clumps are lit out of the gas and put back into it rather
 * than appearing. Each generation draws a new radius and a new azimuth, or ten
 * clumps would trace ten fixed orbits for ever.
 */
export function writeKnots(
  time: number,
  inner: number,
  outer: number,
  shape: Float32Array,
  gain: Float32Array
): void {
  for (let k = 0; k < KNOT_COUNT; k++) {
    // Births spread evenly through the cycle: the same amount of gas is always
    // alight, and no two clumps fade together.
    const cycle = time / KNOT_LIFE + k / KNOT_COUNT
    const phase = frac(cycle)
    const age = phase * KNOT_LIFE
    // A triangle, smoothstepped, so a clump arrives and leaves with no edge.
    const ramp = 1 - Math.abs(2 * phase - 1)
    const life = ramp * ramp * (3 - 2 * ramp)
    // Bounded generation count: `frac` of a large float is a coarse float.
    const seed = frac((Math.floor(cycle) % 89) * SILVER + k * GOLDEN)
    const u = KNOT_INNER + (KNOT_OUTER - KNOT_INNER) * seed
    const start = frac(seed * 31.7 + k * 0.381966) * Math.PI * 2
    const azimuth = start + orbitRate(inner + (outer - inner) * u, inner) * age
    // Wider round than across: gas at one radius is drawn out along its own
    // orbit, which is what makes a clump read as a filament and not as a dot.
    // Sized to land at tens of pixels at the board's own camera — a clump
    // finer than that is another piece of turbulence, which is what the disc
    // had too much of already.
    const across = 0.2 + 0.26 * frac(seed * 17.3 + 0.41)
    const deep = 0.13 + 0.17 * frac(seed * 11.9 + 0.73)
    shape[k * 4] = azimuth
    shape[k * 4 + 1] = u
    shape[k * 4 + 2] = 1 / across
    shape[k * 4 + 3] = 1 / deep
    gain[k] = life * (0.72 + 0.5 * frac(seed * 7.1 + 0.29))
  }
}

/* ---------------------------------------------------------------- fragment */

/**
 * Annuli of gas, each turning rigidly at its own rate. Six is enough that
 * neighbours differ by a tenth of their speed — a radian of slip between them
 * every twenty seconds, which reads as shear — and few enough that a band is
 * wide enough to hold a filament.
 */
const BANDS = 6

const ACCRETION_FRAGMENT = /* glsl */ `
  #define BANDS ${BANDS.toFixed(1)}
  #define ORBIT ${INNER_RATE.toFixed(5)}
  #define TAU 6.283185307
  #ifndef KNOTS
  #define KNOTS ${KNOT_COUNT}
  #endif
  ${GLSL_NOISE}

  uniform vec3 uHot;
  uniform vec3 uWarm;
  uniform vec3 uEmber;
  uniform float uInner;
  uniform float uBright;
  uniform float uOuter;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uApproach;
  uniform float uBeaming;
  uniform float uSpiral;
  uniform float uShell;
  /* Per clump: azimuth, fraction along the annulus, 1/angular half-width,
     1/radial half-width. Written by writeKnots once a frame. */
  uniform vec4 uKnots[KNOTS];
  uniform float uKnotGain[KNOTS];
  varying vec2 vPolar;

  /* Radians a second at this radius. Mirror of orbitRate in TypeScript. */
  float kepler(float radius) {
    float q = max(radius / uInner, 1.0);
    return ORBIT * inversesqrt(q) / q;
  }

  /* One band of gas: turbulence turning rigidly at the rate of its own radius.
     Rigid is the whole point — it can turn for an hour and never wind up. */
  float bandGas(float band, float angle, float spiral, float scale, float depth) {
    float u = (clamp(band, 0.0, BANDS - 1.0) + 0.5) / BANDS;
    float phase = angle + spiral - uTime * kepler(mix(uInner, uOuter, u));
    return fbm3(vec3(cos(phase), sin(phase), 0.0) * scale + vec3(0.0, 0.0, depth + band * 4.37));
  }

  /* The clumps, summed. Each is an ellipse in (azimuth, radius) with a smooth
     compact falloff — no transcendentals, and nothing outside it to pay for. */
  float clumpLight(float angle, float t) {
    float sum = 0.0;
    for (int k = 0; k < KNOTS; k++) {
      vec4 knot = uKnots[k];
      float da = angle - knot.x;
      da -= TAU * floor(da / TAU + 0.5);
      // Drawn out behind itself along its own orbit. The trail is what tells a
      // single still frame which way the clump is going, and it is the shape
      // the eye locks onto across frames.
      da *= da < 0.0 ? knot.z * 0.5 : knot.z;
      float dr = (t - knot.y) * knot.w;
      float bump = max(1.0 - da * da - dr * dr, 0.0);
      sum += bump * bump * uKnotGain[k];
    }
    return sum;
  }

  void main() {
    float radius = vPolar.x;
    float angle = vPolar.y;

    // 0 at the inner edge, 1 where the geometry stops.
    float t = clamp((radius - uInner) / max(uOuter - uInner, 0.001), 0.0, 1.0);
    // 0 at the inner edge, 1 where the light is meant to be spent. Not clamped:
    // past the bright radius it keeps growing and keeps killing the exponential.
    float x = (radius - uInner) / max(uBright - uInner, 0.001);

    // Rotation is prograde — the way sectors increase, the way every ring on
    // the board drifts — and it is differential: each band of gas turns at its
    // own Keplerian rate, so the inner edge laps the outer. Because every band
    // turns *rigidly* nothing shears against itself and nothing winds up, which
    // is what the old cross-fade was for and could not do. The trailing arms
    // come from the static log-spiral term, which never winds either.
    float spiral = uSpiral * log(max(radius / uInner, 1.0));
    // The join between two bands wobbles and drifts, so the one radius where
    // two pieces of gas are half and half is never a circle.
    float wobble = 0.28 * sin(3.0 * angle + 0.7) + 0.17 * sin(5.0 * angle - 2.1 + 0.09 * uTime);
    float bandF = t * BANDS + wobble;
    float band = floor(bandF);
    float lap = smoothstep(0.62, 1.0, bandF - band);

    // Sampled on a circle so there is no seam at ±pi; the circle grows with
    // radius, which puts finer detail on the longer outer orbits. The shells
    // are offset through the noise as well as through space, so the three
    // sheets are three pieces of gas rather than one tripled.
    float scale = 1.3 + 6.4 * t;
    float depth = t * 2.6 + uShell * 2.7 - uTime * 0.025;
    float clumps = mix(
      bandGas(band, angle, spiral, scale, depth),
      bandGas(band + 1.0, angle, spiral, scale, depth),
      lap
    );
    // The filaments are the same field folded, not a third one.
    float filaments = 1.0 - abs(clumps * 2.0 - 1.0);
    float density = mix(0.18, 1.15, clumps) * mix(0.45, 1.6, filaments);
    // Outward the gas gets patchier, not merely dimmer: the same field raised
    // to a rising power, which digs the gaps between the filaments out to
    // nothing. It is the difference between a disc that ends in wisps and one
    // that ends in a wash — and a wash is what would fog ring 1's numbers.
    density = pow(density, mix(1.0, 1.8, clamp(x, 0.0, 1.0)));

    // The landmarks. They ride the gas rather than sit on top of it, and they
    // take light off the quiet parts of the disc as well as adding it to their
    // own, so the picture is no brighter for having them.
    float knots = clamp(clumpLight(angle, t) * mix(0.78, 1.22, clumps), 0.0, 1.0);
    density *= mix(0.8, 3.2, knots);

    // Temperature: hottest at the inner edge, an ember by the bright one.
    float heat = pow(1.0 - clamp(x, 0.0, 1.0), 1.6);
    vec3 color = mix(uEmber, uWarm, smoothstep(0.0, 0.5, heat));
    color = mix(color, uHot, smoothstep(0.5, 1.0, heat));
    // A clump is hotter than the gas it came out of, as well as denser.
    color = mix(color, uHot, knots * 0.46);

    // The inner edge is a white-hot line, not a fade: that is where the light
    // is — and a bright ring that never changes is the strongest possible
    // statement that nothing is turning, so it carries hot spots at the inner
    // orbit's own rate. Three of them, beaten against a fifth harmonic so the
    // pattern is not a rosette, normalised so the lip is no brighter on average
    // than it was when it stood still.
    float lipPhase = angle - uTime * ORBIT;
    float lipSpin =
      (0.35 + 0.65 * (0.5 + 0.5 * sin(2.0 * lipPhase)) * (0.6 + 0.4 * sin(3.0 * lipPhase + 2.1))) *
      1.83;
    float lip = exp(-x * 9.5) * lipSpin;
    color += uHot * lip * 0.42;

    // Relativistic beaming, roughly the Doppler factor cubed, and stronger on
    // the fast inner orbits: the approaching limb blazes, the receding one goes
    // to ember. Now that the gas goes round, every clump pulses once an orbit.
    float speed = sqrt(uInner / max(radius, 1.0));
    float doppler = 1.0 + uBeaming * speed * cos(angle - uApproach);
    float boost = pow(max(doppler, 0.25), 1.9);
    color *= mix(1.0, boost, 0.3);

    // Radial profile: lit right across the annulus, nothing at either edge of
    // the triangles.
    float profile = exp(-x * 1.15);
    profile *= smoothstep(0.0, 0.045, t);
    profile *= 1.0 - smoothstep(0.82, 0.97, t);

    // A clump lifts the floor the beaming may dim it to, so that it stays
    // visible all the way round rather than disappearing for half its orbit on
    // the receding limb — which would leave nothing to follow for half a turn.
    float alpha = profile * density * clamp(boost, 0.5 + 0.45 * knots, 1.8) * uIntensity;

    // Additive blending multiplies by alpha for us; write the colour straight.
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`

/**
 * The disc's fragment shader at a given cost.
 *
 * The octave count is the noise's, and the clump count has to be the same for
 * every material that shares the uniform array, so only the noise is stepped
 * down: on the cheap path the disc is one sheet instead of three, which already
 * takes two thirds of the clump loop away.
 */
export function accretionFragment(octaves: number): string {
  return withOctaves(octaves, ACCRETION_FRAGMENT)
}

/** A flat annulus, kept square to the camera by its parent. */
export const FACING_VERTEX = /* glsl */ `
  varying vec2 vPlane;
  void main() {
    vPlane = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * The arc the light takes over the top.
 *
 * The one thing a black hole does that nothing else does is show you the far
 * side of its own disc, bent over the silhouette. Without it the disc is a hat
 * brim: the far half simply disappears behind the sphere, which is what an
 * ordinary ring around an ordinary ball does.
 *
 * Doing it properly means tracing a geodesic per pixel. Doing it convincingly
 * means drawing one more annulus, square to the camera, masked to the top and
 * bottom of the silhouette — where the flat disc is hidden — and left out at
 * the sides, where the flat disc is already drawn and a second copy would only
 * double it. Because it faces the camera it arcs over the hole from every
 * angle, which is exactly the property the real thing has.
 *
 * The lower arc is the underside of the near half of the disc and is drawn
 * dimmer, and it is given a wider band than the upper one, because down the
 * screen there is twice the room before ring 1's ink — which is also what stops
 * the pair reading as a symmetrical halo. The whole arc carries the disc's own
 * beaming, so the side of the sky the approaching limb is bent onto is the
 * bright one and the pair never reads as symmetrical either way round.
 *
 * Its grain runs round the arc at `uSpin`, the rate of the gas that is being
 * bent into it, so the light going over the top travels the same way as the
 * light going round the front.
 */
export const LENSED_ARC_FRAGMENT = /* glsl */ `
  ${GLSL_NOISE}

  uniform vec3 uHot;
  uniform vec3 uWarm;
  uniform float uInner;
  uniform float uOuter;
  uniform float uOuterUp;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uUnderside;
  uniform float uBeaming;
  uniform float uLean;
  uniform float uSpin;
  varying vec2 vPlane;

  void main() {
    float radius = length(vPlane);
    float angle = atan(vPlane.y, vPlane.x);
    // The annulus is square to the camera, so its local +y is up the screen —
    // which is where ring 1's far numbers are and where the arc has least room.
    // It gets a tighter outer radius there and its full reach everywhere else.
    float outer = mix(uOuter, uOuterUp, clamp(sin(angle), 0.0, 1.0));
    float t = clamp((radius - uInner) / max(outer - uInner, 0.001), 0.0, 1.0);

    // Top and bottom: at the sides the flat disc is already there, and a second
    // copy of it turns the whole thing into a halo. Wider than a knife edge,
    // though — the arc has to get round the hole to be an arc.
    float poles = pow(abs(sin(angle)), 2.6);
    float side = angle > 0.0 ? 1.0 : uUnderside;

    float phase = angle * 2.0 + uTime * uSpin * 2.0;
    float grain = fbm3(vec3(cos(phase), sin(phase), t * 5.0 - uTime * 0.05) * 3.2);

    // One limb of the bent image is the approaching one; lean the whole arc
    // that way so it matches the disc under it.
    float lean = 1.0 + uBeaming * uLean * cos(angle) * sign(sin(angle));

    // A narrow band clear of the silhouette, not a fill: the gap between the
    // hole and the arc is most of what says the light went round it.
    float band = (t - 0.3) / 0.3;
    float profile = exp(-band * band);
    vec3 color = mix(uWarm, uHot, pow(1.0 - t, 2.0));
    // A little more contrast in the grain than it had, so the flow round the arc
    // reads — but not a unit more of peak, because the arc is the outermost
    // bright thing the hole throws up the screen and bodies.ts has measured its
    // ceiling against ring 1's far numbers.
    float alpha = profile * poles * side * mix(0.4, 1.0, grain) * max(lean, 0.1) * uIntensity;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`
