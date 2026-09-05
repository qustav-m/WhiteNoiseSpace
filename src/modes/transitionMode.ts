import { AnimationMode } from './animationMode';
import { ViewerState, SceneState, FrameState } from './frameState';

function interpolationCurve(t: number): number {
  return 1 - t;
}

export class TransitionMode extends AnimationMode {
  private static readonly duration: number = 1500; // ms

  private readonly startTime: number;

  constructor(now: number) {
    super();
    this.startTime = now;
  }

  computeFrame(_viewerState: ViewerState, sceneState: SceneState, now: number): FrameState {
    const t: number = Math.min((now - this.startTime) / TransitionMode.duration, 1);
    const curve: number = interpolationCurve(t);

    return {
      cameraX: sceneState.cameraX,
      rotation: sceneState.rotation,
      pbrColorBlend: 0,
      captureBlend: 1,
      grayscalePbrNoiseBlend: curve,
      noiseGain: 0,
      fireBeat: false,
      modeChange: t >= 1 ? 'startGamingMode' : null,
    };
  }
}
