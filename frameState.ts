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
  grayscalePbrNoiseBlend: number; // 0 = noise only, 1 = PBR HSV-value only
  pbrColorBlend: number;          // 0 = PBR HSV-value, 1 = full color PBR
  noiseGain: number;
  fireBeat: boolean;
  transition: 'startCompletionMode' | 'startNewRound' | null;
}
