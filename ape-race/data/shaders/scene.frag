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
  outColor = vec4(mix(lit, uFog, f), 1.0);
}
