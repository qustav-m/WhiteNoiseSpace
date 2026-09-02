import * as THREE from 'three';
import { buildMesh } from './geometry';

export interface SceneSetup {
  geometry: THREE.BufferGeometry;
  scale: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
}

function normalizeGeometry(geometry: THREE.BufferGeometry): number {
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox!.getSize(size);
  const scale = 2 / Math.max(size.x, size.y, size.z);
  geometry.center();
  return scale;
}

export class RenderPipeline {
  readonly camera: THREE.PerspectiveCamera;
  readonly sceneAnchor: THREE.Object3D;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly noiseScene: THREE.Scene;
  private readonly pbrScene: THREE.Scene;
  private readonly pbrAnchor: THREE.Object3D;
  private readonly blitScene: THREE.Scene;
  private readonly blitCamera: THREE.OrthographicCamera;
  private readonly blitMaterial: THREE.ShaderMaterial;

  private readonly noiseMeshes: THREE.Mesh[];
  private readonly pbrMeshes: THREE.Mesh[];
  private currentSceneIndex: number = 0;

  private noiseRenderTarget: THREE.WebGLRenderTarget | undefined;
  private pbrRenderTarget: THREE.WebGLRenderTarget | undefined;
  private pbrCaptureTarget: THREE.WebGLRenderTarget | undefined;

  constructor(
    canvas: HTMLCanvasElement,
    vertexSource: string,
    fragmentSource: string,
    scenes: SceneSetup[],
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 100);
    this.camera.position.set(0, 0, 0);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(-1, 0, 0);

    const scales = scenes.map(s => normalizeGeometry(s.geometry));
    this.noiseMeshes = scenes.map((s, i) => {
      const mesh = buildMesh(vertexSource, fragmentSource, s.geometry);
      mesh.scale.setScalar(scales[i] * s.scale);
      mesh.rotation.set(
        THREE.MathUtils.degToRad(s.rotationX),
        THREE.MathUtils.degToRad(s.rotationY),
        THREE.MathUtils.degToRad(s.rotationZ),
      );
      return mesh;
    });
    this.pbrMeshes = scenes.map((s, i) => {
      const mesh = new THREE.Mesh(s.geometry, new THREE.MeshNormalMaterial());
      mesh.scale.setScalar(scales[i] * s.scale);
      mesh.rotation.set(
        THREE.MathUtils.degToRad(s.rotationX),
        THREE.MathUtils.degToRad(s.rotationY),
        THREE.MathUtils.degToRad(s.rotationZ),
      );
      return mesh;
    });

    this.sceneAnchor = new THREE.Object3D();
    this.sceneAnchor.position.set(-2, 0, 0);
    this.sceneAnchor.add(this.noiseMeshes[0]);

    this.noiseScene = new THREE.Scene();
    const bgMaterial = new THREE.ShaderMaterial({
      depthWrite: false,
      vertexShader: `void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }`,
      fragmentShader: `
        float rand(vec2 co) { return fract(sin(dot(co, vec2(127.1, 311.7))) * 43758.5453); }
        void main() { gl_FragColor = vec4(vec3(rand(floor(gl_FragCoord.xy))), 1.0); }
      `,
    });
    const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMaterial);
    bgMesh.renderOrder = -1;
    bgMesh.frustumCulled = false;
    this.noiseScene.add(bgMesh);
    this.noiseScene.add(this.sceneAnchor);

    this.pbrAnchor = new THREE.Object3D();
    this.pbrAnchor.position.set(-2, 0, 0);
    this.pbrAnchor.add(this.pbrMeshes[0]);

    this.pbrScene = new THREE.Scene();
    this.pbrScene.background = new THREE.Color(0x000000);
    this.pbrScene.add(this.pbrAnchor);

    this.blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.blitScene = new THREE.Scene();
    this.blitMaterial = new THREE.ShaderMaterial({
      uniforms: {
        noiseTexture:            { value: null },
        pbrTexture:              { value: null },
        captureTexture:          { value: null },
        pbrColorBlend:           { value: 0 },
        captureBlend:            { value: 0 },
        grayscalePbrNoiseBlend:  { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D noiseTexture;
        uniform sampler2D pbrTexture;
        uniform sampler2D captureTexture;
        uniform float pbrColorBlend;
        uniform float captureBlend;
        uniform float grayscalePbrNoiseBlend;
        varying vec2 vUv;
        void main() {
          vec3 noise = texture2D(noiseTexture, vUv).rgb;
          vec3 pbr = texture2D(pbrTexture, vUv).rgb;
          vec3 capture = texture2D(captureTexture, vUv).rgb;
          float pbrValue = max(pbr.r, max(pbr.g, pbr.b));
          vec3 pbrWithColor = mix(vec3(pbrValue), pbr, pbrColorBlend);
          vec3 pbrOrCapture = mix(pbrWithColor, capture, captureBlend);
          vec3 finalColor = mix(noise, pbrOrCapture, grayscalePbrNoiseBlend);
          gl_FragColor = vec4(finalColor, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    this.blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blitMaterial));
  }

  switchToNextScene(): void {
    this.sceneAnchor.remove(this.noiseMeshes[this.currentSceneIndex]);
    this.pbrAnchor.remove(this.pbrMeshes[this.currentSceneIndex]);
    this.currentSceneIndex = (this.currentSceneIndex + 1) % this.noiseMeshes.length;
    this.sceneAnchor.add(this.noiseMeshes[this.currentSceneIndex]);
    this.pbrAnchor.add(this.pbrMeshes[this.currentSceneIndex]);
  }

  setResolution(scale: number): void {
    const width: number = Math.max(1, Math.round(window.innerWidth * scale));
    const height: number = Math.max(1, Math.round(window.innerHeight * scale));

    this.noiseRenderTarget?.dispose();
    this.pbrRenderTarget?.dispose();
    this.pbrCaptureTarget?.dispose();

    const targetOptions = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    this.noiseRenderTarget = new THREE.WebGLRenderTarget(width, height, targetOptions);
    this.pbrRenderTarget = new THREE.WebGLRenderTarget(width, height, targetOptions);
    this.pbrCaptureTarget = new THREE.WebGLRenderTarget(width, height, targetOptions);

    this.blitMaterial.uniforms.noiseTexture.value = this.noiseRenderTarget.texture;
    this.blitMaterial.uniforms.captureTexture.value = this.pbrCaptureTarget.texture;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

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
    this.pbrAnchor.quaternion.copy(this.sceneAnchor.quaternion);

    this.renderer.setRenderTarget(this.pbrRenderTarget ?? null);
    this.renderer.render(this.pbrScene, this.camera);

    this.renderer.setRenderTarget(this.noiseRenderTarget ?? null);
    this.renderer.render(this.noiseScene, this.camera);

    this.blitMaterial.uniforms.pbrTexture.value = this.pbrRenderTarget?.texture;

    this.renderer.setRenderTarget(null);
    this.renderer.render(this.blitScene, this.blitCamera);
  }
}
