export class Music {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  muted = false;
  private wanted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stopNodes();
    else if (this.wanted) this.ensurePlaying();
  }

  start(): void {
    this.wanted = true;
    if (!this.muted) this.ensurePlaying();
  }

  stop(): void {
    this.wanted = false;
    this.stopNodes();
  }

  private ensurePlaying(): void {
    if (this.oscA || typeof AudioContext === "undefined") return;
    if (!this.ctx) this.ctx = new AudioContext();
    const ctx = this.ctx;
    void ctx.resume();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.018;
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = "sine";
    b.type = "triangle";
    a.frequency.value = 110;
    b.frequency.value = 164.8;
    a.connect(filter);
    b.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    a.start();
    b.start();
    this.oscA = a;
    this.oscB = b;
    this.gain = gain;
  }

  private stopNodes(): void {
    try {
      this.oscA?.stop();
      this.oscB?.stop();
    } catch {
      /* already stopped */
    }
    this.oscA?.disconnect();
    this.oscB?.disconnect();
    this.gain?.disconnect();
    this.oscA = null;
    this.oscB = null;
    this.gain = null;
  }
}
