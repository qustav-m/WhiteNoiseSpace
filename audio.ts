import { currentAlpha, currentSpeed } from './animation';
import { AudioPlayer } from './audioPlayer';

const audioContext: AudioContext = new AudioContext();
const resumeOnce = () => { audioContext.resume(); document.removeEventListener('click', resumeOnce); };
document.addEventListener('click', resumeOnce);

// ── State ─────────────────────────────────────────────────────────────────────
let noisePlayer: AudioPlayer | null = null;
let drumPlayer: AudioPlayer | null = null;
let muted: boolean = true;

export async function initNoise(): Promise<void> {
  [noisePlayer, drumPlayer] = await Promise.all([
    AudioPlayer.load(audioContext, './noise.mp3'),
    AudioPlayer.load(audioContext, './drumHit.mp3'),
  ]);
  noisePlayer.loop(4);
  noisePlayer.play();
  drumPlayer.setGain(1);
}

export function setMuted(v: boolean): void { muted = v; }

export function onBeat(): void {
  if (!drumPlayer || muted) return;
  drumPlayer.play();
}

export function tick(_now: number): void {
  const speedFactor: number = Math.min(currentSpeed * 10, 1);
  const targetGain: number = muted ? 0 : (1 - currentAlpha) * speedFactor;
  noisePlayer?.setGain(targetGain);
}
