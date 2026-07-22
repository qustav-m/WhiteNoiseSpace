import { AudioPlayer } from './audioPlayer';

const audioContext: AudioContext = new AudioContext();
const resumeOnce = () => { audioContext.resume(); document.removeEventListener('click', resumeOnce); };
document.addEventListener('click', resumeOnce);

export async function initAudio(): Promise<{ noisePlayer: AudioPlayer; drumPlayer: AudioPlayer }> {
  const [noisePlayer, drumPlayer] = await Promise.all([
    AudioPlayer.load(audioContext, './noise.mp3'),
    AudioPlayer.load(audioContext, './drumHit.mp3'),
  ]);
  noisePlayer.loop(4);
  noisePlayer.play();
  drumPlayer.setGain(1);
  return { noisePlayer, drumPlayer };
}
