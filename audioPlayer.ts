export class AudioPlayer {
  private static readonly tickFrequency: number = 60;

  private context: AudioContext;
  private buffer: AudioBuffer;
  private gainNode: GainNode;
  private source: AudioBufferSourceNode | null = null;

  private gainValue: number = 0;
  private intervalId: number = -1;
  private loopEnabled: boolean = false;
  private loopEnd: number = 0;

  private startTime: number = 0;
  private pauseOffset: number = 0;
  private playing: boolean = false;

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

    this.intervalId = setInterval(() => {
      const t: number = this.context.currentTime;
      this.gainNode.gain.cancelAndHoldAtTime(t);
      this.gainNode.gain.setTargetAtTime(this.gainValue, t, 1 / AudioPlayer.tickFrequency);
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
