import { currentAlpha, currentSpeed } from './animation';

const audioContext: AudioContext = new AudioContext();

// ── Click sound ───────────────────────────────────────────────────────────────
function playClick(): void {
  const osc: OscillatorNode = audioContext.createOscillator();
  const gain: GainNode = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.3, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.05);
  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.05);
}

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
  noiseSource.connect(noiseGain);
  noiseSource.start();
}

// ── Mute / beat ───────────────────────────────────────────────────────────────
let muted: boolean = false;
export function setMuted(v: boolean): void { muted = v; }

export function onBeat(): void {
  if (audioContext.state === 'suspended') audioContext.resume();
  if (!muted) playClick();
}

let lastTickTime: number = -1;

export function tick(now: number): void {
  const frameDelta: number = lastTickTime > 0 ? (now - lastTickTime) / 1000 : 0.016;
  lastTickTime = now;

  const t: number = audioContext.currentTime;
  const speedFactor: number = Math.min(currentSpeed * 10, 1);
  const targetGain: number = muted ? 0 : speedFactor * (1 - currentAlpha) * 0.3;
  noiseGain.gain.cancelAndHoldAtTime(t);
  noiseGain.gain.linearRampToValueAtTime(targetGain, t + frameDelta);
}
