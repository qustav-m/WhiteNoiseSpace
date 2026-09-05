import { AnimationMode } from './animationMode';
import { ViewerState, SceneState, FrameState } from './frameState';

const minDuration: number = 500; // ms

export class CaptureHoldMode extends AnimationMode {
  private readonly startTime: number;

  constructor(now: number) {
    super();
    this.startTime = now;
  }

  computeFrame(_viewerState: ViewerState, sceneState: SceneState, now: number): FrameState {
    return {
      cameraX: sceneState.cameraX,
      rotation: sceneState.rotation,
      pbrColorBlend: 1,
      captureBlend: 1,
      grayscalePbrNoiseBlend: 1,
      noiseGain: 0,
      fireBeat: false,
      modeChange: now - this.startTime >= minDuration ? 'startTransitionMode' : null,
    };
  }
}
