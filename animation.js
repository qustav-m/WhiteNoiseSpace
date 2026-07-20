import * as THREE from './node_modules/three/build/three.module.js';
import { viewerPosition, viewerForward, viewerUp, viewerDistance, faceDetected } from './viewer.js';
import { onBeat as audioOnBeat } from './audio.js';

// ── Config ────────────────────────────────────────────────────────────────────
export const BPM          = 60;
export const beatInterval = 60000 / BPM; // ms

const fadeEnd       = 0.9;         // fraction of cycle where motion completes
const rotationScale = 0.05;  // radians per cm of head delta
const cmPerUnit     = 10.0;
const maxCamDist    = 10.0;        // camera at x=0 when viewer is maxCamDist units away

// ── Mode ──────────────────────────────────────────────────────────────────────
let mode = 'continuous'; // 'direct' | 'beat' | 'continuous'
export function setMode(m) { mode = m; }
export let currentAlpha = 0;


// ── Update (call once per frame) ──────────────────────────────────────────────
export function update(camera, mesh, now) {
  if (mode === 'direct') {
    updateDirect(camera, mesh);
  } else if (mode === 'beat') {
    updateBeat(camera, mesh, now);
  } else if (mode === 'continuous') {
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

// ── Beat ──────────────────────────────────────────────────────────────────────
const startRotation  = new THREE.Quaternion();
const targetRotation = new THREE.Quaternion();
let startCamX            = 0;
let targetCamX           = 0;
let lastBeatTime         = -1;
/** @type {THREE.Vector3|null} */
let viewerPosAtLastBeat  = null;
/** @type {THREE.Vector3|null} most recent position seen this cycle, null if none */
let viewerPosThisCycle   = null;
let faceSeenThisCycle    = false;

// swappable decay curve: maps cycleT [0,1] → alpha [0,1], fast start, holds at 1
function progressCurve(t) {
  if (t >= fadeEnd) return 1.0;
  const s = t / fadeEnd;
  return 1 - (1 - s) * (1 - s); // ease-out quadratic
}

function onBeat(mesh, camera) {
  audioOnBeat();
  // compute rotation impulse from head movement since last beat
  if (faceSeenThisCycle && viewerPosAtLastBeat !== null && viewerPosThisCycle !== null) {
    // delta.z = horizontal head movement → yaw; delta.y = vertical → pitch
    const delta     = viewerPosThisCycle.clone().sub(viewerPosAtLastBeat);
    const deltaQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, -delta.z * rotationScale, delta.y * rotationScale, 'XYZ')
    );
    // apply impulse in world space (left-multiply)
    targetRotation.multiplyQuaternions(deltaQuat, mesh.quaternion);
  } else {
    // no face or first beat — no impulse, hold current rotation
    targetRotation.copy(mesh.quaternion);
  }

  // snapshot start values; updateBeat will lerp toward targets this cycle
  startRotation.copy(mesh.quaternion);
  startCamX  = camera.position.x;
  targetCamX = Math.max(0, maxCamDist - viewerDistance / cmPerUnit);

  // store face position for next beat's delta; null if face absent this cycle
  viewerPosAtLastBeat = viewerPosThisCycle;
  viewerPosThisCycle  = null;
  faceSeenThisCycle   = false;
}

function updateBeat(camera, mesh, now) {
  // track face position seen this cycle
  if (faceDetected) {
    faceSeenThisCycle  = true;
    viewerPosThisCycle = viewerPosition.clone();
  }

  // first-frame init: treat current moment as a beat so state is valid immediately
  if (lastBeatTime < 0) {
    lastBeatTime = now;
    startRotation.copy(mesh.quaternion);
    targetRotation.copy(mesh.quaternion);
    targetCamX = Math.max(0, maxCamDist - viewerDistance / cmPerUnit);
    startCamX  = targetCamX;
  }

  // cycleT: goes from 0 to 1 during cycle
  const cycleT = (now - lastBeatTime) / beatInterval;

  if (cycleT >= 1) {
    lastBeatTime = now;
    onBeat(mesh, camera); // snapshot start, compute new target
  }

  // progressCurve maps cycleT → alpha [0,1]: fast start, decelerates, holds at 1
  const alpha = progressCurve(Math.min(cycleT, 1.0));
  currentAlpha = alpha;
  mesh.quaternion.slerpQuaternions(startRotation, targetRotation, alpha);
  camera.position.x = startCamX + (targetCamX - startCamX) * alpha;
}

// ── Continuous ────────────────────────────────────────────────────────────────
// Per-frame rotation weighted by (1 - progressCurve): full weight just after beat,
// zero weight at fadeEnd — movement during the rest phase has no effect.
// Camera X is direct (no lerp).
/** @type {THREE.Vector3|null} */
let contViewerPosLastFrame = null;
let contLastBeatTime       = -1;
let contStartCamX          = 0;
let contTargetCamX         = 0;

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
    // partially apply delta rotation scaled by weight
    mesh.quaternion.premultiply(new THREE.Quaternion().slerp(deltaQuat, weight));
  }

  contViewerPosLastFrame = faceDetected ? viewerPosition.clone() : null;
}
