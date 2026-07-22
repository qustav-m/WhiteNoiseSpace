import * as THREE from 'three';

export interface ViewerState {
  position: THREE.Vector3;
  forward: THREE.Vector3;
  up: THREE.Vector3;
  distance: number;
  faceDetected: boolean;
  speedFactor: number; // head movement speed clamped to [0, 1]
}

export interface SceneState {
  cameraX: number;
  rotation: THREE.Quaternion;
}

export interface FrameState {
  cameraX: number;
  rotation: THREE.Quaternion;
  blendFactor: number; // 0 = fully hidden (noise shader), 1 = fully revealed (PBR)
  noiseGain: number;
  fireBeat: boolean;
}
