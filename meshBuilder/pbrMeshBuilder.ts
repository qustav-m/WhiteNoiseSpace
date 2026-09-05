import * as THREE from 'three';

export function buildPbrMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
): THREE.Mesh {
  return new THREE.Mesh(geometry, material);
}
