import * as THREE from 'three';
import vertexSrc from '../shader/pbr-shader/vertex.glsl?raw';
import fragmentSrc from '../shader/pbr-shader/fragment.glsl?raw';
import { getEnvironmentMap } from '../environmentMap';

export function buildPbrMesh(
  geometry: THREE.BufferGeometry,
  sourceMaterial: THREE.Material | THREE.Material[],
): THREE.Mesh {
  const mat = Array.isArray(sourceMaterial) ? sourceMaterial[0] : sourceMaterial;
  const std = mat instanceof THREE.MeshStandardMaterial ? mat : new THREE.MeshStandardMaterial();

  let hasRealTangents = !!geometry.attributes.tangent;
  if (!hasRealTangents) {
    if (geometry.attributes.uv && geometry.index) {
      geometry.computeTangents();
      hasRealTangents = true;
    } else {
      const count = geometry.attributes.position.count;
      const data = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) { data[i * 4] = 1; data[i * 4 + 3] = 1; }
      geometry.setAttribute('tangent', new THREE.BufferAttribute(data, 4));
    }
  }

  const canNormalMap = hasRealTangents && !!std.normalMap && !!geometry.attributes.uv;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      baseColorMap:         { value: std.map },
      normalMap:            { value: std.normalMap },
      metallicRoughnessMap: { value: std.metalnessMap },
      envMap:               { value: getEnvironmentMap() },

      baseColorFactor: { value: std.color.clone() },
      metallicFactor:  { value: std.metalness },
      roughnessFactor: { value: std.roughness },
      normalScale:     { value: std.normalScale?.x ?? 1.0 },

      lightPosition:  { value: new THREE.Vector3(-1, 100, 100) },
      lightIntensity: { value: 10.0 },

      hasBaseColorMap:         { value: !!std.map },
      hasNormalMap:            { value: canNormalMap },
      hasMetallicRoughnessMap: { value: !!std.metalnessMap },
    },
    vertexShader: vertexSrc,
    fragmentShader: fragmentSrc,
  });

  return new THREE.Mesh(geometry, material);
}
