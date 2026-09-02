import * as THREE from 'three';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { calculateViewer, setUpDefault } from './viewer';
import { ModeController } from './modeController';
import { RenderPipeline, SceneSetup } from './renderPipeline';
import { resolveSceneConfig } from './sceneConfig';
import { initAudio } from './audio';

const WASM_PATH: string = './node_modules/@mediapipe/tasks-vision/wasm';
const MODEL_PATH: string = './models/face_landmarker.task';

async function loadSceneGeometries(): Promise<SceneSetup[]> {
  const glbEntries = Object.entries(
    import.meta.glob('./scenes/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>
  );
  const loader = new GLTFLoader();
  return Promise.all(glbEntries.map(async ([path, url]) => {
    const filename = path.split('/').pop()!;
    const gltf = await loader.loadAsync(url);
    let geometry: THREE.BufferGeometry | null = null;
    gltf.scene.traverse(child => {
      if (!geometry && (child as THREE.Mesh).isMesh) {
        geometry = (child as THREE.Mesh).geometry;
      }
    });
    if (!geometry) throw new Error(`No mesh found in ${url}`);
    return { geometry: geometry as THREE.BufferGeometry, ...resolveSceneConfig(filename) };
  }));
}

let status!: HTMLElement;
let video!: HTMLVideoElement;
let landmarker!: FaceLandmarker;
let modeController!: ModeController;
let renderPipeline!: RenderPipeline;
let resolutionScale: number = 1.0;
let debugMode: boolean = false;

function loop(): void {
  requestAnimationFrame(loop);

  if (debugMode) {
    renderPipeline.camera.position.set(0, 0, 0);
    renderPipeline.sceneAnchor.quaternion.identity();
    renderPipeline.setBlends(1, 1, 0);
    renderPipeline.render();
    return;
  }

  const now = Date.now();
  const result = landmarker.detectForVideo(video, now);
  calculateViewer(result);
  modeController.update(now);
  renderPipeline.render();

  const tracked = result.facialTransformationMatrixes?.length;
  status.textContent = tracked ? '' : 'no face detected';
  status.style.color = tracked ? '' : '#f44';
}

async function init(): Promise<void> {
  status = document.getElementById('status')!;
  video = document.getElementById('webcam') as HTMLVideoElement;

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

  status.textContent = 'Loading audio…';
  const { noisePlayer, drumPlayer } = await initAudio();
  modeController = new ModeController();
  modeController.setAudioPlayers(noisePlayer, drumPlayer);

  status.textContent = 'Loading shaders…';
  const [vertexSource, fragmentSource] = await Promise.all([
    fetch('./export-shader/vertex.glsl').then(r => r.text()),
    fetch('./export-shader/fragment.glsl').then(r => r.text()),
  ]);

  status.textContent = 'Loading models…';
  const geometries = await loadSceneGeometries();

  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  renderPipeline = new RenderPipeline(canvas, vertexSource, fragmentSource, geometries);
  renderPipeline.setResolution(resolutionScale);
  modeController.initialize(renderPipeline);

  window.addEventListener('resize', () => renderPipeline.handleResize(resolutionScale));

  document.getElementById('slider-bpm')!.addEventListener('input', (e: Event) => {
    const bpm = parseInt((e.target as HTMLInputElement).value);
    document.getElementById('bpm-label')!.textContent = String(bpm);
    modeController.setBPM(bpm);
  });

  document.getElementById('slider-res')!.addEventListener('input', (e: Event) => {
    const input = e.target as HTMLInputElement;
    resolutionScale = parseInt(input.value) / 100;
    document.getElementById('res-label')!.textContent = input.value + '%';
    renderPipeline.setResolution(resolutionScale);
  });

  const muteButton = document.getElementById('btn-mute') as HTMLButtonElement;
  muteButton.addEventListener('click', () => {
    const muted = muteButton.textContent !== 'unmute';
    modeController.setMuted(muted);
    muteButton.textContent = muted ? 'unmute' : 'mute';
  });

  const modeButton = document.getElementById('btn-mode') as HTMLButtonElement;
  modeButton.textContent = 'restart';
  modeButton.addEventListener('click', () => modeController.initialize(renderPipeline));

  document.addEventListener('keydown', e => {
    if (e.key === 'd') {
      debugMode = !debugMode;
      if (!debugMode) modeController.initialize(renderPipeline);
      status.textContent = debugMode ? 'debug' : 'Running';
    }
    if (e.key === 'n' && debugMode) renderPipeline.switchToNextScene();
  });

  status.textContent = 'Running';
  requestAnimationFrame(loop);
}

init().catch(err => {
  document.getElementById('status')!.textContent = 'Error: ' + (err as Error).message;
  console.error(err);
});
