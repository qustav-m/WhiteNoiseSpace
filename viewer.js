import * as THREE from './node_modules/three/build/three.module.js';
import { Vector2, Vector3 } from './node_modules/three/build/three.module.js';

// World space: x = toward viewer (depth), y = up, z = right
// Screen is fixed at origin, screen normal = +x

export let screenSize;
export let cameraPosition;
export let cameraForward;
export let cameraUp;

export function setUpDefault() {
  // MacBook Pro 14" M3
  screenSize     = new Vector2(30.5, 19.5);               // cm, active display area
  cameraPosition = new Vector3(0, screenSize.y / 2, 0);  // cm — top center of screen
  cameraForward  = new Vector3(1, 0, 0);                  // camera faces viewer (+x)
  cameraUp       = new Vector3(0, 1, 0);
}

export function setUpHome() {
  screenSize     = new Vector2(62, 34);
  cameraPosition = new Vector3(23, 8, 65);
  cameraForward  = new Vector3(1, 0, -1).normalize();
  cameraUp       = new Vector3(0, 1, 0);
}

export const viewerPosition = new Vector3();
export const viewerForward  = new Vector3();
export const viewerUp       = new Vector3();
export let   viewerDistance = 0;
export let   faceDetected   = false;

export function calculateViewer(result) {
  faceDetected = !!result.facialTransformationMatrixes?.length;
  if (!faceDetected) return;

  const m = new THREE.Matrix4().fromArray(result.facialTransformationMatrixes[0].data);

  const posCamera = new Vector3().setFromMatrixPosition(m);
  posCamera.z *= -1;

  viewerPosition.copy(transformToWorld(posCamera, cameraForward, cameraUp, cameraPosition));
  viewerDistance = viewerPosition.length();
  viewerForward.copy(viewerPosition.clone().negate().normalize());
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), viewerForward).normalize();
  viewerUp.copy(new Vector3().crossVectors(viewerForward, right).normalize());
}

function transformToWorld(vector, forward, up, worldOrigin = new Vector3()) {
  const right  = new Vector3().crossVectors(forward, up).normalize();
  const matrix = new THREE.Matrix4().makeBasis(right, up, forward);
  return vector.clone().applyMatrix4(matrix).add(worldOrigin);
}
