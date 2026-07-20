import { currentAlpha, currentSpeed } from './animation';

const audioContext: AudioContext = new AudioContext();

// ── Noise source ──────────────────────────────────────────────────────────────
const noiseGain: GainNode = audioContext.createGain();
noiseGain.gain.value = 0;
noiseGain.connect(audioContext.destination);

export async function initNoise(): Promise<void> {
  const response = await fetch('./noise.mp3');
  const noiseBuffer = await audioContext.decodeAudioData(await response.arrayBuffer());
  const noiseSource: AudioBufferSourceNode = audioContext.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;
  noiseSource.loopStart = 0;
  noiseSource.loopEnd = Math.min(4, noiseBuffer.duration);
  noiseSource.connect(noiseGain);
  noiseSource.start();
}

// ── Mute / beat ───────────────────────────────────────────────────────────────
let muted: boolean = false;
export function setMuted(v: boolean): void { muted = v; }

export function onBeat(): void {
  if (audioContext.state === 'suspended') audioContext.resume();
}

export function tick(_now: number): void {
  const t: number = audioContext.currentTime;
  const speedFactor: number = Math.min(currentSpeed * 10, 1);
  const targetGain: number = muted ? 0 : currentAlpha * speedFactor;
  noiseGain.gain.cancelAndHoldAtTime(t);
  noiseGain.gain.setTargetAtTime(targetGain, t, 0.05);
}
