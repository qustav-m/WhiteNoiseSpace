import { currentAlpha, currentSpeed } from './animation.js';

const audioCtx = new AudioContext();

// ── Click sound ───────────────────────────────────────────────────────────────
function playClick() {
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.05);
}

// ── Tone source ───────────────────────────────────────────────────────────────
const noiseSource = audioCtx.createOscillator();
const noiseGain   = audioCtx.createGain();
noiseGain.gain.value = 0;
noiseSource.connect(noiseGain);
noiseGain.connect(audioCtx.destination);
noiseSource.start();

// ── Mute / beat ───────────────────────────────────────────────────────────────
let muted = false;
export function setMuted(v) { muted = v; }

export function onBeat() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (!muted) playClick();
}

let lastTickTime = -1;

export function tick(now) {
  const frameDelta = lastTickTime > 0 ? (now - lastTickTime) / 1000 : 0.016;
  lastTickTime = now;

  const targetFreq = 440 - 220 * currentAlpha; // 440 Hz → 220 Hz
  noiseSource.frequency.cancelAndHoldAtTime(audioCtx.currentTime);
  noiseSource.frequency.linearRampToValueAtTime(targetFreq, audioCtx.currentTime + frameDelta);

  const speedFactor = Math.min(currentSpeed * 10, 1);
  const targetGain  = muted ? 0 : speedFactor * (1 - currentAlpha) * 0.3;
  noiseGain.gain.cancelAndHoldAtTime(audioCtx.currentTime);
  noiseGain.gain.linearRampToValueAtTime(targetGain, audioCtx.currentTime + frameDelta);
}
