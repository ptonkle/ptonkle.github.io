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
// TRIAGE T33: the colourblind mode mutes the world toward grey (the
// scenery and the ground most, the apes and items less) and leaves the
// vines and their flowers (uScenery 3) vivid, so they stand out by
// brightness, not hue.
uniform float uMute;
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
  // a glow over 1 is the sky's (the City's low sun and its halo): full
  // colour and no fog, as if at infinity
  float sky = step(1.5, vColor.a);
  lit = mix(lit, base * 1.08 + vec3(0.04), min(vColor.a, 1.0));
  if (uMute > 0.0 && uScenery < 2.5) {
    float grey = dot(lit, vec3(0.3, 0.59, 0.11));
    float amount = uScenery > 0.5 ? 0.82 : 0.45;
    float dim = uScenery > 0.5 ? 0.86 : 1.0;
    lit = mix(lit, vec3(grey) * dim, uMute * amount);
  }
  float wild = uTrip * step(0.5, uScenery) * (1.0 - step(2.5, uScenery));
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
  outColor = vec4(mix(lit, uFog, f * (1.0 - sky)), 1.0);
}
