import { AnimationMode } from './mode';
import { RevealedMode } from './modeRevealed';
import { ViewerState, SceneState, FrameState } from './frameState';

export class TransitionMode extends AnimationMode {
  private readonly revealedMode: RevealedMode;
  private readonly duration: number; // ms
  private readonly startTime: number;

  constructor(revealedMode: RevealedMode, duration: number, now: number) {
    super();
    this.revealedMode = revealedMode;
    this.duration = duration;
    this.startTime = now;
  }

  computeFrame(viewerState: ViewerState, sceneState: SceneState, now: number): FrameState {
    const elapsed: number = now - this.startTime;
    const blendFactor: number = Math.min(elapsed / this.duration, 1.0);

    const revealedFrame = this.revealedMode.computeFrame(viewerState, sceneState, now);
    const noiseGain: number = viewerState.speedFactor * (1 - blendFactor);

    return { cameraX: sceneState.cameraX, rotation: revealedFrame.rotation, blendFactor, noiseGain, fireBeat: false };
  }
}
