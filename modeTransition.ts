import { AnimationMode } from './mode';
import { RevealedMode } from './modeRevealed';
import { ViewerState, SceneState, FrameState } from './frameState';

export class TransitionMode extends AnimationMode {
  private readonly revealedMode: RevealedMode;
  private readonly duration: number; // ms
  private readonly startTime: number;
  private readonly startCameraX: number;
  private readonly minCameraX: number = 0.0;
  private readonly maxCameraX: number = 10.0;

  // on the first frame, we determine which direction to move camera X:
  // if revealed wants higher X → move toward max, otherwise toward min
  private moveTowardMax: boolean = false;
  private crossedDirectX: boolean = false;
  private initialized: boolean = false;

  constructor(
    revealedMode: RevealedMode,
    duration: number,
    now: number,
    startCameraX: number
  ) {
    super();
    this.revealedMode = revealedMode;
    this.duration = duration;
    this.startTime = now;
    this.startCameraX = startCameraX;
  }

  computeFrame(viewerState: ViewerState, sceneState: SceneState, now: number): FrameState {
    const elapsed: number = now - this.startTime;
    const blendFactor: number = Math.min(elapsed / this.duration, 1.0);

    const revealedFrame = this.revealedMode.computeFrame(viewerState, sceneState, now);
    const directX: number = revealedFrame.cameraX;

    if (!this.initialized) {
      this.moveTowardMax = directX > this.startCameraX;
      this.initialized = true;
    }

    let cameraX: number;
    if (!this.crossedDirectX) {
      const target: number = this.moveTowardMax ? this.maxCameraX : this.minCameraX;
      const linearX: number = this.startCameraX + (target - this.startCameraX) * blendFactor;
      const crossed: boolean = this.moveTowardMax ? linearX >= directX : linearX <= directX;
      if (crossed) {
        this.crossedDirectX = true;
        cameraX = directX;
      } else {
        cameraX = linearX;
      }
    } else {
      cameraX = directX;
    }

    const rotation = revealedFrame.rotation;
    const noiseGain: number = viewerState.speedFactor * (1 - blendFactor);

    return { cameraX, rotation, blendFactor, noiseGain, fireBeat: false };
  }
}
