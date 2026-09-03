import { AudioBus } from "./bus";
import {
  VoiceAction,
  VoiceIntensity,
  VoiceLineId,
  VoiceState,
  VOICE,
  arbitrate,
  flushQueue,
  freshVoiceState,
} from "./voice";

interface Pending {
  id: VoiceLineId;
  at: number;
}

interface Phone {
  kind: "vowel" | "noise";
  dur: number;
  f0: number;
  f1: number;
  f2: number;
  noise: number;
  gain: number;
}

const PHONES: Record<VoiceLineId, Phone[]> = {
  locked: [
    { kind: "vowel", dur: 0.12, f0: 92, f1: 480, f2: 860, noise: 0.04, gain: 0.85 },
    { kind: "vowel", dur: 0.22, f0: 78, f1: 420, f2: 780, noise: 0.03, gain: 0.9 },
  ],
  combo: [
    { kind: "noise", dur: 0.045, f0: 108, f1: 420, f2: 1800, noise: 0.7, gain: 0.9 },
    { kind: "vowel", dur: 0.12, f0: 118, f1: 700, f2: 1180, noise: 0.08, gain: 1 },
    { kind: "vowel", dur: 0.07, f0: 102, f1: 280, f2: 900, noise: 0.04, gain: 0.7 },
    { kind: "noise", dur: 0.03, f0: 96, f1: 500, f2: 1400, noise: 0.55, gain: 0.8 },
    { kind: "vowel", dur: 0.2, f0: 88, f1: 520, f2: 860, noise: 0.05, gain: 1.05 },
  ],
  ultimate: [
    { kind: "vowel", dur: 0.1, f0: 108, f1: 560, f2: 980, noise: 0.06, gain: 1 },
    { kind: "vowel", dur: 0.12, f0: 96, f1: 500, f2: 860, noise: 0.04, gain: 1.05 },
    { kind: "vowel", dur: 0.22, f0: 72, f1: 430, f2: 740, noise: 0.04, gain: 1.18 },
  ],
  nice: [
    { kind: "noise", dur: 0.035, f0: 110, f1: 400, f2: 1500, noise: 0.55, gain: 0.8 },
    { kind: "vowel", dur: 0.1, f0: 120, f1: 640, f2: 1100, noise: 0.06, gain: 0.95 },
    { kind: "vowel", dur: 0.18, f0: 92, f1: 500, f2: 860, noise: 0.05, gain: 1.05 },
  ],
  double_combo: [
    { kind: "noise", dur: 0.04, f0: 112, f1: 400, f2: 1600, noise: 0.65, gain: 0.85 },
    { kind: "vowel", dur: 0.09, f0: 122, f1: 640, f2: 1100, noise: 0.06, gain: 0.95 },
    { kind: "vowel", dur: 0.11, f0: 108, f1: 480, f2: 920, noise: 0.05, gain: 1 },
    { kind: "noise", dur: 0.03, f0: 100, f1: 420, f2: 1700, noise: 0.6, gain: 0.8 },
    { kind: "vowel", dur: 0.1, f0: 112, f1: 700, f2: 1200, noise: 0.07, gain: 1 },
    { kind: "vowel", dur: 0.16, f0: 86, f1: 500, f2: 840, noise: 0.05, gain: 1.08 },
  ],
  triple: [
    { kind: "noise", dur: 0.04, f0: 116, f1: 500, f2: 1900, noise: 0.7, gain: 0.9 },
    { kind: "vowel", dur: 0.1, f0: 124, f1: 620, f2: 1480, noise: 0.08, gain: 1 },
    { kind: "vowel", dur: 0.08, f0: 110, f1: 400, f2: 1000, noise: 0.04, gain: 0.8 },
    { kind: "vowel", dur: 0.2, f0: 90, f1: 560, f2: 880, noise: 0.05, gain: 1.1 },
  ],
  four_combo: [
    { kind: "noise", dur: 0.035, f0: 108, f1: 480, f2: 1500, noise: 0.55, gain: 0.85 },
    { kind: "vowel", dur: 0.12, f0: 100, f1: 580, f2: 920, noise: 0.06, gain: 1 },
    { kind: "noise", dur: 0.03, f0: 118, f1: 420, f2: 1750, noise: 0.65, gain: 0.85 },
    { kind: "vowel", dur: 0.1, f0: 120, f1: 720, f2: 1180, noise: 0.07, gain: 1 },
    { kind: "vowel", dur: 0.2, f0: 84, f1: 500, f2: 820, noise: 0.05, gain: 1.12 },
  ],
  amazing: [
    { kind: "noise", dur: 0.04, f0: 116, f1: 520, f2: 1800, noise: 0.6, gain: 0.88 },
    { kind: "vowel", dur: 0.12, f0: 122, f1: 680, f2: 1240, noise: 0.07, gain: 1.05 },
    { kind: "vowel", dur: 0.22, f0: 88, f1: 520, f2: 860, noise: 0.05, gain: 1.12 },
  ],
  perfect: [
    { kind: "vowel", dur: 0.1, f0: 100, f1: 560, f2: 980, noise: 0.07, gain: 1 },
    { kind: "noise", dur: 0.03, f0: 112, f1: 480, f2: 1600, noise: 0.5, gain: 0.8 },
    { kind: "vowel", dur: 0.14, f0: 118, f1: 700, f2: 1220, noise: 0.06, gain: 1.08 },
    { kind: "vowel", dur: 0.24, f0: 80, f1: 460, f2: 780, noise: 0.04, gain: 1.16 },
  ],
  unstoppable: [
    { kind: "vowel", dur: 0.1, f0: 92, f1: 380, f2: 800, noise: 0.08, gain: 0.95 },
    { kind: "noise", dur: 0.04, f0: 104, f1: 500, f2: 1600, noise: 0.6, gain: 0.85 },
    { kind: "vowel", dur: 0.12, f0: 118, f1: 680, f2: 1200, noise: 0.06, gain: 1.05 },
    { kind: "vowel", dur: 0.08, f0: 108, f1: 500, f2: 1100, noise: 0.04, gain: 0.85 },
    { kind: "vowel", dur: 0.24, f0: 78, f1: 460, f2: 780, noise: 0.05, gain: 1.18 },
  ],
  legendary: [
    { kind: "vowel", dur: 0.1, f0: 96, f1: 520, f2: 900, noise: 0.07, gain: 1 },
    { kind: "vowel", dur: 0.12, f0: 112, f1: 640, f2: 1280, noise: 0.06, gain: 1.05 },
    { kind: "noise", dur: 0.035, f0: 100, f1: 480, f2: 1500, noise: 0.55, gain: 0.8 },
    { kind: "vowel", dur: 0.14, f0: 90, f1: 560, f2: 980, noise: 0.05, gain: 1.08 },
    { kind: "vowel", dur: 0.28, f0: 72, f1: 430, f2: 740, noise: 0.04, gain: 1.2 },
  ],
  attack: [
    { kind: "vowel", dur: 0.08, f0: 126, f1: 720, f2: 1400, noise: 0.1, gain: 0.95 },
    { kind: "noise", dur: 0.04, f0: 110, f1: 500, f2: 1800, noise: 0.7, gain: 0.9 },
    { kind: "vowel", dur: 0.2, f0: 88, f1: 540, f2: 900, noise: 0.05, gain: 1.1 },
  ],
  critical: [
    { kind: "noise", dur: 0.04, f0: 118, f1: 500, f2: 1900, noise: 0.68, gain: 0.9 },
    { kind: "vowel", dur: 0.1, f0: 122, f1: 620, f2: 1320, noise: 0.07, gain: 1 },
    { kind: "vowel", dur: 0.08, f0: 108, f1: 480, f2: 1100, noise: 0.04, gain: 0.85 },
    { kind: "vowel", dur: 0.22, f0: 86, f1: 500, f2: 820, noise: 0.05, gain: 1.14 },
  ],
  massive_hit: [
    { kind: "vowel", dur: 0.1, f0: 100, f1: 620, f2: 1080, noise: 0.08, gain: 1 },
    { kind: "vowel", dur: 0.12, f0: 90, f1: 480, f2: 860, noise: 0.05, gain: 1.05 },
    { kind: "noise", dur: 0.035, f0: 110, f1: 420, f2: 1600, noise: 0.6, gain: 0.85 },
    { kind: "vowel", dur: 0.22, f0: 78, f1: 500, f2: 800, noise: 0.05, gain: 1.16 },
  ],
  danger: [
    { kind: "noise", dur: 0.05, f0: 140, f1: 600, f2: 2100, noise: 0.8, gain: 1 },
    { kind: "vowel", dur: 0.12, f0: 148, f1: 720, f2: 1400, noise: 0.1, gain: 1.1 },
    { kind: "vowel", dur: 0.22, f0: 120, f1: 540, f2: 980, noise: 0.08, gain: 1.15 },
  ],
  final_seconds: [
    { kind: "noise", dur: 0.04, f0: 132, f1: 520, f2: 1800, noise: 0.65, gain: 0.9 },
    { kind: "vowel", dur: 0.1, f0: 136, f1: 680, f2: 1280, noise: 0.08, gain: 1.05 },
    { kind: "vowel", dur: 0.1, f0: 118, f1: 500, f2: 1000, noise: 0.05, gain: 0.95 },
    { kind: "vowel", dur: 0.22, f0: 102, f1: 560, f2: 900, noise: 0.06, gain: 1.12 },
  ],
  freeze: [
    { kind: "noise", dur: 0.05, f0: 160, f1: 900, f2: 2400, noise: 0.55, gain: 0.8 },
    { kind: "vowel", dur: 0.12, f0: 104, f1: 420, f2: 1600, noise: 0.12, gain: 1 },
    { kind: "vowel", dur: 0.22, f0: 78, f1: 360, f2: 1100, noise: 0.08, gain: 1.08 },
  ],
  timeshift: [
    { kind: "noise", dur: 0.04, f0: 108, f1: 480, f2: 1600, noise: 0.5, gain: 0.8 },
    { kind: "vowel", dur: 0.1, f0: 96, f1: 540, f2: 980, noise: 0.06, gain: 1 },
    { kind: "vowel", dur: 0.14, f0: 128, f1: 700, f2: 1400, noise: 0.07, gain: 1.05 },
    { kind: "vowel", dur: 0.18, f0: 84, f1: 480, f2: 860, noise: 0.05, gain: 1.1 },
  ],
  rewind: [
    { kind: "vowel", dur: 0.1, f0: 130, f1: 620, f2: 1300, noise: 0.08, gain: 0.95 },
    { kind: "vowel", dur: 0.12, f0: 92, f1: 500, f2: 980, noise: 0.05, gain: 1 },
    { kind: "vowel", dur: 0.2, f0: 70, f1: 400, f2: 760, noise: 0.04, gain: 1.1 },
  ],
  ready: [
    { kind: "vowel", dur: 0.1, f0: 102, f1: 560, f2: 1100, noise: 0.06, gain: 0.8 },
    { kind: "noise", dur: 0.03, f0: 96, f1: 420, f2: 1500, noise: 0.45, gain: 0.7 },
    { kind: "vowel", dur: 0.22, f0: 88, f1: 500, f2: 860, noise: 0.04, gain: 0.95 },
  ],
  fight: [
    { kind: "noise", dur: 0.045, f0: 118, f1: 500, f2: 1900, noise: 0.75, gain: 1 },
    { kind: "vowel", dur: 0.12, f0: 126, f1: 680, f2: 1280, noise: 0.08, gain: 1.08 },
    { kind: "vowel", dur: 0.22, f0: 86, f1: 480, f2: 820, noise: 0.05, gain: 1.16 },
  ],
  time: [
    { kind: "noise", dur: 0.04, f0: 128, f1: 520, f2: 1700, noise: 0.6, gain: 0.9 },
    { kind: "vowel", dur: 0.28, f0: 94, f1: 540, f2: 920, noise: 0.06, gain: 1.12 },
  ],
  victory: [
    { kind: "vowel", dur: 0.1, f0: 110, f1: 640, f2: 1180, noise: 0.06, gain: 1 },
    { kind: "noise", dur: 0.03, f0: 122, f1: 480, f2: 1600, noise: 0.5, gain: 0.85 },
    { kind: "vowel", dur: 0.12, f0: 132, f1: 720, f2: 1400, noise: 0.06, gain: 1.1 },
    { kind: "vowel", dur: 0.32, f0: 98, f1: 540, f2: 880, noise: 0.04, gain: 1.22 },
  ],
  defeat: [
    { kind: "noise", dur: 0.05, f0: 92, f1: 400, f2: 1200, noise: 0.5, gain: 0.85 },
    { kind: "vowel", dur: 0.16, f0: 86, f1: 480, f2: 900, noise: 0.06, gain: 1 },
    { kind: "vowel", dur: 0.32, f0: 62, f1: 360, f2: 700, noise: 0.04, gain: 1.1 },
  ],
  draw: [
    { kind: "noise", dur: 0.04, f0: 100, f1: 420, f2: 1400, noise: 0.55, gain: 0.85 },
    { kind: "vowel", dur: 0.26, f0: 82, f1: 500, f2: 860, noise: 0.05, gain: 1.05 },
  ],
};

