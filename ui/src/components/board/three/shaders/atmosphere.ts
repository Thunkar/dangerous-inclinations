/**
 * Air, seen edge-on.
 *
 * A Fresnel term on a slightly larger sphere is the usual trick and it does not
 * work: on a back-faced shell the term is flat across the whole disc, so what
 * you get is a hard annulus — a drawn outline, which is what a planet looked
 * like before this pass. What reads as air is a halo that starts at the limb
 * and *falls off outward*, brighter on the side the star is on.
 *
 * So the profile is a function of the fragment's distance from the planet's
 * centre measured in the camera's own plane — two subtractions in the vertex
 * shader — rather than of the normal. The shell is back-faced, so the opaque
 * body cuts the inner half of the halo for free and the maths never has to
 * care where the body is.
 *
 * It is kept narrow and dim on purpose: each planet's name is printed on the
 * plate just outside it and must stay ink on black.
 */
export const ATMOSPHERE_VERTEX = /* glsl */ `
  uniform float uBodyRadius;
  varying vec3 vOffset;
  varying float vRho;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vOffset = normalize(mat3(modelMatrix) * position);
    vec4 viewPosition = viewMatrix * worldPosition;
    vec4 centerView = viewMatrix * modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // Radial distance from the body's centre in the camera's plane, in body
    // radii: 1.0 is the limb, and that is where the halo begins.
    vRho = length(viewPosition.xy - centerView.xy) / max(uBodyRadius, 0.001);
    gl_Position = projectionMatrix * viewPosition;
  }
`

export const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uDayColor;
  uniform vec3 uKeyDirection;
  uniform float uOuter;
  uniform float uPower;
  uniform float uIntensity;
  varying vec3 vOffset;
  varying float vRho;
  void main() {
    float t = clamp((vRho - 1.0) / max(uOuter - 1.0, 0.001), 0.0, 1.0);
    float halo = pow(1.0 - t, uPower);
    // Which side of the limb the star is on. Wrapped, so the glow survives a
    // little way past the terminator instead of stopping dead.
    float day = smoothstep(-0.55, 0.40, dot(normalize(vOffset), normalize(uKeyDirection)));
    vec3 color = mix(uColor, uDayColor, day);
    gl_FragColor = vec4(color, halo * uIntensity * (0.14 + 0.86 * day));
  }
`
