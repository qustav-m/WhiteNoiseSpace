import * as THREE from 'three';
import { LoadedModel } from './sceneLoader';
import compositeVertex from './shader/composite-shader/vertex.glsl?raw';
import compositeFragment from './shader/composite-shader/fragment.glsl?raw';
import backgroundVertex from './shader/noise-shader/background.vert.glsl?raw';
import backgroundFragment from './shader/noise-shader/background.frag.glsl?raw';
import pbrBackgroundVertex from './shader/pbr-shader/background.vert.glsl?raw';
import pbrBackgroundFragment from './shader/pbr-shader/background.frag.glsl?raw';
import { getEnvironmentMap } from './environmentMap';


export class RenderPipeline {
  readonly camera: THREE.PerspectiveCamera;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly noiseScene: THREE.Scene;
  private readonly pbrScene: THREE.Scene;
  private readonly blitScene: THREE.Scene;
  private readonly blitCamera: THREE.OrthographicCamera;
  private readonly blitMaterial: THREE.ShaderMaterial;

  private readonly pbrBgMaterial: THREE.ShaderMaterial;
  private currentModel: LoadedModel | null = null;

  private noiseRenderTarget: THREE.WebGLRenderTarget | undefined;
  private pbrRenderTarget: THREE.WebGLRenderTarget | undefined;
  private pbrCaptureTarget: THREE.WebGLRenderTarget | undefined;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 100);
    this.camera.position.set(0, 0, 0);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(-1, 0, 0);

    this.noiseScene = new THREE.Scene();
    const bgMaterial = new THREE.ShaderMaterial({
      depthWrite: false,
      vertexShader: backgroundVertex,
      fragmentShader: backgroundFragment,
    });
    const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMaterial);
    bgMesh.renderOrder = -1;
    bgMesh.frustumCulled = false;
    this.noiseScene.add(bgMesh);

    this.pbrScene = new THREE.Scene();
    this.pbrBgMaterial = new THREE.ShaderMaterial({
      depthWrite: false,
      vertexShader: pbrBackgroundVertex,
      fragmentShader: pbrBackgroundFragment,
      uniforms: {
        envMap:        { value: getEnvironmentMap() },
        cameraFov:    { value: THREE.MathUtils.degToRad(60) },
        cameraAspect: { value: window.innerWidth / window.innerHeight },
      },
    });
    const pbrBgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.pbrBgMaterial);
    pbrBgMesh.renderOrder = -1;
    pbrBgMesh.frustumCulled = false;
    this.pbrScene.add(pbrBgMesh);

    this.blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.blitScene = new THREE.Scene();
    this.blitMaterial = new THREE.ShaderMaterial({
      uniforms: {
        noiseTexture:           { value: null },
        pbrTexture:             { value: null },
        captureTexture:         { value: null },
        pbrColorBlend:          { value: 0 },
        captureBlend:           { value: 0 },
        grayscalePbrNoiseBlend: { value: 0 },
        time:                   { value: 0 },
        resolution:             { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      },
      vertexShader: compositeVertex,
      fragmentShader: compositeFragment,
    });
    this.blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blitMaterial));
  }

  switchToModel(model: LoadedModel): LoadedModel | null {
    const removedModel = this.currentModel;
    if (removedModel) {
      this.noiseScene.remove(removedModel.noiseObject);
      this.pbrScene.remove(removedModel.pbrObject);
    }
    model.noiseObject.position.set(-2, 0, 0);
    model.pbrObject.position.set(-2, 0, 0);
    this.noiseScene.add(model.noiseObject);
    this.pbrScene.add(model.pbrObject);
    this.currentModel = model;
    return removedModel;
  }

  setModelRotation(q: THREE.Quaternion): void {
    this.currentModel?.noiseObject.quaternion.copy(q);
    this.currentModel?.pbrObject.quaternion.copy(q);
  }

  getModelRotation(): THREE.Quaternion {
    return this.currentModel?.noiseObject.quaternion.clone() ?? new THREE.Quaternion();
  }

  setResolution(scale: number): void {
    const width = Math.max(1, Math.round(window.innerWidth * scale));
    const height = Math.max(1, Math.round(window.innerHeight * scale));
    this.setNoiseResolution(width, height);
    this.setPbrResolution(width, height);
  }

  setNoiseResolution(width: number, height: number): void {
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));
    this.noiseRenderTarget?.dispose();
    this.noiseRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.blitMaterial.uniforms.noiseTexture.value = this.noiseRenderTarget.texture;
  }

  setPbrResolution(width: number, height: number): void {
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));
    this.pbrRenderTarget?.dispose();
    this.pbrCaptureTarget?.dispose();
    this.pbrRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      samples: 4,
    });
    this.pbrCaptureTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.blitMaterial.uniforms.captureTexture.value = this.pbrCaptureTarget.texture;
  }

  setCompositeGridResolution(width: number, height: number): void {
    this.blitMaterial.uniforms.resolution.value.set(
      Math.max(1, Math.round(width)),
      Math.max(1, Math.round(height)),
    );
  }

  get memoryInfo() { return this.renderer.info.memory; }

  handleResize(resolutionScale: number): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.setResolution(resolutionScale);
  }

  takeCapture(): void {
    if (!this.pbrCaptureTarget) return;
    const savedCapture = this.blitMaterial.uniforms.captureTexture.value;
    this.blitMaterial.uniforms.captureTexture.value = null;
    this.renderer.setRenderTarget(this.pbrCaptureTarget);
    this.renderer.render(this.blitScene, this.blitCamera);
    this.renderer.setRenderTarget(null);
    this.blitMaterial.uniforms.captureTexture.value = savedCapture;
  }

  setBlends(grayscalePbrNoiseBlend: number, pbrColorBlend: number, captureBlend: number): void {
    this.blitMaterial.uniforms.grayscalePbrNoiseBlend.value = grayscalePbrNoiseBlend;
    this.blitMaterial.uniforms.pbrColorBlend.value = pbrColorBlend;
    this.blitMaterial.uniforms.captureBlend.value = captureBlend;
  }

  render(): void {
    this.blitMaterial.uniforms.time.value += 0.01;
    this.renderer.setRenderTarget(this.pbrRenderTarget ?? null);
    this.renderer.render(this.pbrScene, this.camera);

    this.renderer.setRenderTarget(this.noiseRenderTarget ?? null);
    this.renderer.render(this.noiseScene, this.camera);

    this.blitMaterial.uniforms.pbrTexture.value = this.pbrRenderTarget?.texture;

    this.renderer.setRenderTarget(null);
    this.renderer.render(this.blitScene, this.blitCamera);
  }
}
