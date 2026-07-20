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

// ── Pink noise ────────────────────────────────────────────────────────────────
// 2-second buffer of pink noise (Paul Kellet algorithm: -3 dB/octave rolloff),
// looped — sounds like wind/rain rather than harsh white noise
const bufferSize: number = audioContext.sampleRate * 2;
const noiseBuffer: AudioBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
const bufferData: Float32Array = noiseBuffer.getChannelData(0);
let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
for (let i: number = 0; i < bufferSize; i++) {
  const w: number = Math.random() * 2 - 1;
  b0 = 0.99886 * b0 + w * 0.0555179;
  b1 = 0.99332 * b1 + w * 0.0750759;
  b2 = 0.96900 * b2 + w * 0.1538520;
  b3 = 0.86650 * b3 + w * 0.3104856;
  b4 = 0.55000 * b4 + w * 0.5329522;
  b5 = -0.7616 * b5 - w * 0.0168980;
  bufferData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
  b6 = w * 0.115926;
}

const noiseSource: AudioBufferSourceNode = audioContext.createBufferSource();
noiseSource.buffer = noiseBuffer;
noiseSource.loop = true;

const noiseGain: GainNode = audioContext.createGain();
noiseGain.gain.value = 0;
noiseSource.connect(noiseGain);
noiseGain.connect(audioContext.destination);
noiseSource.start();

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
