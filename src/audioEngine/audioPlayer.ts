export class AudioPlayer {
  private static readonly tickFrequency: number = 60;

  private readonly context: AudioContext;
  private readonly buffer: AudioBuffer; // decoded audio file in memory
  private readonly gainNode: GainNode; // master volume control, driven by game state via setGain()
  private sources: AudioBufferSourceNode[] = []; // all currently active playback nodes

  private gainValue: number = 0; // desired gain, set externally via setGain()
  private intervalId: number = -1; // handle for the gain smoothing interval

  static async load(context: AudioContext, url: string): Promise<AudioPlayer> {
    const buffer = await context.decodeAudioData(await (await fetch(url)).arrayBuffer());
    return new AudioPlayer(context, buffer);
  }

  private constructor(context: AudioContext, buffer: AudioBuffer) {
    this.context = context;
    this.buffer = buffer;
    this.gainNode = context.createGain();
    this.gainNode.gain.value = 0;
    this.gainNode.connect(context.destination);
    this.startGainLoop();
  }

  private startGainLoop(): void {
    this.intervalId = setInterval(() => {
      const currentTime: number = this.context.currentTime;
      this.gainNode.gain.cancelAndHoldAtTime(currentTime);
      // exponentially approach gainValue starting at currentTime, with time constant 0.1s:
      // after (1/60)s → 15% there, after 0.1s → 63%, after 0.2s → 86%, after 0.3s → 95%, never fully arrives
      // gainValue fluctuates each frame; never arriving reduces variance — spikes and dips are pulled toward the mean
      this.gainNode.gain.setTargetAtTime(this.gainValue, currentTime, 0.1);
    }, 1000 / AudioPlayer.tickFrequency);
  }

  private addSource(loopLength?: number, delaySeconds: number = 0): void {
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    if (loopLength !== undefined) {
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = loopLength;
    }
    source.connect(this.gainNode);
    source.start(this.context.currentTime + delaySeconds);
    source.onended = () => { this.sources = this.sources.filter(s => s !== source); };
    this.sources.push(source);
  }

  private stopAll(): void {
    const toStop = this.sources;
    this.sources = []; // clear first so onended callbacks see an empty array
    for (const source of toStop) {
      try { source.stop(); } catch {} // guard against sources that already ended naturally
    }
  }

  // One-shot playback — restarts from the beginning each call. Used for drum hits.
  play(): void {
    this.stopAll();
    this.addSource();
  }

  // Native loop at loopEnd seconds. Has a click at the loop boundary if the waveform is non-zero there.
  loop(loopEnd: number): void {
    this.stopAll();
    this.addSource(loopEnd);
  }

  // Two looping sources offset by loopLength/2, creating a seamless alternating loop.
  // The audio file must have fade-in/out baked in, padded with silence so that
  // loopLength = 2 * (audioLength - overlapDuration).
  loopDual(loopLength: number): void {
    this.stopAll();
    this.addSource(loopLength, 0);
    this.addSource(loopLength, loopLength / 2);
  }

  setGain(value: number): void {
    this.gainValue = value;
  }

  dispose(): void {
    clearInterval(this.intervalId);
    this.stopAll();
    this.gainNode.disconnect();
  }
}
