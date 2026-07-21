export class AudioPlayer {
  private static readonly tickFrequency: number = 60;

  private context: AudioContext; // shared browser audio engine
  private buffer: AudioBuffer; // decoded audio file in memory
  private gainNode: GainNode; // volume control node in the signal chain
  private source: AudioBufferSourceNode | null = null; // currently playing source (null when stopped)

  private gainValue: number = 0; // desired gain, set externally via setGain()
  private intervalId: number = -1; // handle for the gain loop interval
  private loopEnabled: boolean = false; // whether the track loops
  private loopEnd: number = 0; // loop point in seconds

  private startTime: number = 0; // AudioContext time when current playback started
  private pauseOffset: number = 0; // playback position saved on stop(), used by resume()
  private playing: boolean = false; // true while source is running

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

  private createSource(offset: number): void {
    this.source = this.context.createBufferSource();
    this.source.buffer = this.buffer;
    if (this.loopEnabled) {
      this.source.loop = true;
      this.source.loopStart = 0;
      this.source.loopEnd = this.loopEnd;
    }
    this.source.connect(this.gainNode);
    this.source.start(0, offset);
    this.startTime = this.context.currentTime - offset;
    this.playing = true;
    this.source.onended = () => {
      this.playing = false;
      this.source = null;
    };
  }

  play(): void {
    if (this.source) {
      this.source.stop();
      this.source = null;
    }
    this.pauseOffset = 0;
    this.createSource(0);
  }

  stop(): void {
    if (!this.source) return;
    const elapsed = this.context.currentTime - this.startTime;
    this.pauseOffset = this.loopEnabled && this.loopEnd > 0
      ? elapsed % this.loopEnd
      : Math.min(elapsed, this.buffer.duration);
    const source = this.source;
    this.source = null;
    this.playing = false;
    source.stop();
  }

  resume(): void {
    if (this.playing) return;
    this.createSource(this.pauseOffset);
  }

  loop(loopEnd: number): void {
    this.loopEnabled = true;
    this.loopEnd = loopEnd;
    if (this.source) {
      this.source.loop = true;
      this.source.loopStart = 0;
      this.source.loopEnd = loopEnd;
    }
  }

  setGain(value: number): void {
    this.gainValue = value;
  }

  dispose(): void {
    clearInterval(this.intervalId);
    this.source?.stop();
    this.gainNode.disconnect();
  }
}
