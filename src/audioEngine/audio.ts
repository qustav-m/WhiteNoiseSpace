import { AudioPlayer } from './audioPlayer';
import noiseUrl from '../../audio/noise.mp3?url';
import drumUrl from '../../audio/drumHit.mp3?url';

const audioContext: AudioContext = new AudioContext();
const resumeOnce = () => { audioContext.resume(); document.removeEventListener('click', resumeOnce); };
document.addEventListener('click', resumeOnce);

export async function initAudio(): Promise<{ noisePlayer: AudioPlayer; drumPlayer: AudioPlayer }> {
  const [noisePlayer, drumPlayer] = await Promise.all([
    AudioPlayer.load(audioContext, noiseUrl),
    AudioPlayer.load(audioContext, drumUrl),
  ]);
  noisePlayer.loopDual(8);
  drumPlayer.setGain(0.4);
  return { noisePlayer, drumPlayer };
}
