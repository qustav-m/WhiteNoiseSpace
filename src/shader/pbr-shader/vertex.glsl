attribute vec4 tangent;

varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vTangent;
varying vec3 vBitangent;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vec3 N = normalize(mat3(modelMatrix) * normal);
  vec3 T = normalize(mat3(modelMatrix) * tangent.xyz);
  vec3 B = cross(N, T) * tangent.w;
  vWorldNormal = N;
  vTangent = T;
  vBitangent = B;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
