import * as THREE from 'three';
import { AnimationMode } from './mode';
import { ViewerState, SceneState, FrameState } from './frameState';

export class HiddenMode extends AnimationMode {
  private beatInterval: number = 60000 / 30; // ms per beat at 30 BPM

  private readonly fadeEnd: number = 0.5;
  private readonly rotationScale: number = 0.15; // radians per cm of head delta
  private readonly cmPerUnit: number = 10.0;
  private readonly minCameraX: number = 0.0;
  private readonly maxCameraX: number = 10.0;

  private lastBeatTime: number = -1;
  private viewerPositionLastFrame: THREE.Vector3 | null = null;
  private viewerDistanceLastFrame: number | null = null;

  setBPM(bpm: number): void {
    this.beatInterval = 60000 / bpm;
  }

  // input: normalizedTime in [0, 1] (0 = beat start, 1 = beat end) → output: weight in [1, 0]
  private progressCurve(normalizedTime: number): number {
    if (normalizedTime >= this.fadeEnd) return 0.0;
    const progress: number = normalizedTime / this.fadeEnd;
    return 1 - progress * progress;
  }

  computeFrame(viewerState: ViewerState, sceneState: SceneState, now: number): FrameState {
    if (this.lastBeatTime < 0) this.lastBeatTime = now;

    const cycleTimeFraction: number = (now - this.lastBeatTime) / this.beatInterval;
    let fireBeat: boolean = false;
    if (cycleTimeFraction >= 1) {
      this.lastBeatTime = now;
      this.viewerDistanceLastFrame = null;
      fireBeat = true;
    }

    const alpha: number = this.progressCurve(Math.min(cycleTimeFraction, 1.0));

    let cameraX: number = sceneState.cameraX;
    if (viewerState.faceDetected && alpha > 0) {
      if (this.viewerDistanceLastFrame !== null) {
        const deltaDistance: number = viewerState.distance - this.viewerDistanceLastFrame;
        const newCameraX: number = cameraX - (deltaDistance / this.cmPerUnit) * alpha;
        cameraX = THREE.MathUtils.clamp(newCameraX, this.minCameraX, this.maxCameraX);
      }
      this.viewerDistanceLastFrame = viewerState.distance;

      if (this.viewerPositionLastFrame !== null) {
        const delta = viewerState.position.clone().sub(this.viewerPositionLastFrame);
        const deltaQuat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, -delta.z * this.rotationScale, delta.y * this.rotationScale, 'XYZ')
        );
        sceneState.rotation.premultiply(new THREE.Quaternion().slerp(deltaQuat, alpha));
      }
    } else {
      this.viewerDistanceLastFrame = null;
    }

    this.viewerPositionLastFrame = viewerState.faceDetected ? viewerState.position.clone() : null;

    const noiseGain: number = alpha * viewerState.speedFactor;

    return { cameraX, rotation: sceneState.rotation, blendFactor: 0, noiseGain, fireBeat };
  }
}
