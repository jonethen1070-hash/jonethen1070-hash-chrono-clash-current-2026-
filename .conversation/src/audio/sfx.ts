export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  private audio(): AudioContext | null {
    if (this.muted) return null;
    if (typeof AudioContext === "undefined") return null;
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  beep(freq: number, dur = 0.08, gain = 0.04): void {
    const ctx = this.audio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  swap(): void {
    this.beep(420, 0.05, 0.03);
  }

  match(combo: number): void {
    this.beep(520 + combo * 80, 0.09, 0.05);
  }

  freeze(): void {
    this.beep(880, 0.07, 0.04);
    this.beep(420, 0.14, 0.05);
    this.beep(260, 0.2, 0.04);
  }

  power(): void {
    this.beep(240, 0.16, 0.06);
    this.beep(680, 0.12, 0.04);
  }

  impact(): void {
    this.beep(180, 0.1, 0.035);
    this.beep(540, 0.07, 0.03);
  }

  win(): void {
    this.beep(523, 0.12, 0.05);
    this.beep(659, 0.16, 0.05);
    this.beep(784, 0.22, 0.06);
  }

  lose(): void {
    this.beep(220, 0.22, 0.05);
  }
}
