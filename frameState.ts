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
  pbrColorBlend: number;          // 0 = PBR HSV-value, 1 = full color PBR
  captureBlend: number;           // 0 = use live PBR pipeline, 1 = use frozen capture
  grayscalePbrNoiseBlend: number; // 0 = noise only, 1 = PBR/capture
  noiseGain: number;
  fireBeat: boolean;
  modeChange: 'startCompletionMode' | 'startCaptureHoldMode' | 'startTransitionMode' | 'startGamingMode' | null;
}
