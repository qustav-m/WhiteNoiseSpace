import * as THREE from 'three';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { calculateViewer, setUpDefault } from './viewer';
import { ModeController } from './modeController';
import { RenderPipeline } from './renderPipeline';
import { SceneLoader } from './sceneLoader';
import { initAudio } from './audio';

const WASM_PATH: string = './node_modules/@mediapipe/tasks-vision/wasm';
const MODEL_PATH: string = './models/face_landmarker.task';

let status!: HTMLElement;
let video!: HTMLVideoElement;
let landmarker!: FaceLandmarker;
let modeController!: ModeController;
let renderPipeline!: RenderPipeline;
let sceneLoader!: SceneLoader;
let resolutionScale: number = 1.0;
let debugMode: boolean = false;

function loop(): void {
  requestAnimationFrame(loop);

  if (debugMode) {
    renderPipeline.camera.position.set(0, 0, 0);
    renderPipeline.setModelRotation(new THREE.Quaternion());
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

  status.textContent = 'Loading models…';
  sceneLoader = new SceneLoader();
  await sceneLoader.firstReady;

  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  renderPipeline = new RenderPipeline(canvas);
  renderPipeline.setResolution(resolutionScale);
  modeController.initialize(renderPipeline, sceneLoader);

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
  modeButton.addEventListener('click', () => modeController.initialize(renderPipeline, sceneLoader));

  document.addEventListener('keydown', e => {
    if (e.key === 'd') {
      debugMode = !debugMode;
      if (!debugMode) modeController.initialize(renderPipeline, sceneLoader);
      status.textContent = debugMode ? 'debug' : 'Running';
    }
    if (e.key === 'n' && debugMode && sceneLoader.isNextReady) {
      renderPipeline.switchToModel(sceneLoader.getNext());
    }
  });

  status.textContent = 'Running';
  requestAnimationFrame(loop);
}

init().catch(err => {
  document.getElementById('status')!.textContent = 'Error: ' + (err as Error).message;
  console.error(err);
});
