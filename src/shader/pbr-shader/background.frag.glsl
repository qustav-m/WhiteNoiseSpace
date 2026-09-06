uniform sampler2D envMap;
uniform float cameraFov;
uniform float cameraAspect;

varying vec2 vNdc;

const float PI = 3.14159265359;

vec2 equirectUv(vec3 dir) {
  float phi = atan(dir.z, dir.x);
  float theta = acos(clamp(dir.y, -1.0, 1.0));
  return vec2(phi / (2.0 * PI) + 0.5, 1.0 - theta / PI);
}

void main() {
  // reconstruct view-space direction from NDC position and camera parameters
  float halfHeight = tan(cameraFov * 0.5);
  vec3 dirCam = normalize(vec3(
    vNdc.x * halfHeight * cameraAspect,
    vNdc.y * halfHeight,
    -1.0
  ));

  // rotate from camera space to world space using inverse of viewMatrix rotation
  vec3 dirWorld = mat3(transpose(mat3(viewMatrix))) * dirCam;

  vec3 color = texture2D(envMap, equirectUv(dirWorld)).rgb;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
}
