/**
 * Three worlds out of one shader.
 *
 * The board needs the planets told apart at a glance and it needs them told
 * apart at a glance *in their printed colours*, which is the hard part: three
 * spheres tinted blue, red and green all look like the same sphere. So the
 * difference is carried by the surface rather than by the hue (a banded gas
 * giant, a cratered rock, an ocean world under cloud) and the hue stays
 * exactly the one on the rules sheet.
 *
 * The surface pattern is sampled on the *object-space* normal, so it turns with
 * the body; the light is computed from the *world* normal, so the terminator
 * stays put while the world rotates under it. One warm key (a star), one cool
 * fill (the sky), a back-scatter rim at the limb and a floor of ambient so the
 * night side is a silhouette rather than a hole.
 *
 * The kind picks which body to compile, rather than switching on a uniform:
 * three short shaders beat one long one with a branch in it, they share the
 * noise and the lighting model, and each is compiled exactly once.
 */
import { GLSL_NOISE } from './noise'

export type PlanetKind = 'gas' | 'rock' | 'ocean'

export const PLANET_VERTEX = /* glsl */ `
  varying vec3 vSurface;
  varying vec3 vNormalWorld;
  varying vec3 vViewDirection;
  void main() {
    vSurface = normalize(position);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const COMMON = /* glsl */ `
  ${GLSL_NOISE}

  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uHigh;
  uniform vec3 uKeyColor;
  uniform vec3 uFillColor;
  uniform vec3 uKeyDirection;
  uniform float uAmbient;
  uniform float uTime;
  varying vec3 vSurface;
  varying vec3 vNormalWorld;
  varying vec3 vViewDirection;
`

/**
 * The lit sphere. `bump` fakes relief by tilting the lambert term instead of
 * the normal: a third of the cost and, on a body forty pixels across, the
 * same picture. `gloss` is the only specular anywhere on the board.
 */
const SHADE = /* glsl */ `
  vec3 shade(vec3 albedo, float bump, float gloss, float shininess) {
    vec3 n = normalize(vNormalWorld);
    vec3 v = normalize(vViewDirection);
    vec3 l = normalize(uKeyDirection);

    float ndl = dot(n, l) + bump;
    // A soft terminator: the band where a planet stops being a disc.
    float key = smoothstep(-0.10, 0.45, ndl);
    float fill = 0.30 + 0.30 * (n.y * 0.5 + 0.5);

    float specular = 0.0;
    if (gloss > 0.001) {
      vec3 h = normalize(l + v);
      specular = gloss * pow(max(dot(n, h), 0.0), shininess) * smoothstep(-0.02, 0.25, ndl);
    }

    // Back-scatter: the limb of the day side carries a little of the star.
    float limb = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    float scatter = limb * smoothstep(-0.45, 0.35, ndl) * 0.20;

    vec3 lit = albedo * (uKeyColor * key + uFillColor * fill + uAmbient);
    return lit + uKeyColor * (specular + scatter * 0.6);
  }
