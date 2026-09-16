/**
 * The accretion disc: matter queueing to fall in.
 *
 * Four things make a ring of pixels read as a disc rather than as a printed
 * annulus, and all four are in here:
 *
 *  - **Differential rotation.** The turbulence is advected at a Keplerian rate
 *    (ω ∝ r^-3/2), so the inner edge laps the outer one and the streaks shear
 *    out into filaments on their own. This is also the movement rule of the
 *    board — inner rings are faster — drawn in light.
 *  - **Temperature.** Colour is a ramp from near-white at the inner edge
 *    through the theme's amber to a dim ember at the outer, never a second hue.
 *  - **Beaming.** The limb rotating toward the camera is brighter than the one
 *    rotating away; `uApproach` is the local angle of that limb, written once a
 *    frame from the camera, so the asymmetry follows you as you orbit.
 *  - **A soft edge.** The geometry runs out past the bright disc and the alpha
 *    is gone before it gets there, so there is no rim of triangles anywhere.
 *
 * Additive and depth-tested but never depth-writing: it only ever adds light,
 * and it is sized in `bodies.ts` to die out well inside ring 1's numbers.
 */
import { GLSL_NOISE } from './noise'

export const ACCRETION_VERTEX = /* glsl */ `
  varying vec2 vPlane;
  void main() {
    vPlane = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const ACCRETION_FRAGMENT = /* glsl */ `
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
  varying vec2 vPlane;

  void main() {
    float radius = length(vPlane);
    float angle = atan(vPlane.y, vPlane.x);

    // 0 at the inner edge, 1 where the geometry stops.
    float t = clamp((radius - uInner) / max(uOuter - uInner, 0.001), 0.0, 1.0);
    // 0..1 across the part of the disc that is meant to be bright.
    float b = clamp((radius - uInner) / max(uBright - uInner, 0.001), 0.0, 1.0);

    // Keplerian shear. Normalised so the inner edge turns at unit rate.
    float omega = pow(max(radius / uInner, 1.0), -1.5);
    float phase = angle + uTime * omega * 2.4;

    // Sampled on a circle so there is no seam at ±pi; the circle grows with
    // radius, which puts finer detail on the longer outer orbits.
    vec3 ring = vec3(cos(phase), sin(phase), 0.0) * (2.2 + 7.0 * t);
    float clumps = fbm3(ring + vec3(0.0, 0.0, t * 6.0 - uTime * 0.04));
    // The filaments are the same field folded, not a second one: a full second
    // fbm here doubles the cost of the most-covered shader on the board for a
    // difference nobody can point at.
    float filaments = 1.0 - abs(clumps * 2.0 - 1.0);
    float density = mix(0.26, 1.10, clumps) * mix(0.62, 1.42, filaments);

    // Temperature: hottest at the inner edge, an ember by the outer one.
    float heat = pow(1.0 - b, 1.7);
    vec3 color = mix(uEmber, uWarm, smoothstep(0.0, 0.55, heat));
    color = mix(color, uHot, smoothstep(0.55, 1.0, heat));

    // The inner edge is a bright line, not a fade: that is where the light is.
    float lip = exp(-b * 9.0);
    color += uHot * lip * 0.7;

    // Relativistic beaming: the approaching limb is brighter and a shade hotter.
    float beam = 1.0 + uBeaming * cos(angle - uApproach);
    color *= mix(1.0, beam, 0.35);

    float profile = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.34, 1.0, t));
    float alpha = profile * density * beam * uIntensity;
    // Belt and braces: nothing at all past the last few per cent of geometry.
    alpha *= 1.0 - smoothstep(0.88, 1.0, t);

    // Additive blending multiplies by alpha for us; write the colour straight.
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
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
 * dimmer, which is what stops the pair reading as a symmetrical halo.
 */
export const LENSED_ARC_FRAGMENT = /* glsl */ `
  ${GLSL_NOISE}

  uniform vec3 uHot;
  uniform vec3 uWarm;
  uniform float uInner;
  uniform float uOuter;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uUnderside;
  varying vec2 vPlane;

  void main() {
    float radius = length(vPlane);
    float angle = atan(vPlane.y, vPlane.x);
    float t = clamp((radius - uInner) / max(uOuter - uInner, 0.001), 0.0, 1.0);

    // Top and bottom only, and tightly: at the sides the flat disc is already
    // there, and a second copy of it turns the whole thing into a halo.
    float poles = pow(abs(sin(angle)), 3.6);
    float side = angle > 0.0 ? 1.0 : uUnderside;

    float phase = angle * 2.0 + uTime * 0.85;
    float grain = fbm3(vec3(cos(phase), sin(phase), t * 5.0 - uTime * 0.05) * 3.2);

    // A narrow band clear of the silhouette, not a fill: the gap between the
    // hole and the arc is most of what says the light went round it.
    float band = (t - 0.34) / 0.26;
    float profile = exp(-band * band);
    vec3 color = mix(uWarm, uHot, pow(1.0 - t, 2.2));
    float alpha = profile * poles * side * mix(0.45, 1.0, grain) * uIntensity;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`
