/**
 * The noise every body on the board is made of.
 *
 * Nothing in the scene loads a texture: a planet's bands, a rock's craters and
 * the turbulence in the accretion disc are all the same handful of GLSL
 * functions sampled at different scales. They live here so there is one
 * implementation to tune and one place where the cost is paid. `fbm3` is the
 * hot loop of the whole art pass, and its octave count is a `#define` the
 * caller sets, so the cheap quality path compiles a shorter loop rather than
 * branching per pixel.
 *
 * Everything is value noise rather than gradient noise: it is about half the
 * arithmetic, and at the scales a 38-unit sphere is drawn at nobody can tell.
 */

/** Hash and value-noise primitives. Prepend to any fragment shader that needs them. */
export const GLSL_NOISE = /* glsl */ `
  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  vec3 hash33(vec3 p) {
    return vec3(hash13(p), hash13(p + 17.13), hash13(p + 53.71));
  }

  /* Trilinear value noise, smoothstep-faded so the derivative is continuous. */
  float vnoise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i);
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z
    );
  }

  #ifndef FBM_OCTAVES
  #define FBM_OCTAVES 4
  #endif

  /* Fractal sum, normalised to roughly 0..1. */
  float fbm3(vec3 p) {
    float sum = 0.0;
    float amplitude = 0.5;
    float norm = 0.0;
    vec3 q = p;
    for (int i = 0; i < FBM_OCTAVES; i++) {
      sum += amplitude * vnoise3(q);
      norm += amplitude;
      q = q * 2.03 + vec3(11.3, 7.7, 5.1);
      amplitude *= 0.5;
    }
    return sum / max(norm, 0.0001);
  }

  /* Ridged sum: |noise| folded, which leaves sharp creases: crater rims,
     cloud edges, the filaments in a nebula. */
  float ridge3(vec3 p) {
    float sum = 0.0;
    float amplitude = 0.5;
    float norm = 0.0;
    vec3 q = p;
    for (int i = 0; i < FBM_OCTAVES; i++) {
      float n = 1.0 - abs(vnoise3(q) * 2.0 - 1.0);
      sum += amplitude * n * n;
      norm += amplitude;
      q = q * 2.07 + vec3(3.7, 19.1, 8.3);
      amplitude *= 0.5;
    }
    return sum / max(norm, 0.0001);
  }
`

/**
 * Prefix a shader with its octave budget. Four octaves is the look; two is the
 * cheap path, where a planet is a hundred pixels wide and nobody is looking.
 */
export function withOctaves(octaves: number, source: string): string {
  return `#define FBM_OCTAVES ${Math.max(1, Math.round(octaves))}\n${source}`
}
