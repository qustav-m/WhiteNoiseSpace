import * as THREE from 'three';
import { viewerPosition, viewerForward, viewerUp, viewerDistance, faceDetected } from './viewer';
import { onBeat as audioOnBeat } from './audio';

// ── Config ────────────────────────────────────────────────────────────────────
export const BPM: number = 30;
export const beatInterval: number = 60000 / BPM; // ms

const fadeEnd: number = 0.5;
const rotationScale: number = 0.15; // radians per cm of head delta
const cmPerUnit: number = 10.0;
const maxCamDist: number = 10.0;

// ── Mode ──────────────────────────────────────────────────────────────────────
type Mode = 'direct' | 'continuous';
let mode: Mode = 'continuous';
export function setMode(m: Mode): void { mode = m; }
export let currentAlpha: number = 0;
export let currentSpeed: number = 0; // cm/ms

let speedLastPos: THREE.Vector3 | null = null;
let speedLastTime: number = -1;

// ── Update (call once per frame) ──────────────────────────────────────────────
export function update(camera: THREE.PerspectiveCamera, mesh: THREE.Mesh, now: number): void {
  if (faceDetected) {
    if (speedLastPos !== null && speedLastTime > 0) {
      const dt: number = now - speedLastTime;
      currentSpeed = dt > 0 ? viewerPosition.distanceTo(speedLastPos) / dt : currentSpeed;
    }
    speedLastPos = viewerPosition.clone();
    speedLastTime = now;
  } else {
    currentSpeed = 0;
    speedLastPos = null;
  }

  if (mode === 'direct') {
    updateDirect(camera, mesh);
  } else {
    updateContinuous(camera, mesh, now);
  }
}

function updateDirect(camera: THREE.PerspectiveCamera, mesh: THREE.Mesh): void {
  currentAlpha = 1;
  camera.position.x = Math.max(0, maxCamDist - viewerDistance / cmPerUnit);

  if (viewerForward.lengthSq() > 0) {
    const forward = viewerForward.clone().normalize();
    const up = viewerUp.clone().normalize();
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    mesh.setRotationFromMatrix(new THREE.Matrix4().makeBasis(right, up, forward));
  }
}

// ── Continuous ────────────────────────────────────────────────────────────────
// Per-frame rotation weighted by (1 - progressCurve): full weight just after beat,
// zero weight at fadeEnd — movement during the rest phase has no effect.
let contViewerPosLastFrame: THREE.Vector3 | null = null;
let contLastBeatTime: number = -1;
let contStartCamX: number = 0;
let contTargetCamX: number = 0;


function progressCurve(t: number): number {
  if (t >= fadeEnd) return 1.0;
  const s: number = t / fadeEnd;
  return s * s; // ease-out quadratic
}
/*
// swappable decay curve: maps cycleT [0,1] → alpha [0,1], fast start, holds at 1
function progressCurve(t: number): number {
  if (t >= fadeEnd) return 1.0;
  const s: number = t / fadeEnd;
  return 1 - (1 - s) * (1 - s); // ease-out quadratic
}
*/

function updateContinuous(camera: THREE.PerspectiveCamera, mesh: THREE.Mesh, now: number): void {
  if (contLastBeatTime < 0) {
    contLastBeatTime = now;
    contTargetCamX = Math.max(0, maxCamDist - viewerDistance / cmPerUnit);
    contStartCamX = contTargetCamX;
  }

  const cycleT: number = (now - contLastBeatTime) / beatInterval;

  if (cycleT >= 1) {
    contLastBeatTime = now;
    contStartCamX = camera.position.x;
    contTargetCamX = Math.max(0, maxCamDist - viewerDistance / cmPerUnit);
    audioOnBeat();
  }

  const alpha: number = progressCurve(Math.min(cycleT, 1.0));
  currentAlpha = alpha;
  camera.position.x = contStartCamX + (contTargetCamX - contStartCamX) * alpha;

  // weight: 1 at beat start → 0 at fadeEnd → 0 for rest of cycle
  const weight: number = 1 - alpha;

  if (faceDetected && contViewerPosLastFrame !== null && weight > 0) {
    const delta = viewerPosition.clone().sub(contViewerPosLastFrame);
    const deltaQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, -delta.z * rotationScale, delta.y * rotationScale, 'XYZ')
    );
    mesh.quaternion.premultiply(new THREE.Quaternion().slerp(deltaQuat, weight));
  }

  contViewerPosLastFrame = faceDetected ? viewerPosition.clone() : null;
}
