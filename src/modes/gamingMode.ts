import * as THREE from 'three';
import { AnimationMode } from './animationMode';
import { ViewerState, SceneState, FrameState } from './frameState';

export class GamingMode extends AnimationMode {
  // acceptanceAngleFromAttentionTime
  private static readonly minAcceptanceAngle: number = 5;  // degrees, hardest
  private static readonly maxAcceptanceAngle: number = 90; // degrees, easiest
  private static readonly halfLife: number = 20*1000; // ms

  // blendStateFromRotation
  private static readonly acceptanceDuration: number = 500; // ms

  // movementWeightFromCycleTime
  private readonly fadeEnd: number = 0.5;

  // transformScene
  private readonly rotationScale: number = 0.15;
  private readonly cmPerUnit: number = 10.0;
  private readonly minCameraX: number = 0.0;
  private readonly maxCameraX: number = 1.5;

  // ---------------------------------------------------------------------------

  private lastAttentionFrameTime: number | null = null;
  private viewerAttentionTime: number = 0;

  private calculateViewerAttention(viewerState: ViewerState, now: number): void {
    if (this.lastAttentionFrameTime !== null) {
      const dt: number = now - this.lastAttentionFrameTime;
      if (viewerState.faceDetected) {
        this.viewerAttentionTime += dt;
      } else {
        this.viewerAttentionTime = Math.max(0, this.viewerAttentionTime - dt);
      }
    }
    this.lastAttentionFrameTime = now;
  }

  // ---------------------------------------------------------------------------

  // setBPM
  private beatInterval: number = 60000 / 30;

  // uses: beatInterval
  setBPM(bpm: number): void {
    this.beatInterval = 60000 / bpm;
  }

  // uses: fadeEnd
  private movementWeightFromCycleTime(normalizedTime: number): number {
    if (normalizedTime >= this.fadeEnd) return 0.0;
    const progress: number = normalizedTime / this.fadeEnd;
    return 1 - progress * progress;
  }

  private lastBeatTime: number = -1;
  private viewerDistanceLastFrame: number | null = null;

  // uses: beatInterval
  private beatCalculations(now: number): { fireBeat: boolean; alpha: number } {
    if (this.lastBeatTime < 0) this.lastBeatTime = now - this.beatInterval; // lazy init: fire beat immediately on first frame
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

  // ---------------------------------------------------------------------------

  private viewerPositionLastFrame: THREE.Vector3 | null = null;

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

  // ---------------------------------------------------------------------------

  // uses: rotationScale, cmPerUnit, minCameraX, maxCameraX
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

  // ---------------------------------------------------------------------------

  private static acceptanceCurve(x: number): number { // x in R+
    return 1 - (x / (x + 1));
  }

  // uses: minAcceptanceAngle, maxAcceptanceAngle, halfLife
  private static acceptanceAngleFromAttentionTime(viewerAttentionTime: number): number {
    const curve = GamingMode.acceptanceCurve(viewerAttentionTime / GamingMode.halfLife);
    return THREE.MathUtils.lerp(GamingMode.maxAcceptanceAngle, GamingMode.minAcceptanceAngle, curve);
  }

  private static interpolationCurve(t: number): number { // t in [0, 1]
    return t**16;
  }

  private static blendFromAngle(angleDeg: number, acceptanceAngle: number): number {
    let t = (angleDeg - acceptanceAngle) / (180 - acceptanceAngle);
    t = 1 - THREE.MathUtils.clamp(t, 0, 1);
    return GamingMode.interpolationCurve(t);
  }

  private withinAcceptanceAngleSince: number | null = null;

  // uses: acceptanceDuration, minAcceptanceAngle, maxAcceptanceAngle, halfLife
  private blendStateFromRotation(rotation: THREE.Quaternion, now: number): { grayscalePbrNoiseBlend: number; modeChange: 'startCompletionMode' | null } {
    const worldUp = new THREE.Vector3(0, 1, 0);
    const objectUp = worldUp.clone().applyQuaternion(rotation);
    const angleDeg: number = THREE.MathUtils.RAD2DEG * Math.acos(THREE.MathUtils.clamp(objectUp.dot(worldUp), -1, 1));
    const acceptanceAngle: number = GamingMode.acceptanceAngleFromAttentionTime(this.viewerAttentionTime);
    const withinAcceptance: boolean = angleDeg < acceptanceAngle;
    let acceptanceDurationMet: boolean = false;
    if (withinAcceptance) {
      if (this.withinAcceptanceAngleSince === null) {
        this.withinAcceptanceAngleSince = now;
      }
      const timeWithinAcceptanceAngle: number = now - this.withinAcceptanceAngleSince;
      acceptanceDurationMet = timeWithinAcceptanceAngle >= GamingMode.acceptanceDuration;
    } else {
      this.withinAcceptanceAngleSince = null;
    }

    return {
      grayscalePbrNoiseBlend: GamingMode.blendFromAngle(angleDeg, acceptanceAngle),
      modeChange: acceptanceDurationMet ? 'startCompletionMode' : null,
    };
  }

  // ---------------------------------------------------------------------------

  computeFrame(viewerState: ViewerState, sceneState: SceneState, now: number): FrameState {
    this.calculateViewerAttention(viewerState, now);
    const { fireBeat, alpha } = this.beatCalculations(now);
    const { positionDelta, distanceDelta } = this.updateViewerAndSampleDeltas(viewerState);
    const { rotation, cameraX } = this.transformScene(positionDelta, distanceDelta, sceneState, alpha);
    const { grayscalePbrNoiseBlend, modeChange } = this.blendStateFromRotation(rotation, now);
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
