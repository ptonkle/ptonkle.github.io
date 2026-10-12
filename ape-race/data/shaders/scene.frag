#version 300 es
precision highp float;
// Flat, bright jungle light: sun in soft bands, sky from above, the ground's
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
// TRIAGE row 18 (a try): at top speed the scenery turns wild, in the
// cycling colour (bright where lit, its complement in shadow); the vines,
// apes and items (uScenery 0) keep their own.
uniform float uTrip;
uniform vec3 uWild;
uniform float uScenery;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  float d = length(vWorld - uEye);
  float f = clamp((d - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
  f = f * f * (3.0 - 2.0 * f);
  float diffuse = max(dot(n, uLightDir), 0.0);
  float band = smoothstep(0.05, 0.25, diffuse) * 0.55 + smoothstep(0.55, 0.75, diffuse) * 0.45;
  float up = 0.5 + 0.5 * n.y;
  vec3 ambient = mix(uGround, uSky, up);
  vec3 base = vColor.rgb;
  vec3 lit = base * (ambient * 0.78 + uLight * band * 0.6);
  lit = mix(lit, base * 1.08 + vec3(0.04), vColor.a);
  float wild = uTrip * uScenery;
  if (wild > 0.0) {
    float luma = dot(lit, vec3(0.3, 0.59, 0.11));
    vec3 vivid = mix(uWild.gbr * 0.55, uWild * 1.25, clamp(luma * 1.6, 0.0, 1.0));
    lit = mix(lit, vivid, wild * 0.8);
  }
  outColor = vec4(mix(lit, uFog, f), 1.0);
}
