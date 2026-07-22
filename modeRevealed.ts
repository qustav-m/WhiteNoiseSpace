import * as THREE from 'three';
import { AnimationMode } from './mode';
import { ViewerState, SceneState, FrameState } from './frameState';

export class RevealedMode extends AnimationMode {
  private readonly cmPerUnit: number = 10.0;
  private readonly minCameraX: number = 0.0;
  private readonly maxCameraX: number = 10.0;

  computeFrame(viewerState: ViewerState, _sceneState: SceneState, _now: number): FrameState {
    const cameraX: number = THREE.MathUtils.clamp(
      this.maxCameraX - viewerState.distance / this.cmPerUnit,
      this.minCameraX,
      this.maxCameraX
    );

    const rotation: THREE.Quaternion = new THREE.Quaternion();
    if (viewerState.faceDetected && viewerState.forward.lengthSq() > 0) {
      const forward = viewerState.forward.clone().normalize();
      const up = viewerState.up.clone().normalize();
      const right = new THREE.Vector3().crossVectors(up, forward).normalize();
      rotation.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, forward));
    }

    return { cameraX, rotation, blendFactor: 1, noiseGain: 0, fireBeat: false };
  }
}