const INTENSITY: Record<VoiceIntensity, { gain: number; f0: number; bass: number; stretch: number }> = {
  subtle: { gain: 0.38, f0: 1, bass: 0.35, stretch: 1 },
  energetic: { gain: 0.58, f0: 1.04, bass: 0.7, stretch: 0.96 },
  powerful: { gain: 0.74, f0: 0.96, bass: 1, stretch: 1 },
  dramatic: { gain: 0.88, f0: 0.9, bass: 1.15, stretch: 1.08 },
  urgent: { gain: 0.7, f0: 1.14, bass: 0.85, stretch: 0.9 },
  triumphant: { gain: 0.82, f0: 1.02, bass: 1.05, stretch: 1.06 },
};

export class Announcer {
  enabled = true;
  private state: VoiceState = freshVoiceState();
  private pending: Pending[] = [];
  private voices: AudioScheduledSourceNode[] = [];
  private gains: GainNode[] = [];
  private assetMap: Partial<Record<VoiceLineId, string>> = {};
  private lastSpoken: VoiceLineId | null = null;
  private lastSpokenAt = 0;
  onSpeak: ((id: VoiceLineId) => void) | null = null;

  constructor(private bus: AudioBus) {
    void this.loadManifest();
  }

  configure(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  reset(): void {
    this.stop();
    this.state = freshVoiceState();
    this.pending = [];
    this.lastSpoken = null;
  }

  get current(): VoiceLineId | null {
    return this.state.current;
  }

  get lastLine(): VoiceLineId | null {
    return this.lastSpoken;
  }

  get lastLineAt(): number {
    return this.lastSpokenAt;
  }

  get lastComboAt(): number {
    return this.state.lastComboAt;
  }

  submit(id: VoiceLineId, now: number): VoiceAction {
    if (!this.enabled || !this.bus.sfxOn) return "drop";
    const result = arbitrate(this.state, id, now);
    this.state = result.state;
    if (result.action === "play" || result.action === "interrupt") {
      if (result.action === "interrupt") this.stopVoices();
      this.playLine(id);
      this.lastSpoken = id;
      this.lastSpokenAt = now;
      this.pending = this.pending.filter((p) => VOICE[p.id].priority > VOICE[id].priority);
      this.onSpeak?.(id);
    }
    return result.action;
  }

  schedule(id: VoiceLineId, delayMs: number, now: number): void {
    if (!this.enabled || !this.bus.sfxOn) return;
    if (delayMs <= 0) {
      this.submit(id, now);
      return;
    }
    this.pending.push({ id, at: now + delayMs });
  }

  tick(now: number): VoiceLineId | null {
    if (!this.enabled) return null;
    this.pending = this.pending.filter((p) => {
      if (now < p.at) return true;
      this.submit(p.id, now);
      return false;
    });
    const flushed = flushQueue(this.state, now);
    this.state = flushed.state;
    if (flushed.play) {
      this.playLine(flushed.play);
      this.lastSpoken = flushed.play;
      this.lastSpokenAt = now;
      this.onSpeak?.(flushed.play);
      return flushed.play;
    }
    return null;
  }

  private playLine(id: VoiceLineId): void {
    if (this.bus.playVoice(id)) {
      const duck = id === "ultimate" ? 0.16 : id === "combo" ? 0.12 : 0.1;
      this.bus.duck(duck, VOICE[id].durationMs / 1000);
      return;
    }
    const asset = this.assetMap[id];
    if (asset) {
      const played = this.playAsset(asset, VOICE[id].intensity);
      if (played) {
        this.bus.duck(0.32, VOICE[id].durationMs / 1000);
        this.bus.impact(VOICE[id].intensity);
        return;
      }
    }
    this.bus.duck(0.28, VOICE[id].durationMs / 1000);
    this.bus.impact(VOICE[id].intensity);
    this.synthesize(id);
  }

  private assetEls = new Map<string, HTMLAudioElement[]>();

  private playAsset(url: string, intensity: VoiceIntensity): boolean {
    try {
      const ctx = this.bus.ensure();
      if (!ctx) return false;
      let pool = this.assetEls.get(url);
      if (!pool) {
        pool = [];
        this.assetEls.set(url, pool);
      }
      let el = pool.find((a) => a.paused || a.ended);
      if (!el) {
        if (pool.length >= 2) {
          el = pool[0]!;
        } else {
          el = new Audio(url);
          el.preload = "auto";
          pool.push(el);
        }
      }
      const level = this.bus.sfxLevel;
      if (level <= 0) return false;
      el.volume = Math.min(1, (INTENSITY[intensity].gain + 0.15) * level);
      try {
        el.currentTime = 0;
      } catch {
        /* some WebViews reject currentTime before metadata */
      }
      void el.play();
      return true;
    } catch {
      return false;
    }
  }

  private synthesize(id: VoiceLineId): void {
    const ctx = this.bus.ensure();
    const dest = this.bus.output();
    if (!ctx || !dest) return;
    const line = VOICE[id];
    const profile = INTENSITY[line.intensity];
    const phones = PHONES[id];
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(dest);
    this.gains.push(master);
    this.pruneVoices();

    const t0 = ctx.currentTime + 0.012;
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(profile.gain * 0.55, t0 + 0.03);

    this.subHit(ctx, master, t0, profile.bass, line.intensity);

    let cursor = t0;
    for (const phone of phones) {
      const dur = phone.dur * profile.stretch;
      this.renderPhone(ctx, master, cursor, dur, phone, profile);
      cursor += dur;
    }
    master.gain.setValueAtTime(profile.gain * 0.5, cursor - 0.04);
    master.gain.exponentialRampToValueAtTime(0.0001, cursor + 0.08);
  }

  private subHit(ctx: AudioContext, dest: GainNode, t: number, bass: number, intensity: VoiceIntensity): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(intensity === "urgent" ? 72 : 56, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * bass, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.24);
    this.voices.push(osc);
  }

