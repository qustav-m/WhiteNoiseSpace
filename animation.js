import * as THREE from './node_modules/three/build/three.module.js';
import { viewerPosition, viewerForward, viewerUp, viewerDistance, faceDetected } from './viewer.js';
import { onBeat as audioOnBeat } from './audio.js';

// ── Config ────────────────────────────────────────────────────────────────────
export const BPM          = 60;
export const beatInterval = 60000 / BPM; // ms

const fadeEnd       = 0.9;
const rotationScale = 0.05;  // radians per cm of head delta
const cmPerUnit     = 10.0;
const maxCamDist    = 10.0;

// ── Mode ──────────────────────────────────────────────────────────────────────
let mode = 'continuous'; // 'direct' | 'continuous'
export function setMode(m) { mode = m; }
export let currentAlpha = 0;
export let currentSpeed = 0; // cm/ms

/** @type {THREE.Vector3|null} */
let speedLastPos  = null;
let speedLastTime = -1;

// ── Update (call once per frame) ──────────────────────────────────────────────
export function update(camera, mesh, now) {
  if (faceDetected) {
    if (speedLastPos !== null && speedLastTime > 0) {
      const dt = now - speedLastTime;
      currentSpeed = dt > 0 ? viewerPosition.distanceTo(speedLastPos) / dt : currentSpeed;
    }
    speedLastPos  = viewerPosition.clone();
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

function updateDirect(camera, mesh) {
  currentAlpha = 1;
  camera.position.x = Math.max(0, maxCamDist - viewerDistance / cmPerUnit);

  if (viewerForward.lengthSq() > 0) {
    const forward = viewerForward.clone().normalize();
    const up      = viewerUp.clone().normalize();
    const right   = new THREE.Vector3().crossVectors(up, forward).normalize();
    mesh.setRotationFromMatrix(new THREE.Matrix4().makeBasis(right, up, forward));
  }
}

// ── Continuous ────────────────────────────────────────────────────────────────
// Per-frame rotation weighted by (1 - progressCurve): full weight just after beat,
// zero weight at fadeEnd — movement during the rest phase has no effect.
/** @type {THREE.Vector3|null} */
let contViewerPosLastFrame = null;
let contLastBeatTime       = -1;
let contStartCamX          = 0;
let contTargetCamX         = 0;

// swappable decay curve: maps cycleT [0,1] → alpha [0,1], fast start, holds at 1
function progressCurve(t) {
  if (t >= fadeEnd) return 1.0;
  const s = t / fadeEnd;
  return 1 - (1 - s) * (1 - s); // ease-out quadratic
}

function updateContinuous(camera, mesh, now) {
  if (contLastBeatTime < 0) {
    contLastBeatTime = now;
    contTargetCamX   = Math.max(0, maxCamDist - viewerDistance / cmPerUnit);
    contStartCamX    = contTargetCamX;
  }

  const cycleT = (now - contLastBeatTime) / beatInterval;

  if (cycleT >= 1) {
    contLastBeatTime = now;
    contStartCamX    = camera.position.x;
    contTargetCamX   = Math.max(0, maxCamDist - viewerDistance / cmPerUnit);
    audioOnBeat();
  }

  const alpha = progressCurve(Math.min(cycleT, 1.0));
  currentAlpha = alpha;
  camera.position.x = contStartCamX + (contTargetCamX - contStartCamX) * alpha;

  // weight: 1 at beat start → 0 at fadeEnd → 0 for rest of cycle
  const weight = 1 - alpha;

  if (faceDetected && contViewerPosLastFrame !== null && weight > 0) {
    const continuousRotationScale = rotationScale * 3;
    const delta     = viewerPosition.clone().sub(contViewerPosLastFrame);
    const deltaQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, -delta.z * continuousRotationScale, delta.y * continuousRotationScale, 'XYZ')
    );
    mesh.quaternion.premultiply(new THREE.Quaternion().slerp(deltaQuat, weight));
  }

  contViewerPosLastFrame = faceDetected ? viewerPosition.clone() : null;
}
