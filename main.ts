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
let normalScene!: THREE.Scene;
let threeCamera!: THREE.PerspectiveCamera;
let sceneMesh!: THREE.Mesh;
let normalMesh!: THREE.Mesh;
let noiseRenderTarget: THREE.WebGLRenderTarget | undefined;
let normalRenderTarget: THREE.WebGLRenderTarget | undefined;
let blitScene!: THREE.Scene;
let blitCamera!: THREE.OrthographicCamera;
let noiseBlitMaterial!: THREE.MeshBasicMaterial;
let normalsBlitMaterial!: THREE.MeshBasicMaterial;
let resolutionScale: number = 1.0;
let sceneController!: SceneController;

function loop(): void {
  requestAnimationFrame(loop);

  const now = Date.now();
  const result = landmarker.detectForVideo(video, now);
  calculateViewer(result);
  sceneController.update(threeCamera, sceneMesh, now);

  normalMesh.quaternion.copy(sceneMesh.quaternion);
  normalsBlitMaterial.opacity = sceneController.blendFactor;

  const tracked = result.facialTransformationMatrixes?.length;
  status.textContent = tracked ? '' : 'no face detected';
  status.style.color = tracked ? '' : '#f44';

  threeRenderer.setRenderTarget(noiseRenderTarget ?? null);
  threeRenderer.render(threeScene, threeCamera);

  threeRenderer.setRenderTarget(normalRenderTarget ?? null);
  threeRenderer.render(normalScene, threeCamera);

  threeRenderer.setRenderTarget(null);
  threeRenderer.render(blitScene, blitCamera);
}

async function init(): Promise<void> {
  status = document.getElementById('status')!;
  video = document.getElementById('webcam') as HTMLVideoElement;

  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  threeScene = new THREE.Scene();
  normalScene = new THREE.Scene();
  normalScene.background = new THREE.Color(0x000000);
  threeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  threeRenderer.setSize(window.innerWidth, window.innerHeight);

  blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  blitScene = new THREE.Scene();

  noiseBlitMaterial = new THREE.MeshBasicMaterial();
  normalsBlitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });

  const blitPlane = new THREE.PlaneGeometry(2, 2);
  blitScene.add(new THREE.Mesh(blitPlane, noiseBlitMaterial));
  blitScene.add(new THREE.Mesh(blitPlane, normalsBlitMaterial));

  threeCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 100);
  threeCamera.position.set(0, 0, 0);
  threeCamera.up.set(0, 1, 0);
  threeCamera.lookAt(-1, 0, 0);

  function setResolution(scale: number): void {
    const width: number = Math.max(1, Math.round(window.innerWidth * scale));
    const height: number = Math.max(1, Math.round(window.innerHeight * scale));

    noiseRenderTarget?.dispose();
    normalRenderTarget?.dispose();

    const targetOptions = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    noiseRenderTarget = new THREE.WebGLRenderTarget(width, height, targetOptions);
    normalRenderTarget = new THREE.WebGLRenderTarget(width, height, targetOptions);

    noiseBlitMaterial.map = noiseRenderTarget.texture;
    noiseBlitMaterial.needsUpdate = true;
    normalsBlitMaterial.map = normalRenderTarget.texture;
    normalsBlitMaterial.needsUpdate = true;

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

  const modeButton = document.getElementById('btn-mode') as HTMLButtonElement;
  modeButton.addEventListener('click', () => {
    const now = Date.now();
    if (modeButton.textContent === 'reveal') {
      sceneController.startTransition(2000, now);
      modeButton.textContent = 'hide';
    } else {
      sceneController.setModeHidden();
      modeButton.textContent = 'reveal';
    }
  });

  const muteButton = document.getElementById('btn-mute') as HTMLButtonElement;
  muteButton.addEventListener('click', () => {
    const muted = muteButton.textContent === 'mute';
    sceneController.setMuted(muted);
    muteButton.textContent = muted ? 'unmute' : 'mute';
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

  // Swap geometry here: new THREE.BoxGeometry(1,1,1), new TeapotGeometry(1), etc.
  const geometry = new TeapotGeometry(0.65);
  sceneMesh = buildMesh(vertexSource, fragmentSource, geometry);
  sceneMesh.position.set(-2, 0, 0);
  threeScene.add(sceneMesh);

  normalMesh = new THREE.Mesh(geometry, new THREE.MeshNormalMaterial());
  normalMesh.position.set(-2, 0, 0);
  normalScene.add(normalMesh);

  status.textContent = 'Running';
  requestAnimationFrame(loop);
}

init().catch(err => {
  document.getElementById('status')!.textContent = 'Error: ' + (err as Error).message;
  console.error(err);
});
