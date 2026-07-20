import { currentAlpha } from './animation.js';

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

// ── Noise worklet ─────────────────────────────────────────────────────────────
let noiseNode = null;
let noiseGain = null;

audioCtx.audioWorklet.addModule('./noise-processor.js').then(() => {
  noiseNode = new AudioWorkletNode(audioCtx, 'noise-processor');
  noiseGain = audioCtx.createGain();
  noiseGain.gain.value = 0.3;
  noiseNode.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);
});

// ── Mute / beat ───────────────────────────────────────────────────────────────
let muted = false;
export function setMuted(v) { muted = v; }

export function onBeat() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (!muted) playClick();
}

export function tick() {
  if (!noiseNode || !noiseGain) return;
  noiseNode.parameters.get('alpha').value = currentAlpha;
  noiseGain.gain.value = muted ? 0 : (1 - currentAlpha) * 0.3;
}
