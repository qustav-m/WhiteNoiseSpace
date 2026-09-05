import * as THREE from 'three';
import { AnimationMode } from './animationMode';
import { ViewerState, SceneState, FrameState } from './frameState';

export class GamingMode extends AnimationMode {
  private static readonly completionThresholdDeg: number = 10;

  private static interpolationCurve(t: number): number {
    return t**32;
  }

  private static blendFromAngle(angleDeg: number): number {
    let t = (angleDeg - GamingMode.completionThresholdDeg) / (180 - GamingMode.completionThresholdDeg);
    t = 1 - THREE.MathUtils.clamp(t, 0, 1);
    return GamingMode.interpolationCurve(t);
  }

  private readonly fadeEnd: number = 0.5;
  private readonly rotationScale: number = 0.15;
  private readonly cmPerUnit: number = 10.0;
  private readonly minCameraX: number = 0.0;
  private readonly maxCameraX: number = 10.0;

  private beatInterval: number = 60000 / 30;
  private lastBeatTime: number = -1;
  private viewerPositionLastFrame: THREE.Vector3 | null = null;
  private viewerDistanceLastFrame: number | null = null;

  setBPM(bpm: number): void {
    this.beatInterval = 60000 / bpm;
  }

  private movementWeightFromCycleTime(normalizedTime: number): number {
    if (normalizedTime >= this.fadeEnd) return 0.0;
    const progress: number = normalizedTime / this.fadeEnd;
    return 1 - progress * progress;
  }

  private beatCalculations(now: number): { fireBeat: boolean; alpha: number } {
    if (this.lastBeatTime < 0) this.lastBeatTime = now;
    const cycleTimeFraction: number = (now - this.lastBeatTime) / this.beatInterval;
    let fireBeat: boolean = false;
    if (cycleTimeFraction >= 1) {
      this.lastBeatTime = now;
      this.viewerDistanceLastFrame = null;
      fireBeat = true;
    }
    const alpha: number = this.movementWeightFromCycleTime(Math.min(cycleTimeFraction, 1.0));
    return { fireBeat, alpha };
  }

  private updateViewerAndSampleDeltas(viewerState: ViewerState): { positionDelta: THREE.Vector3 | null; distanceDelta: number | null } {
    let positionDelta: THREE.Vector3 | null = null;
    let distanceDelta: number | null = null;
    if (viewerState.faceDetected) {
      if (this.viewerPositionLastFrame !== null) positionDelta = viewerState.position.clone().sub(this.viewerPositionLastFrame);
      if (this.viewerDistanceLastFrame !== null) distanceDelta = viewerState.distance - this.viewerDistanceLastFrame;
      this.viewerPositionLastFrame = viewerState.position.clone();
      this.viewerDistanceLastFrame = viewerState.distance;
    } else {
      this.viewerPositionLastFrame = null;
      this.viewerDistanceLastFrame = null;
    }
    return { positionDelta, distanceDelta };
  }

  // transforms scene based on head movement
  private transformScene(positionDelta: THREE.Vector3 | null, distanceDelta: number | null, sceneState: SceneState, alpha: number): { rotation: THREE.Quaternion; cameraX: number } {
    let cameraX: number = sceneState.cameraX;
    if (alpha > 0) {
      if (distanceDelta !== null) {
        cameraX = THREE.MathUtils.clamp(cameraX - (distanceDelta / this.cmPerUnit) * alpha, this.minCameraX, this.maxCameraX);
      }
      if (positionDelta !== null) {
        const deltaQuat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, -positionDelta.z * this.rotationScale, positionDelta.y * this.rotationScale, 'XYZ')
        );
        sceneState.rotation.premultiply(new THREE.Quaternion().slerp(deltaQuat, alpha));
      }
    }
    return { rotation: sceneState.rotation, cameraX };
  }

  private blendStateFromRotation(rotation: THREE.Quaternion): { grayscalePbrNoiseBlend: number; modeChange: 'startCompletionMode' | null } {
    const worldUp = new THREE.Vector3(0, 1, 0);
    const objectUp = worldUp.clone().applyQuaternion(rotation);
    const angleDeg: number = THREE.MathUtils.RAD2DEG * Math.acos(THREE.MathUtils.clamp(objectUp.dot(worldUp), -1, 1));
    return {
      grayscalePbrNoiseBlend: GamingMode.blendFromAngle(angleDeg),
      modeChange: angleDeg < GamingMode.completionThresholdDeg ? 'startCompletionMode' : null,
    };
  }

  computeFrame(viewerState: ViewerState, sceneState: SceneState, now: number): FrameState {
    const { fireBeat, alpha } = this.beatCalculations(now);
    const { positionDelta, distanceDelta } = this.updateViewerAndSampleDeltas(viewerState);
    const { rotation, cameraX } = this.transformScene(positionDelta, distanceDelta, sceneState, alpha);
    const { grayscalePbrNoiseBlend, modeChange } = this.blendStateFromRotation(rotation);
    return {
      cameraX,
      rotation,
      pbrColorBlend: 0,
      captureBlend: 0,
      grayscalePbrNoiseBlend,
      noiseGain: alpha * viewerState.speedFactor,
      fireBeat,
      modeChange,
    };
  }
}
