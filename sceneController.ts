import * as THREE from 'three';
import { GamingMode } from './modeGaming';
import { CompletionMode } from './modeCompletion';
import { AnimationMode } from './mode';
import { ViewerState, SceneState } from './frameState';
import { viewerPosition, viewerForward, viewerUp, viewerDistance, faceDetected } from './viewer';
import { AudioPlayer } from './audioPlayer';

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

export class SceneController {
  private currentMode!: AnimationMode;
  private currentBPM: number = 30;

  private noisePlayer: AudioPlayer | null = null;
  private drumPlayer: AudioPlayer | null = null;
  private muted: boolean = true;

  private pendingRotation: THREE.Quaternion | null = null;
  private currentGrayscalePbrNoiseBlend: number = 0;
  private currentPbrColorBlend: number = 0;
  private speedLastPosition: THREE.Vector3 | null = null;
  private speedLastTime: number = -1;
  private currentSpeedFactor: number = 0;

  constructor() {
    this.startNewRound();
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

  startNewRound(): void {
    this.pendingRotation = randomStartRotation();
    this.currentMode = this.createGamingMode();
  }

  get grayscalePbrNoiseBlend(): number {
    return this.currentGrayscalePbrNoiseBlend;
  }

  get pbrColorBlend(): number {
    return this.currentPbrColorBlend;
  }

  update(camera: THREE.PerspectiveCamera, mesh: THREE.Mesh, now: number): void {
    if (this.pendingRotation !== null) {
      mesh.quaternion.copy(this.pendingRotation);
      this.pendingRotation = null;
    }

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

    if (frame.transition === 'startCompletionMode') {
      this.currentMode = new CompletionMode(frame.rotation, frame.cameraX, now);
    } else if (frame.transition === 'startNewRound') {
      this.startNewRound();
    }

    if (frame.fireBeat && !this.muted && this.drumPlayer) {
      this.drumPlayer.play();
    }
    if (this.noisePlayer) {
      this.noisePlayer.setGain(this.muted ? 0 : frame.noiseGain);
    }

    this.currentGrayscalePbrNoiseBlend = frame.grayscalePbrNoiseBlend;
    this.currentPbrColorBlend = frame.pbrColorBlend;
  }
}
