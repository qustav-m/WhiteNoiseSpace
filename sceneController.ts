import * as THREE from 'three';
import { HiddenMode } from './modeHidden';
import { RevealedMode } from './modeRevealed';
import { TransitionMode } from './modeTransition';
import { AnimationMode } from './mode';
import { ViewerState, SceneState } from './frameState';
import { viewerPosition, viewerForward, viewerUp, viewerDistance, faceDetected } from './viewer';
import { AudioPlayer } from './audioPlayer';

export class SceneController {
  private readonly hiddenMode: HiddenMode;
  private readonly revealedMode: RevealedMode;
  private currentMode: AnimationMode;

  private noisePlayer: AudioPlayer | null = null;
  private drumPlayer: AudioPlayer | null = null;
  private muted: boolean = true;

  private lastCameraX: number = 0;
  private lastRotation: THREE.Quaternion = new THREE.Quaternion();
  private currentBlendFactor: number = 0;
  private speedLastPosition: THREE.Vector3 | null = null;
  private speedLastTime: number = -1;
  private currentSpeedFactor: number = 0;

  constructor() {
    this.hiddenMode = new HiddenMode();
    this.revealedMode = new RevealedMode();
    this.currentMode = this.hiddenMode;
  }

  setAudioPlayers(noisePlayer: AudioPlayer, drumPlayer: AudioPlayer): void {
    this.noisePlayer = noisePlayer;
    this.drumPlayer = drumPlayer;
  }

  setMuted(value: boolean): void {
    this.muted = value;
  }

  setBPM(bpm: number): void {
    this.hiddenMode.setBPM(bpm);
  }

  startTransition(duration: number, now: number): void {
    this.revealedMode.setBase(this.lastRotation, viewerForward.clone(), viewerUp.clone());
    this.currentMode = new TransitionMode(
      this.revealedMode,
      duration,
      now,
      this.lastCameraX
    );
  }

  setModeHidden(): void {
    this.currentMode = this.hiddenMode;
  }

  get blendFactor(): number {
    return this.currentBlendFactor;
  }

  update(camera: THREE.PerspectiveCamera, mesh: THREE.Mesh, now: number): void {
    if (faceDetected) {
      if (this.speedLastPosition !== null && this.speedLastTime > 0) {
        const deltaTime: number = now - this.speedLastTime;
        if (deltaTime > 0) {
          const speed = viewerPosition.distanceTo(this.speedLastPosition) / deltaTime;
          this.currentSpeedFactor = Math.min(speed * 10, 1);
        }
      }
      this.speedLastPosition = viewerPosition.clone();
      this.speedLastTime = now;
    } else {
      this.currentSpeedFactor = 0;
      this.speedLastPosition = null;
    }

    const viewerState: ViewerState = {
      position: viewerPosition.clone(),
      forward: viewerForward.clone(),
      up: viewerUp.clone(),
      distance: viewerDistance,
      faceDetected: faceDetected,
      speedFactor: this.currentSpeedFactor,
    };

    const sceneState: SceneState = {
      cameraX: camera.position.x,
      rotation: mesh.quaternion.clone(),
    };

    const frame = this.currentMode.computeFrame(viewerState, sceneState, now);

    camera.position.x = frame.cameraX;
    mesh.quaternion.copy(frame.rotation);

    this.lastCameraX = frame.cameraX;
    this.lastRotation.copy(frame.rotation);

    if (frame.fireBeat && !this.muted && this.drumPlayer) {
      this.drumPlayer.play();
    }
    if (this.noisePlayer) {
      this.noisePlayer.setGain(this.muted ? 0 : frame.noiseGain);
    }

    this.currentBlendFactor = frame.blendFactor;
  }
}
