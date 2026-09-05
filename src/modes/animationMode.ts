import { ViewerState, SceneState, FrameState } from './frameState';

export abstract class AnimationMode {
  abstract computeFrame(viewerState: ViewerState, sceneState: SceneState, now: number): FrameState;
}
