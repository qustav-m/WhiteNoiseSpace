import * as THREE from 'three';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { calculateViewer, setUpDefault } from './viewer';
import { ModeController } from './modes/modeController';
import { RenderPipeline } from './renderPipeline';
import { SceneLoader } from './sceneLoader';
import { initAudio } from './audioEngine/audio';
import { initEnvironmentMap } from './environmentMap';

const WASM_PATH: string = './wasm';
const MODEL_PATH: string = './models/face_landmarker.task';

let status!: HTMLElement;
let video!: HTMLVideoElement;
let landmarker!: FaceLandmarker;
let modeController!: ModeController;
let renderPipeline!: RenderPipeline;
let sceneLoader!: SceneLoader;
let debugMode: boolean = false;
let uiHidden: boolean = false;

function makeResolutionInputs(widthId: string, heightId: string, apply: (w: number, h: number) => void): void {
  const widthInput = document.getElementById(widthId) as HTMLInputElement;
  const heightInput = document.getElementById(heightId) as HTMLInputElement;
  widthInput.value = String(window.innerWidth);
  heightInput.value = String(window.innerHeight);
  const onChange = () => apply(parseInt(widthInput.value) || window.innerWidth, parseInt(heightInput.value) || window.innerHeight);
  widthInput.addEventListener('change', onChange);
  heightInput.addEventListener('change', onChange);
}

function hideUi(hidden: boolean): void {
  uiHidden = hidden;
  const ui = document.getElementById('ui')!;
  ui.style.display = hidden ? 'none' : '';
}

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
  status.textContent = tracked || uiHidden ? '' : 'no face detected';
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

  status.textContent = 'Loading audio and environment…';
  const [{ noisePlayer, drumPlayer }] = await Promise.all([
    initAudio(),
    initEnvironmentMap(),
  ]);
  modeController = new ModeController();
  modeController.setAudioPlayers(noisePlayer, drumPlayer);

  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  renderPipeline = new RenderPipeline(canvas);

  status.textContent = 'Loading models…';
  sceneLoader = new SceneLoader();
  await sceneLoader.firstReady;
  renderPipeline.setResolution(1.0);
  modeController.initialize(renderPipeline, sceneLoader);

  window.addEventListener('resize', () => renderPipeline.handleResize(1.0));

  document.getElementById('slider-bpm')!.addEventListener('input', (e: Event) => {
    const bpm = parseInt((e.target as HTMLInputElement).value);
    document.getElementById('bpm-label')!.textContent = String(bpm);
    modeController.setBPM(bpm);
  });

  makeResolutionInputs('input-noise-w', 'input-noise-h', (w, h) => renderPipeline.setNoiseResolution(w, h));
  makeResolutionInputs('input-pbr-w', 'input-pbr-h', (w, h) => renderPipeline.setPbrResolution(w, h));
  makeResolutionInputs('input-grid-w', 'input-grid-h', (w, h) => renderPipeline.setCompositeGridResolution(w, h));

  document.getElementById('btn-copy-noise-to-grid')!.addEventListener('click', () => {
    const gridW = document.getElementById('input-grid-w') as HTMLInputElement;
    const gridH = document.getElementById('input-grid-h') as HTMLInputElement;
    gridW.value = (document.getElementById('input-noise-w') as HTMLInputElement).value;
    gridH.value = (document.getElementById('input-noise-h') as HTMLInputElement).value;
    gridW.dispatchEvent(new Event('change'));
  });

  const muteButton = document.getElementById('btn-mute') as HTMLButtonElement;
  muteButton.addEventListener('click', () => {
    const muted = muteButton.textContent !== 'unmute';
    modeController.setMuted(muted);
    muteButton.textContent = muted ? 'unmute' : 'mute';
  });


  document.addEventListener('keydown', e => {
    if (e.key === 'd') {
      debugMode = !debugMode;
      if (!debugMode) modeController.initialize(renderPipeline, sceneLoader);
      status.textContent = debugMode ? 'debug' : 'Running';
    }
    if (e.key === 'n' && debugMode && sceneLoader.isNextReady) {
      const removedModel = renderPipeline.switchToModel(sceneLoader.getNext());
      sceneLoader.dispose(removedModel);
    }
    if (e.key === 'i') hideUi(!uiHidden);
  });

  status.textContent = 'Running';
  requestAnimationFrame(loop);
}

init().catch(err => {
  document.getElementById('status')!.textContent = 'Error: ' + (err as Error).message;
  console.error(err);
});
