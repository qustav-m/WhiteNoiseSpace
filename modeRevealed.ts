import * as THREE from 'three';
import { AnimationMode } from './mode';
import { ViewerState, SceneState, FrameState } from './frameState';

export class RevealedMode extends AnimationMode {
  private readonly cmPerUnit: number = 10.0;
  private readonly minCameraX: number = 0.0;
  private readonly maxCameraX: number = 10.0;

  // localOffset = revealedStart⁻¹ × objectRotation, set at transition start.
  // The face quaternion acts as an anchor; the teapot hangs off it with this fixed local rotation.
  // output = faceQuat × localOffset — so when faceQuat = revealedStart, output = objectRotation exactly.
  private localOffset: THREE.Quaternion = new THREE.Quaternion();

  setBase(objectRotation: THREE.Quaternion, forward: THREE.Vector3, up: THREE.Vector3): void {
    const revealedStart = this.faceQuaternion(forward, up);
    this.localOffset = revealedStart.clone().invert().multiply(objectRotation);
  }

  private faceQuaternion(forward: THREE.Vector3, up: THREE.Vector3): THREE.Quaternion {
    if (forward.lengthSq() === 0) return new THREE.Quaternion();
    const f = forward.clone().normalize();
    const u = up.clone().normalize();
    const right = new THREE.Vector3().crossVectors(u, f).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, u, f));
  }

  computeFrame(viewerState: ViewerState, _sceneState: SceneState, _now: number): FrameState {
    const cameraX: number = THREE.MathUtils.clamp(
      this.maxCameraX - viewerState.distance / this.cmPerUnit,
      this.minCameraX,
      this.maxCameraX
    );

    let rotation: THREE.Quaternion = this.localOffset.clone();
    if (viewerState.faceDetected && viewerState.forward.lengthSq() > 0) {
      rotation = this.faceQuaternion(viewerState.forward, viewerState.up).multiply(this.localOffset.clone());
    }

    return { cameraX, rotation, blendFactor: 1, noiseGain: 0, fireBeat: false };
  }
}