  private renderPhone(
    ctx: AudioContext,
    dest: GainNode,
    t: number,
    dur: number,
    phone: Phone,
    profile: { gain: number; f0: number; bass: number; stretch: number },
  ): void {
    const f0 = phone.f0 * profile.f0;
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = "sawtooth";
    b.type = "triangle";
    a.frequency.setValueAtTime(f0, t);
    b.frequency.setValueAtTime(f0 * 0.5, t);
    a.frequency.linearRampToValueAtTime(f0 * 0.92, t + dur);
    b.frequency.linearRampToValueAtTime(f0 * 0.46, t + dur);

    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = phone.f1;
    f1.Q.value = 7.5;
    const f2 = ctx.createBiquadFilter();
    f2.type = "bandpass";
    f2.frequency.value = phone.f2;
    f2.Q.value = 6.2;
    const presence = ctx.createBiquadFilter();
    presence.type = "peaking";
    presence.frequency.value = 2200;
    presence.Q.value = 1.1;
    presence.gain.value = 4.5;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * phone.gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    a.connect(f1);
    b.connect(f1);
    f1.connect(f2).connect(presence).connect(g).connect(dest);
    a.start(t);
    b.start(t);
    a.stop(t + dur + 0.02);
    b.stop(t + dur + 0.02);
    this.voices.push(a, b);

    if (phone.noise > 0.08) {
      const n = this.noiseBurst(ctx, t, Math.min(0.05, dur * 0.45), phone.noise * 0.08 * profile.gain);
      n.connect(dest);
    }
    if (profile.gain > 0.7) {
      const fifth = ctx.createOscillator();
      const fg = ctx.createGain();
      fifth.type = "triangle";
      fifth.frequency.value = f0 * 1.5;
      fg.gain.setValueAtTime(0.0001, t);
      fg.gain.exponentialRampToValueAtTime(0.045, t + 0.02);
      fg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      fifth.connect(fg).connect(dest);
      fifth.start(t);
      fifth.stop(t + dur + 0.02);
      this.voices.push(fifth);
    }
  }

