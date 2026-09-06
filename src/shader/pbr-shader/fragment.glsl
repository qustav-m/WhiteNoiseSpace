uniform sampler2D baseColorMap;
uniform sampler2D normalMap;
uniform sampler2D metallicRoughnessMap;
uniform sampler2D envMap;

uniform vec3 baseColorFactor;
uniform float metallicFactor;
uniform float roughnessFactor;
uniform float normalScale;

uniform bool hasBaseColorMap;
uniform bool hasNormalMap;
uniform bool hasMetallicRoughnessMap;

uniform vec3 lightPosition;
uniform float lightIntensity;

varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vTangent;
varying vec3 vBitangent;

const float PI = 3.14159265359;

vec2 equirectUv(vec3 dir) {
  float phi = atan(dir.z, dir.x);
  float theta = acos(clamp(dir.y, -1.0, 1.0));
  return vec2(phi / (2.0 * PI) + 0.5, 1.0 - theta / PI);
}

float distributionGGX(vec3 N, vec3 H, float roughness) {
  float alpha = roughness * roughness;
  float alpha2 = alpha * alpha;
  float NdotH = max(dot(N, H), 0.0);
  float denom = NdotH * NdotH * (alpha2 - 1.0) + 1.0;
  return alpha2 / (PI * denom * denom);
}

float geometrySchlickGGX(float NdotV, float roughness) {
  float k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k);
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
}

vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

void main() {
  vec3 albedo = baseColorFactor;
  if (hasBaseColorMap) albedo *= texture2D(baseColorMap, vUv).rgb;

  vec3 N = normalize(vWorldNormal);
  if (hasNormalMap) {
    mat3 TBN = mat3(vTangent, vBitangent, vWorldNormal);
    vec3 n = texture2D(normalMap, vUv).rgb * 2.0 - 1.0;
    n.xy *= normalScale;
    N = normalize(TBN * n);
  }

  float metallic = metallicFactor;
  float roughness = roughnessFactor;
  if (hasMetallicRoughnessMap) {
    vec4 mr = texture2D(metallicRoughnessMap, vUv);
    roughness *= mr.g;
    metallic *= mr.b;
  }
  roughness = clamp(roughness, 0.04, 1.0);
  metallic = clamp(metallic, 0.0, 1.0);

  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 F0 = mix(vec3(0.04), albedo, metallic);

  vec3 L = normalize(lightPosition - vWorldPosition);
  vec3 H = normalize(V + L);
  float dist = length(lightPosition - vWorldPosition);
  vec3 Li = vec3(lightIntensity) / (dist * dist);

  float D = distributionGGX(N, H, roughness);
  float G = geometrySmith(N, V, L, roughness);
  vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

  vec3 kD = (vec3(1.0) - F) * (1.0 - metallic);
  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 0.0);

  vec3 diffuse = kD * albedo / PI;
  vec3 specularDirect = D * G * F / max(4.0 * NdotV * NdotL, 0.0001);
  vec3 Lo = (diffuse + specularDirect) * Li * NdotL;

  vec3 reflDir = reflect(-V, N);
  vec3 envColor = texture2D(envMap, equirectUv(reflDir)).rgb;
  vec3 envF = fresnelSchlick(NdotV, F0);
  vec3 envSpecular = envF * envColor * (1.0 - roughness);

  vec3 ambient = vec3(0.03) * albedo;
  vec3 color = ambient + Lo + envSpecular;

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
}
