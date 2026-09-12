import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import exrUrl from '../environmentMap/studio_envmap.exr?url';

let environmentMap: THREE.Texture | null = null;

export async function initEnvironmentMap(): Promise<void> {
  const loader = new EXRLoader();
  environmentMap = await loader.loadAsync(exrUrl);
  environmentMap.mapping = THREE.EquirectangularReflectionMapping;
  environmentMap.wrapS = THREE.RepeatWrapping;
}

export function getEnvironmentMap(): THREE.Texture | null {
  return environmentMap;
}
