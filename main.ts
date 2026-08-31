import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as THREE from 'three';
import { TeapotGeometry } from 'three/examples/jsm/geometries/TeapotGeometry.js';
import { calculateViewer, setUpDefault } from './viewer';
import { buildMesh } from './geometry';
import { SceneController } from './sceneController';
import { initAudio } from './audio';

const WASM_PATH: string = './node_modules/@mediapipe/tasks-vision/wasm';
const MODEL_PATH: string = './models/face_landmarker.task';

let status!: HTMLElement;
let video!: HTMLVideoElement;
let landmarker!: FaceLandmarker;
let threeRenderer!: THREE.WebGLRenderer;
let threeScene!: THREE.Scene;
let pbrScene!: THREE.Scene;
let threeCamera!: THREE.PerspectiveCamera;
let sceneMesh!: THREE.Mesh;
let pbrMesh!: THREE.Mesh;
let noiseRenderTarget: THREE.WebGLRenderTarget | undefined;
let pbrRenderTarget: THREE.WebGLRenderTarget | undefined;
let blitScene!: THREE.Scene;
let blitCamera!: THREE.OrthographicCamera;
let blitMaterial!: THREE.ShaderMaterial;
let resolutionScale: number = 1.0;
let sceneController!: SceneController;

function loop(): void {
  requestAnimationFrame(loop);

  const now = Date.now();
  const result = landmarker.detectForVideo(video, now);
  calculateViewer(result);
  sceneController.update(threeCamera, sceneMesh, now);

  pbrMesh.quaternion.copy(sceneMesh.quaternion);
  blitMaterial.uniforms.grayscalePbrNoiseBlend.value = sceneController.grayscalePbrNoiseBlend;
  blitMaterial.uniforms.pbrColorBlend.value = sceneController.pbrColorBlend;

  const tracked = result.facialTransformationMatrixes?.length;
  status.textContent = tracked ? '' : 'no face detected';
  status.style.color = tracked ? '' : '#f44';

  threeRenderer.setRenderTarget(noiseRenderTarget ?? null);
  threeRenderer.render(threeScene, threeCamera);

  threeRenderer.setRenderTarget(pbrRenderTarget ?? null);
  threeRenderer.render(pbrScene, threeCamera);

  threeRenderer.setRenderTarget(null);
  threeRenderer.render(blitScene, blitCamera);
}

async function init(): Promise<void> {
  status = document.getElementById('status')!;
  video = document.getElementById('webcam') as HTMLVideoElement;

  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  threeScene = new THREE.Scene();
  pbrScene = new THREE.Scene();
  pbrScene.background = new THREE.Color(0x000000);
  threeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  threeRenderer.setSize(window.innerWidth, window.innerHeight);

  blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  blitScene = new THREE.Scene();

  blitMaterial = new THREE.ShaderMaterial({
    uniforms: {
      noiseTexture: { value: null },
      pbrTexture: { value: null },
      grayscalePbrNoiseBlend: { value: 0 },
      pbrColorBlend: { value: 0 },
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
      uniform float grayscalePbrNoiseBlend;
      uniform float pbrColorBlend;
      varying vec2 vUv;
      void main() {
        vec3 noise = texture2D(noiseTexture, vUv).rgb;
        vec3 pbr = texture2D(pbrTexture, vUv).rgb;
        float pbrHsvValue = max(pbr.r, max(pbr.g, pbr.b));
        vec3 grayscalePbrNoiseMix = mix(noise, vec3(pbrHsvValue), grayscalePbrNoiseBlend);
        vec3 finalColor = mix(grayscalePbrNoiseMix, pbr, pbrColorBlend);
        gl_FragColor = vec4(finalColor, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  const blitPlane = new THREE.PlaneGeometry(2, 2);
  blitScene.add(new THREE.Mesh(blitPlane, blitMaterial));

  threeCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 100);
  threeCamera.position.set(0, 0, 0);
  threeCamera.up.set(0, 1, 0);
  threeCamera.lookAt(-1, 0, 0);

  function setResolution(scale: number): void {
    const width: number = Math.max(1, Math.round(window.innerWidth * scale));
    const height: number = Math.max(1, Math.round(window.innerHeight * scale));

    noiseRenderTarget?.dispose();
    pbrRenderTarget?.dispose();

    const targetOptions = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    noiseRenderTarget = new THREE.WebGLRenderTarget(width, height, targetOptions);
    pbrRenderTarget = new THREE.WebGLRenderTarget(width, height, targetOptions);

    blitMaterial.uniforms.noiseTexture.value = noiseRenderTarget.texture;
    blitMaterial.uniforms.pbrTexture.value = pbrRenderTarget.texture;

    threeCamera.aspect = width / height;
    threeCamera.updateProjectionMatrix();
  }

  setResolution(resolutionScale);

  window.addEventListener('resize', () => {
    threeRenderer.setSize(window.innerWidth, window.innerHeight);
    setResolution(resolutionScale);
  });

  document.getElementById('slider-bpm')!.addEventListener('input', (e: Event) => {
    const bpm = parseInt((e.target as HTMLInputElement).value);
    document.getElementById('bpm-label')!.textContent = String(bpm);
    sceneController.setBPM(bpm);
  });

  document.getElementById('slider-res')!.addEventListener('input', (e: Event) => {
    const input = e.target as HTMLInputElement;
    resolutionScale = parseInt(input.value) / 100;
    document.getElementById('res-label')!.textContent = input.value + '%';
    setResolution(resolutionScale);
  });

  const muteButton = document.getElementById('btn-mute') as HTMLButtonElement;
  muteButton.addEventListener('click', () => {
    const muted = muteButton.textContent !== 'unmute';
    sceneController.setMuted(muted);
    muteButton.textContent = muted ? 'unmute' : 'mute';
  });

  const modeButton = document.getElementById('btn-mode') as HTMLButtonElement;
  modeButton.textContent = 'restart';
  modeButton.addEventListener('click', () => {
    sceneController.startNewRound();
  });

  status.textContent = 'Requesting camera…';
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
  await new Promise<void>(resolve => video.addEventListener('loadeddata', () => resolve()));

  status.textContent = 'Loading face model…';
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
  });

  setUpDefault();

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
  threeScene.add(bgMesh);

  status.textContent = 'Loading audio…';
  const { noisePlayer, drumPlayer } = await initAudio();
  sceneController = new SceneController();
  sceneController.setAudioPlayers(noisePlayer, drumPlayer);

  status.textContent = 'Loading shaders…';
  const [vertexSource, fragmentSource] = await Promise.all([
    fetch('./export-shader/vertex.glsl').then(response => response.text()),
    fetch('./export-shader/fragment.glsl').then(response => response.text()),
  ]);

  const geometry = new TeapotGeometry(0.65);
  sceneMesh = buildMesh(vertexSource, fragmentSource, geometry);
  sceneMesh.position.set(-2, 0, 0);
  threeScene.add(sceneMesh);

  pbrMesh = new THREE.Mesh(geometry, new THREE.MeshNormalMaterial());
  pbrMesh.position.set(-2, 0, 0);
  pbrScene.add(pbrMesh);

  status.textContent = 'Running';
  requestAnimationFrame(loop);
}

init().catch(err => {
  document.getElementById('status')!.textContent = 'Error: ' + (err as Error).message;
  console.error(err);
});
