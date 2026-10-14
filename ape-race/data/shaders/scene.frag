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
// Sector Ape's edge light (SECOND-ORDER SM4): lit from a sun far below,
// a hull's top faces away from the light and would be black on black, so
// every surface gets this colour added where it turns away from the eye
// (its outline). Black, adding nothing, on every other map.
uniform vec3 uRim;
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
  // a soft glow (uScenery 4, the City's wires): its colour added over what
  // is behind, strongest where it faces the eye and nothing at its outline,
  // fading with the fog; one side only, so it adds once. A strength over 1
  // adds evenly (the part over 1): the sun's sheen on the water.
  if (uScenery > 3.5) {
    // an aura round an ape (a negative strength, TRIAGE T59): the far side
    // of a shell round it only, so the ape in front hides its middle and
    // the glow shows round the ape's outline, fading out to the shell's
    if (vColor.a < 0.0) {
      if (gl_FrontFacing) discard;
      float rim = abs(dot(n, normalize(uEye - vWorld)));
      float glow = -vColor.a * rim * rim * (1.0 - f);
      // part laid over what is behind, part added: its hue holds over a
      // green jungle or a white slope (a red only added on green reads
      // orange), and it still glows
      outColor = vec4(vColor.rgb * glow, glow * 0.7);
      return;
    }
    float facing = abs(dot(n, normalize(uEye - vWorld)));
    // a strength of 3 or more is a glow in the sky (Sector Ape's haze and
    // the sun's corona, far round the eye): the part over 3, soft to its
    // outline, unfogged, one side only
    // a strength from 2 to 3 is glass (the space jaguar's bubble helmet,
    // TRIAGE T78): faint inside, a crisp bright rim where it curves away,
    // one side only
    if (vColor.a >= 2.0 && vColor.a < 3.0) {
      if (!gl_FrontFacing) discard;
      float e = 1.0 - facing;
      float s = (vColor.a - 2.0) * (0.12 + 1.6 * smoothstep(0.62, 0.86, e)) * (1.0 - f);
      outColor = vec4(vColor.rgb * s, 0.0);
      return;
    }
    if (vColor.a >= 3.0) {
      if (!gl_FrontFacing) discard;
      float s = (vColor.a - 3.0) * facing * facing;
      outColor = vec4(vColor.rgb * s, 0.0);
      return;
    }
    if (!gl_FrontFacing && vColor.a <= 1.0) discard;
    float a = vColor.a > 1.0 ? vColor.a - 1.0 : vColor.a * facing * facing;
    a *= 1.0 - f;
    outColor = vec4(vColor.rgb * a, 0.0);
    return;
  }
  // the sky's dome (a glow of 3.5 or more, the Ski Slope's noon): the fog
  // colour at the horizon deepening to the sky's colour times the shape's
  // own overhead, unlit and unfogged, so the sky is paler low down
  if (vColor.a > 3.5) {
    float up = clamp(normalize(vWorld - uEye).y, 0.0, 1.0);
    vec3 dome = mix(uFog, uSky * vColor.rgb, sqrt(clamp(up / 0.6, 0.0, 1.0)));
    if (uMute > 0.0) dome = mix(dome, vec3(dot(dome, vec3(0.3, 0.59, 0.11))), uMute * 0.45);
    outColor = vec4(dome, 1.0);
    return;
  }
  // smooth light, so each flat facet of a faceted shape takes its own shade;
  // the wrapped term keeps facets turned from the sun apart from each other
  float ndl = dot(n, uLightDir);
  float diffuse = max(ndl, 0.0);
  float wrapped = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
  float up = 0.5 + 0.5 * n.y;
  vec3 ambient = mix(uGround, uSky, up);
  vec3 base = vColor.rgb;
  vec3 lit = base * (ambient * 0.66 + uLight * (diffuse * 0.48 + wrapped * 0.2));
  float edge = 1.0 - abs(dot(n, normalize(uEye - vWorld)));
  lit += uRim * (edge * edge) * (0.4 + base);
  // a glow over 1 is the sky's (the City's low sun and its halo): full
  // colour and no fog, as if at infinity. From 2.5 to 3.5, a far backdrop
  // (the Ski Slope's mountains): lit like the rest, no distance fog, but
  // hazed toward the fog colour by the part over 2.5
  float sky = step(1.5, vColor.a);
  float far = step(2.5, vColor.a);
  float haze = far * (vColor.a - 2.5);
  lit = mix(lit, base * 1.08 + vec3(0.04), min(vColor.a, 1.0) * (1.0 - far));
  lit = mix(lit, uFog, haze);
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
