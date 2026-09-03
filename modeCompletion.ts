import * as THREE from 'three';
import { AnimationMode } from './mode';
import { ViewerState, SceneState, FrameState } from './frameState';

function interpolationCurve(t: number): number {
  return Math.min(t * 2, 1);
}

const targetRotation: THREE.Quaternion = new THREE.Quaternion(); // identity = upright, facing camera

const targetCameraX: number = 2.0;
const noiseGainScale: number = 500; // radians/ms → gain [0, 1]

export class CompletionMode extends AnimationMode {
  private readonly activeDuration: number = 3000; // ms for animated phase

  private readonly startRotation: THREE.Quaternion;
  private readonly startCameraX: number;
  private readonly startTime: number;
  private lastFrameRotation: THREE.Quaternion | null = null;
  private lastFrameTime: number = -1;

  constructor(startRotation: THREE.Quaternion, startCameraX: number, now: number) {
    super();
    this.startRotation = startRotation.clone();
    this.startCameraX = startCameraX;
    this.startTime = now;
  }

  computeFrame(_viewerState: ViewerState, _sceneState: SceneState, now: number): FrameState {
    const timeSinceStart: number = now - this.startTime;
    const t: number = Math.min(timeSinceStart / this.activeDuration, 1.0);
    const curve: number = interpolationCurve(t);

    const rotation: THREE.Quaternion = this.startRotation.clone().slerp(targetRotation, curve);
    const cameraX: number = THREE.MathUtils.lerp(this.startCameraX, targetCameraX, curve);

    let noiseGain: number = 0;
    if (this.lastFrameRotation !== null && this.lastFrameTime > 0) {
      const dt: number = now - this.lastFrameTime;
      if (dt > 0) {
        const delta = this.lastFrameRotation.clone().invert().multiply(rotation);
        const angle: number = 2 * Math.acos(Math.min(Math.abs(delta.w), 1));
        noiseGain = Math.min((angle / dt) * noiseGainScale, 1);
      }
    }
    this.lastFrameRotation = rotation.clone();
    this.lastFrameTime = now;

    const modeChange = timeSinceStart >= this.activeDuration
      ? 'startCaptureHoldMode' as const
      : null;

    return {
      cameraX,
      rotation,
      pbrColorBlend: curve,
      captureBlend: 0,
      grayscalePbrNoiseBlend: 1,
      noiseGain,
      fireBeat: false,
      modeChange,
    };
  }
}
