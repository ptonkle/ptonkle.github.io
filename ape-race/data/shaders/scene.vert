#version 300 es
// One shape: the unit mesh's vertex, placed by the instance's three rows
// (iA, iB, iC: the matrix's rows, translation in .w), coloured by iD
// (rgb, and how much it glows). The terrain carries its colours per vertex.
in vec3 aPos;
in vec3 aNormal;
in vec3 aTint;
in vec4 iA;
in vec4 iB;
in vec4 iC;
in vec4 iD;
uniform mat4 uVP;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vColor;
void main() {
  vec3 w = vec3(dot(iA.xyz, aPos), dot(iB.xyz, aPos), dot(iC.xyz, aPos)) + vec3(iA.w, iB.w, iC.w);
  // normals by the cofactor matrix, so stretched shapes shade right
  vec3 c0 = vec3(iA.x, iB.x, iC.x);
  vec3 c1 = vec3(iA.y, iB.y, iC.y);
  vec3 c2 = vec3(iA.z, iB.z, iC.z);
  vNormal = aNormal.x * cross(c1, c2) + aNormal.y * cross(c2, c0) + aNormal.z * cross(c0, c1);
  vWorld = w;
  vColor = vec4(iD.rgb * aTint, iD.a);
  gl_Position = uVP * vec4(w, 1.0);
}
