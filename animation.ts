import * as THREE from 'three';
import { viewerPosition, viewerForward, viewerUp, viewerDistance, faceDetected } from './viewer';
import { onBeat as audioOnBeat } from './audio';
// ── BPM ────────────────────────────────────────────────────────────────────
export let BPM: number = 30;
export let beatInterval: number = 60000 / BPM; // ms
export function setBPM(bpm: number): void {
  BPM = bpm;
  beatInterval = 60000 / bpm;
}
// ── Config ────────────────────────────────────────────────────────────────────
const fadeEnd: number = 0.5;
const rotationScale: number = 0.15; // radians per cm of head delta
const cmPerUnit: number = 10.0;
const minCamDist: number = 0.0; // camera x in scene units (object is at x = -2)
const maxCamDist: number = 10.0; // camera x in scene units (= 100cm from origin)

// ── Mode ──────────────────────────────────────────────────────────────────────
type Mode = 'direct' | 'continuous';
let mode: Mode = 'continuous';
export function setMode(m: Mode): void { mode = m; }
export let currentAlpha: number = 0;
export let currentSpeed: number = 0; // cm/ms

let speedLastPosition: THREE.Vector3 | null = null;
let speedLastTime: number = -1;

// ── Update (call once per frame) ──────────────────────────────────────────────
export function update(camera: THREE.PerspectiveCamera, mesh: THREE.Mesh, now: number): void {
  if (faceDetected) {
    if (speedLastPosition !== null && speedLastTime > 0) {
      const deltaTime: number = now - speedLastTime;
      currentSpeed = deltaTime > 0 ? viewerPosition.distanceTo(speedLastPosition) / deltaTime : currentSpeed;
    }
    speedLastPosition = viewerPosition.clone();
    speedLastTime = now;
  } else {
    currentSpeed = 0;
    speedLastPosition = null;
  }

  if (mode === 'direct') {
    updateDirect(camera, mesh);
  } else {
    updateContinuous(camera, mesh, now);
  }
}

function updateDirect(camera: THREE.PerspectiveCamera, mesh: THREE.Mesh): void {
  currentAlpha = 0;
  camera.position.x = THREE.MathUtils.clamp(maxCamDist - viewerDistance / cmPerUnit, minCamDist, maxCamDist);

  if (viewerForward.lengthSq() > 0) {
    const forward = viewerForward.clone().normalize();
    const up = viewerUp.clone().normalize();
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    mesh.setRotationFromMatrix(new THREE.Matrix4().makeBasis(right, up, forward));
  }
}

// ── Continuous ────────────────────────────────────────────────────────────────
// Per-frame rotation weighted by progressCurve: full weight just after beat,
// zero weight at fadeEnd — movement during the rest phase has no effect.
let contViewerPositionLastFrame: THREE.Vector3 | null = null;
let contViewerDistanceLastFrame: number | null = null;
let contLastBeatTime: number = -1;


// input: normalizedTime in [0, 1] (0 = beat start, 1 = beat end) → output: weight in [1, 0] (1 at beat start, 0 at fadeEnd)
function progressCurve(normalizedTime: number): number {
  if (normalizedTime >= fadeEnd) return 0.0;
  const progress: number = normalizedTime / fadeEnd;
  return 1 - progress * progress;
}

function updateContinuous(camera: THREE.PerspectiveCamera, mesh: THREE.Mesh, now: number): void {
  if (contLastBeatTime < 0) contLastBeatTime = now;

  const cycleTimeFraction: number = (now - contLastBeatTime) / beatInterval;

  if (cycleTimeFraction >= 1) {
    contLastBeatTime = now;
    contViewerDistanceLastFrame = null;
    audioOnBeat();
  }

  const alpha: number = progressCurve(Math.min(cycleTimeFraction, 1.0));
  currentAlpha = alpha;

  if (faceDetected && alpha > 0) {
    if (contViewerDistanceLastFrame !== null) {
      const deltaDistance: number = viewerDistance - contViewerDistanceLastFrame;
      const newCameraX: number = camera.position.x - (deltaDistance / cmPerUnit) * alpha;
      camera.position.x = THREE.MathUtils.clamp(newCameraX, minCamDist, maxCamDist);
    }
    contViewerDistanceLastFrame = viewerDistance;

    if (contViewerPositionLastFrame !== null) {
      const delta = viewerPosition.clone().sub(contViewerPositionLastFrame);
      const deltaQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, -delta.z * rotationScale, delta.y * rotationScale, 'XYZ')
      );
      mesh.quaternion.premultiply(new THREE.Quaternion().slerp(deltaQuat, alpha));
    }
  } else {
    contViewerDistanceLastFrame = null;
  }

  contViewerPositionLastFrame = faceDetected ? viewerPosition.clone() : null;
}
