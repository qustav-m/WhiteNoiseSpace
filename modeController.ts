import * as THREE from 'three';
import { GamingMode } from './modeGaming';
import { CompletionMode } from './modeCompletion';
import { TransitionMode } from './modeTransition';
import { AnimationMode } from './mode';
import { ViewerState, SceneState } from './frameState';
import { viewerPosition, viewerForward, viewerUp, viewerDistance, faceDetected } from './viewer';
import { AudioPlayer } from './audioPlayer';
import { RenderPipeline } from './renderPipeline';

const startAngleMinDeg: number = 60;
const startAngleMaxDeg: number = 120;

function randomStartRotation(): THREE.Quaternion {
  const minRad = THREE.MathUtils.degToRad(startAngleMinDeg);
  const maxRad = THREE.MathUtils.degToRad(startAngleMaxDeg);
  const angleFromUp: number = minRad + Math.random() * (maxRad - minRad);
  const azimuth: number = Math.random() * Math.PI * 2;

  const objectUp = new THREE.Vector3(
    Math.sin(angleFromUp) * Math.cos(azimuth),
    Math.cos(angleFromUp),
    Math.sin(angleFromUp) * Math.sin(azimuth),
  );

  const baseRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), objectUp);
  const roll = new THREE.Quaternion().setFromAxisAngle(objectUp, Math.random() * Math.PI * 2);
  return roll.multiply(baseRotation);
}

export class ModeController {
  private renderPipeline!: RenderPipeline;
  private currentMode!: AnimationMode;
  private currentBPM: number = 30;

  private noisePlayer: AudioPlayer | null = null;
  private drumPlayer: AudioPlayer | null = null;
  private muted: boolean = true;

  private speedLastPosition: THREE.Vector3 | null = null;
  private speedLastTime: number = -1;
  private currentSpeedFactor: number = 0;

  initialize(renderPipeline: RenderPipeline): void {
    this.renderPipeline = renderPipeline;
    this.switchToNextScene(renderPipeline.sceneMesh);
    this.currentMode = this.createGamingMode();
  }

  private switchToNextScene(mesh: THREE.Mesh): void {
    // TODO: swap to next glTF model and position it
    const newRotation = randomStartRotation();
    mesh.quaternion.copy(newRotation);
  }

  private createGamingMode(): GamingMode {
    const mode = new GamingMode();
    mode.setBPM(this.currentBPM);
    return mode;
  }

  setAudioPlayers(noisePlayer: AudioPlayer, drumPlayer: AudioPlayer): void {
    this.noisePlayer = noisePlayer;
    this.drumPlayer = drumPlayer;
  }

  setMuted(value: boolean): void {
    this.muted = value;
  }

  setBPM(bpm: number): void {
    this.currentBPM = bpm;
    if (this.currentMode instanceof GamingMode) {
      this.currentMode.setBPM(bpm);
    }
  }

  update(now: number): void {
    const camera = this.renderPipeline.camera;
    const mesh = this.renderPipeline.sceneMesh;

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

    let frame = this.currentMode.computeFrame(viewerState, sceneState, now);

    if (frame.modeChange === 'startCompletionMode') {
      this.currentMode = new CompletionMode(frame.rotation, frame.cameraX, now);
    } else if (frame.modeChange === 'startTransitionMode') {
      this.renderPipeline.takeCapture();
      this.switchToNextScene(mesh);
      this.currentMode = new TransitionMode(now);
      frame = this.currentMode.computeFrame(viewerState, { cameraX: camera.position.x, rotation: mesh.quaternion }, now);
    } else if (frame.modeChange === 'startGamingMode') {
      this.currentMode = this.createGamingMode();
    }

    camera.position.x = frame.cameraX;
    mesh.quaternion.copy(frame.rotation);

    if (frame.fireBeat && !this.muted && this.drumPlayer) {
      this.drumPlayer.play();
    }
    if (this.noisePlayer) {
      this.noisePlayer.setGain(this.muted ? 0 : frame.noiseGain);
    }

    this.renderPipeline.setBlends(frame.grayscalePbrNoiseBlend, frame.pbrColorBlend, frame.captureBlend);
  }
}