`

const GAS_BODY = /* glsl */ `
  void main() {
    vec3 p = vSurface;
    // Zonal flow: the bands shear past each other, faster at the equator.
    float drift = uTime * 0.02 * (1.0 - 0.55 * abs(p.y));
    vec3 q = vec3(p.x, p.y, p.z);
    float swirl = fbm3(q * 2.4 + vec3(drift, 0.0, -drift));
    float curl = fbm3(q * 6.5 + vec3(drift * 1.8, 0.0, 0.0));

    // Latitude bands, warped by the flow so no two are the same width. Many
    // narrow ones read as a gas giant; a few wide ones read as a beach ball.
    float lat = p.y * 9.5 + swirl * 3.0 + curl * 0.9;
    float band = 0.5 + 0.5 * sin(lat * 3.14159);
    band = smoothstep(0.06, 0.94, band);

    // A gas giant is a range of one colour, not stripes of two: the bands run
    // across the middle of the ramp, and only the brightest zones lift toward
    // the pale end at all. Wide contrast here reads as a beach ball.
    vec3 albedo = mix(mix(uDeep, uMid, 0.56), uMid, band);
    albedo = mix(albedo, uHigh, smoothstep(0.84, 1.0, band) * 0.16);
    // Each zone gets its own value. Without it the bands are a barcode: real
    // ones vary in width and in darkness from one to the next.
    float zone = hash11(floor(lat) * 0.37 + 4.1);
    albedo = mix(albedo, uDeep, (1.0 - zone) * 0.30);
    // Poles run darker, as they do on every gas giant ever photographed.
    albedo = mix(albedo, uDeep * 0.72, smoothstep(0.64, 0.99, abs(p.y)));

    // One long-lived storm, squashed into an oval, so the planet has a face.
    vec3 spot = normalize(vec3(0.72, -0.34, 0.6));
    float oval = 1.0 - smoothstep(0.10, 0.30, length((p - spot) * vec3(1.0, 2.1, 1.0)));
    albedo = mix(albedo, uHigh, oval * 0.30 * (0.6 + 0.4 * curl));

    float bump = (band - 0.5) * 0.06;
    gl_FragColor = vec4(shade(albedo, bump, 0.0, 1.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const ROCK_BODY = /* glsl */ `
  void main() {
    vec3 p = vSurface;
    float base = fbm3(p * 4.2);
    float grit = ridge3(p * 11.0);
    // Dark plains, like maria: the big shapes that make a rock recognisable.
    float maria = smoothstep(0.46, 0.66, fbm3(p * 1.9 + 5.0));

    vec3 albedo = mix(uDeep, uMid, base * 0.75 + grit * 0.25);
    albedo = mix(albedo, uDeep * 0.62, maria * 0.7);
    albedo = mix(albedo, uHigh, smoothstep(0.72, 0.95, grit) * 0.35);

    // Twelve impacts, placed by hash rather than by hand. A crater is shape,
    // not paint: almost all of it is a dent in the lambert term, and the rim is
    // lit asymmetrically (bright on the wall facing away from the star, dark
    // on the wall the star is behind), which is what makes it read as a bowl
    // instead of a drawn circle.
    vec3 toKey = normalize(uKeyDirection);
    float relief = (base - 0.5) * 0.10 + (grit - 0.5) * 0.05;
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      vec3 dir = normalize(hash33(vec3(fi * 1.7, fi * 3.1 + 2.0, fi * 5.3 + 7.0)) - 0.5);
      float rad = 0.055 + 0.13 * hash11(fi * 9.1 + 3.0);
      vec3 offset = p - dir;
      float d = length(offset);
      float bowl = smoothstep(rad, rad * 0.70, d);
      float rim = max(smoothstep(rad * 1.10, rad * 0.94, d) - bowl, 0.0);
      float lateral = clamp(dot(offset, toKey) / max(rad, 0.001), -1.0, 1.0);
      albedo = mix(albedo, uDeep * 0.62, bowl * 0.38);
      albedo = mix(albedo, uHigh, rim * 0.14);
      relief -= bowl * 0.22;
      relief += rim * (0.06 - 0.30 * lateral);
    }

    gl_FragColor = vec4(shade(albedo, relief, 0.0, 1.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const OCEAN_BODY = /* glsl */ `
  void main() {
    vec3 p = vSurface;
    float land = fbm3(p * 3.1 + 2.5);
    float detail = fbm3(p * 9.0 + 11.0);
    float shore = smoothstep(0.47, 0.53, land);

    // The sea is not black: an ocean you cannot see is just a dark planet.
    vec3 abyss = mix(uDeep, uMid, 0.04);
    vec3 sea = mix(uDeep, uMid, 0.30);
    vec3 water = mix(abyss, sea, smoothstep(0.16, 0.47, land));
    vec3 ground = mix(uMid, uHigh, 0.30 + detail * 0.45);
    vec3 albedo = mix(water, ground, shore);

    // Ice at the poles, the one place a green world may go white. Tight: a
    // wide cap on a small sphere reads as a hat, not as a pole.
    float ice = smoothstep(0.90, 1.0, abs(p.y) + detail * 0.04);
    albedo = mix(albedo, vec3(0.72, 0.81, 0.88), ice * 0.75);

    float gloss = (1.0 - shore) * 0.30;
    float relief = (detail - 0.5) * 0.14 * shore;
    gl_FragColor = vec4(shade(albedo, relief, gloss, 110.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const BODY: Record<PlanetKind, string> = {
  gas: GAS_BODY,
  rock: ROCK_BODY,
  ocean: OCEAN_BODY,
}

/** Uniforms and varyings, the lighting model, then one of the three bodies. */
export function planetFragment(kind: PlanetKind): string {
  return `${COMMON}\n${SHADE}\n${BODY[kind]}`
}

/**
 * Cloud deck for the ocean world: a shell a few per cent bigger than the body,
 * turning a little faster than it, alpha-blended so the sea shows through the
 * gaps and lit by the same key so the clouds have a terminator too.
 */
export const CLOUD_FRAGMENT = /* glsl */ `
  ${GLSL_NOISE}

  uniform vec3 uColor;
  uniform vec3 uKeyColor;
  uniform vec3 uFillColor;
  uniform vec3 uKeyDirection;
  uniform float uAmbient;
  uniform float uTime;
  uniform float uCoverage;
  varying vec3 vSurface;
  varying vec3 vNormalWorld;
  varying vec3 vViewDirection;

  void main() {
    vec3 p = vSurface;
    float drift = uTime * 0.012;
    float deck = fbm3(p * 3.4 + vec3(drift, 0.0, drift * 0.4));
    float wisps = ridge3(p * 8.0 + vec3(-drift * 1.6, 0.0, 0.0));
    float cover = smoothstep(uCoverage, uCoverage + 0.22, deck * 0.72 + wisps * 0.28);
    // Thinner toward the poles, where there is less weather to draw.
    cover *= 1.0 - smoothstep(0.86, 1.0, abs(p.y));

    vec3 n = normalize(vNormalWorld);
    float ndl = dot(n, normalize(uKeyDirection));
    float key = smoothstep(-0.12, 0.45, ndl);
    vec3 lit = uColor * (uKeyColor * key + uFillColor * 0.28 + uAmbient);

    // Fade the deck out at the silhouette so it never doubles the rim glow.
    float limb = smoothstep(0.02, 0.35, max(dot(n, normalize(vViewDirection)), 0.0));
    gl_FragColor = vec4(lit, cover * limb * 0.9);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
