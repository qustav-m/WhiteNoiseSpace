import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildMesh } from './geometry';
import { resolveSceneConfig } from './sceneConfig';

export interface LoadedModel {
  noiseObject: THREE.Object3D;
  pbrObject: THREE.Object3D;
}

function disposeModel(model: LoadedModel): void {
  [model.noiseObject, model.pbrObject].forEach(object => {
    object.traverse(child => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.geometry.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
          .forEach(m => m.dispose());
      }
    });
  });
}

export class SceneLoader {
  private vertexSource: string = '';
  private fragmentSource: string = '';
  private readonly entries: { filename: string; url: string }[];
  private nextIndex: number = 1;
  private pendingModel: LoadedModel | null = null;
  isNextReady: boolean = false;
  readonly firstReady: Promise<void>;

  constructor() {
    const glob = import.meta.glob('./scenes/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
    this.entries = Object.entries(glob).map(([path, url]) => ({
      filename: path.split('/').pop()!,
      url,
    }));
    this.firstReady = this.startUp();
  }

  private async startUp(): Promise<void> {
    [this.vertexSource, this.fragmentSource] = await Promise.all([
      fetch('./export-shader/vertex.glsl').then(r => r.text()),
      fetch('./export-shader/fragment.glsl').then(r => r.text()),
    ]);
    if (this.entries.length === 0) throw new Error('No GLB files found in scenes/');
    await this.loadIndex(0);
  }

  getNext(): LoadedModel {
    const model = this.pendingModel!;
    this.pendingModel = null;
    this.isNextReady = false;
    return model;
  }

  dispose(evicted: LoadedModel | null): void {
    if (evicted) disposeModel(evicted);
    this.loadIndex(this.nextIndex % this.entries.length).catch(console.error);
    this.nextIndex++;
  }

  private async loadIndex(index: number): Promise<void> {
    const { filename, url } = this.entries[index];
    this.pendingModel = await this.buildModel(url, filename);
    this.isNextReady = true;
  }

  private async buildModel(url: string, filename: string): Promise<LoadedModel> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    let geometry: THREE.BufferGeometry | null = null;
    gltf.scene.traverse(child => {
      if (!geometry && (child as THREE.Mesh).isMesh) {
        geometry = (child as THREE.Mesh).geometry;
      }
    });
    if (!geometry) throw new Error(`No mesh in ${filename}`);

    const geo = geometry as THREE.BufferGeometry;
    const config = resolveSceneConfig(filename);

    geo.computeBoundingBox();
    const size = new THREE.Vector3();
    geo.boundingBox!.getSize(size);
    const normalizedScale = 2 / Math.max(size.x, size.y, size.z);
    geo.center();

    const finalScale = normalizedScale * config.scale;
    const rx = THREE.MathUtils.degToRad(config.rotationX);
    const ry = THREE.MathUtils.degToRad(config.rotationY);
    const rz = THREE.MathUtils.degToRad(config.rotationZ);

    const noiseMesh = buildMesh(this.vertexSource, this.fragmentSource, geo);
    noiseMesh.scale.setScalar(finalScale);
    noiseMesh.rotation.set(rx, ry, rz);
    const noiseObject = new THREE.Object3D();
    noiseObject.add(noiseMesh);

    const pbrMesh = new THREE.Mesh(geo, new THREE.MeshNormalMaterial());
    pbrMesh.scale.setScalar(finalScale);
    pbrMesh.rotation.set(rx, ry, rz);
    const pbrObject = new THREE.Object3D();
    pbrObject.add(pbrMesh);

    return { noiseObject, pbrObject };
  }
}