  private noiseBurst(ctx: AudioContext, t: number, dur: number, gain: number): GainNode {
    const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp).connect(g);
    src.start(t);
    src.stop(t + dur);
    this.voices.push(src);
    return g;
  }

  private pruneVoices(): void {
    if (this.gains.length > 8) {
      const drop = this.gains.splice(0, this.gains.length - 6);
      for (const g of drop) {
        try {
          g.disconnect();
        } catch {
          /* already disconnected */
        }
      }
    }
    if (this.voices.length > 24) {
      const drop = this.voices.splice(0, this.voices.length - 16);
      for (const v of drop) {
        try {
          v.disconnect();
        } catch {
          /* already disconnected */
        }
      }
    }
  }

  private stopVoices(): void {
    for (const v of this.voices) {
      try {
        v.stop();
      } catch {
        /* already stopped */
      }
      try {
        v.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    for (const g of this.gains) {
      try {
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.voices = [];
    this.gains = [];
  }

  private stop(): void {
    this.stopVoices();
    this.pending = [];
  }

  private async loadManifest(): Promise<void> {
    try {
      const res = await fetch("/voice/manifest.json", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as Record<string, string>;
      for (const [key, file] of Object.entries(json)) {
        if (key in VOICE && file) this.assetMap[key as VoiceLineId] = `/voice/${file.replace(/^\/voice\//, "")}`;
      }
    } catch {
      /* synth fallback */
    }
  }
}
