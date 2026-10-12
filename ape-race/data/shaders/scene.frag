#version 300 es
precision highp float;
// Flat, bright jungle light: sun with a soft wrap, sky from above, the ground's
// green from below, and distance fog that closes in at the far end (the
// core sends where). A glowing shape keeps its own colour.
in vec3 vWorld;
in vec3 vNormal;
in vec4 vColor;
uniform vec3 uEye;
uniform vec2 uFogRange;
uniform vec3 uLightDir;
uniform vec3 uLight;
uniform vec3 uSky;
uniform vec3 uFog;
uniform vec3 uGround;
// TRIAGE rows 18 and 20 (a try): at top speed the jungle turns wild, each
// part in its own colour so they stay distinct: the ground (uScenery 2),
// the leaves and the wood (uScenery 1, told apart by their own green); the
// vines, apes and items (uScenery 0) keep theirs.
uniform float uTrip;
uniform vec3 uWildGround;
uniform vec3 uWildWood;
uniform vec3 uWildLeaves;
uniform float uScenery;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  float d = length(vWorld - uEye);
  float f = clamp((d - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
  f = f * f * (3.0 - 2.0 * f);
  // smooth light, so each flat facet of a faceted shape takes its own shade;
  // the wrapped term keeps facets turned from the sun apart from each other
  float ndl = dot(n, uLightDir);
  float diffuse = max(ndl, 0.0);
  float wrapped = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
  float up = 0.5 + 0.5 * n.y;
  vec3 ambient = mix(uGround, uSky, up);
  vec3 base = vColor.rgb;
  vec3 lit = base * (ambient * 0.66 + uLight * (diffuse * 0.48 + wrapped * 0.2));
  lit = mix(lit, base * 1.08 + vec3(0.04), vColor.a);
  float wild = uTrip * step(0.5, uScenery);
  if (wild > 0.0) {
    vec3 pal = uWildWood;
    if (uScenery > 1.5) pal = uWildGround;
    else if (base.g > base.r * 1.15 && base.g > base.b) pal = uWildLeaves;
    // keep the light and shade, in the new colour
    float luma = dot(lit, vec3(0.3, 0.59, 0.11));
    float own = max(dot(base, vec3(0.3, 0.59, 0.11)), 0.05);
    vec3 vivid = pal * clamp(luma / own, 0.35, 1.35);
    lit = mix(lit, vivid, wild * 0.85);
  }
  outColor = vec4(mix(lit, uFog, f), 1.0);
}
