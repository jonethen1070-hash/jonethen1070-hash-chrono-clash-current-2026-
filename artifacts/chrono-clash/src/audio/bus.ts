import { Intensity } from "../engine/types";
import { VoiceIntensity } from "./voice";
import {
  matchWaveAsset,
  musicAsset,
  sfxVariantIds,
  swapWaveAsset,
  uniqueAudioAssets,
  voiceAsset,
  type Cue,
} from "./catalog";
import { candidateUrls, decodeAudioBuffer, fetchAudioBuffer } from "./resolve";
import {
  BATTLE_BED,
  DEFEAT_BED,
  DRAW_BED,
  LOBBY_BED,
  MusicBed,
  MusicDirector,
  MusicSting,
  VICTORY_BED,
  bedLoops,
} from "./scene";

export type { Cue } from "./catalog";

const SFX_GAP: Partial<Record<Cue, number>> = {
  select: 55,
  place: 55,
  swap: 70,
  match: 80,
  score: 90,
  oppscore: 110,
  combo: 120,
  highcombo: 180,
  incoming: 260,
  impact: 200,
  countdown: 90,
  ui: 80,
  search: 1500,
  warning: 900,
  critical: 700,
  deny: 220,
};

const MAX_SFX_VOICES = 10;
const DEFAULT_SFX_VOLUME = 0.84;
const DEFAULT_MUSIC_VOLUME = 0.72;

type BedPatch = {
  freqs: number[];
  types: readonly OscillatorType[];
  filter: number;
  lfo: number;
  lfoDepth: number;
};

function bedPatch(bed: Exclude<MusicBed, "none">): BedPatch {
  if (bed === "lobby") return LOBBY_BED;
  if (bed === "battle") return BATTLE_BED;
  if (bed === "victory") return VICTORY_BED;
  if (bed === "defeat") return DEFEAT_BED;
  return DRAW_BED;
}

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private voiceSource: AudioBufferSourceNode | null = null;
  private voiceGain: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private bedOsc: OscillatorNode[] = [];
  private bedExtras: AudioNode[] = [];
  private musicSource: AudioBufferSourceNode | null = null;
  private musicSources = new Set<AudioBufferSourceNode>();
  private fadingSources = new Set<AudioBufferSourceNode>();
  private director = new MusicDirector();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private lastCueAt = new Map<Cue, number>();
  private variantAt = new Map<Cue, number>();
  private buffers = new Map<string, AudioBuffer>();
  private loadedFrom = new Map<string, string>();
  private raw = new Map<string, { url: string; data: ArrayBuffer }>();
  private loading = false;
  private prefetching = false;
  private unlocked = false;
  private catalogReady = false;
  private ready: Promise<void> = Promise.resolve();
  private sfxVoices = 0;
  private swapWave = 0;
  sfxOn = true;
  musicOn = true;
  sfxVolume = DEFAULT_SFX_VOLUME;
  musicVolume = DEFAULT_MUSIC_VOLUME;
  intensity: Intensity = "high";

  get musicBed(): MusicBed {
    return this.director.bed;
  }

  get musicNodeCount(): number {
    return this.bedOsc.length + this.musicSources.size;
  }

  get musicPlayback(): "file" | "procedural" | "none" {
    if (this.director.bed === "none" || !this.musicOn) return "none";
    if (this.musicSources.size) return "file";
    if (this.bedOsc.length) return "procedural";
    return "none";
  }

  status(): {
    unlocked: boolean;
    catalogReady: boolean;
    musicBed: MusicBed;
    musicPlayback: "file" | "procedural" | "none";
    sfxOn: boolean;
    musicOn: boolean;
    sfxVolume: number;
    musicVolume: number;
    loaded: string[];
    sources: Record<string, string>;
    missing: string[];
  } {
    return {
      unlocked: this.unlocked,
      catalogReady: this.catalogReady,
      musicBed: this.director.bed,
      musicPlayback: this.musicPlayback,
      sfxOn: this.sfxOn,
      musicOn: this.musicOn,
      sfxVolume: this.sfxVolume,
      musicVolume: this.musicVolume,
      loaded: [...this.buffers.keys()],
      sources: Object.fromEntries(this.loadedFrom),
      missing: uniqueAudioAssets().filter((item) => !this.buffers.has(item.id)).map((item) => item.id),
    };
  }

  whenReady(): Promise<void> {
    if (this.unlocked && !this.catalogReady && !this.loading) this.warm();
    return this.ready;
  }

  get sfxLevel(): number {
    return this.sfxOn ? this.sfxVolume : 0;
  }

  get musicLevel(): number {
    return this.musicOn ? this.musicVolume : 0;
  }

  configure(sfx: boolean, music: boolean, intensity: Intensity, sfxVolume?: number, musicVolume?: number): void {
    this.sfxOn = sfx;
    this.musicOn = music;
    this.intensity = intensity;
    if (sfxVolume != null) this.sfxVolume = clamp01(sfxVolume);
    if (musicVolume != null) this.musicVolume = clamp01(musicVolume);
    this.director.configure(music);
    this.applyGains();
    if (!sfx) {
      this.clearTimers();
      this.stopVoice();
    }
    if (!music) this.stopBed(false);
    else if (this.musicBus) this.musicBus.gain.value = this.bedLevel(this.director.bed);
  }

  setVolumes(sfxVolume: number, musicVolume: number): void {
    this.sfxVolume = clamp01(sfxVolume);
    this.musicVolume = clamp01(musicVolume);
    this.applyGains();
    if (this.musicBus && this.musicOn) this.musicBus.gain.value = this.bedLevel(this.director.bed);
  }

  ensure(): AudioContext | null {
    return this.audio();
  }

  output(): GainNode | null {
    this.audio();
    return this.sfxGain;
  }

  warm(): void {
    this.unlocked = true;
    const ctx = this.audio();
    if (!ctx) return;
    if (this.catalogReady || this.loading) return;
    this.loading = true;
    this.ready = this.loadAssets(ctx);
  }

  /** Fetch and decode lobby audio without starting playback so it can begin the instant the splash ends. */
  prefetch(): void {
    if (this.prefetching || this.catalogReady) return;
    this.prefetching = true;
    void this.prefetchLobbyThenRest();
  }

  suspend(): void {
    try {
      void this.ctx?.suspend();
    } catch {
      /* ignore */
    }
  }

  resume(): void {
    try {
      void this.ctx?.resume();
    } catch {
      /* ignore */
    }
  }

  duck(amount: number, seconds: number): void {
    if (!this.musicBus || !this.ctx || this.director.bed === "none") return;
    const t = this.ctx.currentTime;
    const base = this.bedLevel(this.director.bed);
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.linearRampToValueAtTime(base * (1 - amount), t + 0.04);
    this.musicBus.gain.setValueAtTime(base * (1 - amount), t + seconds);
    this.musicBus.gain.linearRampToValueAtTime(base, t + seconds + 0.18);
  }

  impact(kind: VoiceIntensity | "combo" = "energetic"): void {
    if (!this.sfxOn) return;
    if (this.playAssetCue("impact")) return;
    const heavy = kind === "dramatic" || kind === "triumphant" || kind === "powerful";
    const urgent = kind === "urgent";
    this.tone(heavy ? 62 : urgent ? 88 : 78, heavy ? 0.16 : 0.1, "sine", heavy ? 0.07 : 0.04);
    if (heavy) this.tone(48, 0.2, "triangle", 0.05, 0.02);
    if (heavy) this.noise(0.09, 0.045);
  }

  syncBed(bed: MusicBed): void {
    const action = this.director.setBed(bed);
    if (action === "keep") {
      if (bedLoops(bed) && this.musicOn && this.musicNodeCount === 0) this.spawnBed(bed);
      return;
    }
    if (action === "stop") {
      this.stopBed(true);
      return;
    }
    this.stopBed(true);
    if (bed !== "none") this.spawnBed(bed);
  }

  playFinale(kind: Extract<MusicSting, "win" | "lose" | "draw">, key = kind): boolean {
    if (!this.director.takeSting(kind, key)) return false;
    const bed: MusicBed = kind === "win" ? "victory" : kind === "lose" ? "defeat" : "draw";
    this.syncBed(bed);
    if (!this.sfxOn && !this.musicOn) return false;
    if (this.sfxOn) {
      const cue: Cue = kind === "win" ? "win" : kind === "lose" ? "lose" : "draw";
      if (!this.playAssetCue(cue)) this.playTheme(kind);
    }
    return true;
  }

  playMatchStart(key = "clash"): boolean {
    if (!this.director.takeSting("start", key)) return false;
    this.play("clash");
    this.duck(0.55, 0.42);
    return true;
  }

  playLater(cue: Cue, delayMs: number, combo = 1): void {
    if (!this.sfxOn) return;
    if (delayMs <= 0) {
      this.play(cue, combo);
      return;
    }
    this.defer(() => this.play(cue, combo), delayMs);
  }

  play(cue: Cue, combo = 1): void {
    if (cue === "win" || cue === "lose" || cue === "draw") {
      this.playFinale(cue === "win" ? "win" : cue === "lose" ? "lose" : "draw");
      return;
    }
    if (!this.sfxOn) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const gap = SFX_GAP[cue] ?? 0;
    const prev = this.lastCueAt.get(cue) ?? 0;
    if (gap && prev && now - prev < gap) return;
    this.lastCueAt.set(cue, now);
    if (this.sfxVoices >= MAX_SFX_VOICES && cue !== "freeze" && cue !== "timeshift" && cue !== "clash") return;
    if (cue === "clash") this.duck(0.28, 0.28);
    if (this.playAssetCue(cue, combo)) return;
    this.playSynthCue(cue, combo);
  }

  /** Plays exactly one uploaded match-wave sample; waves 5+ share match_5.wav. */
  playMatchWave(wave = 1): void {
    if (!this.sfxOn || this.sfxVoices >= MAX_SFX_VOICES) return;
    if (this.playAssetById(matchWaveAsset(wave).id, "match", wave)) return;
    this.playSynthCue("match", wave);
  }

  /** Plays exactly one uploaded swap sample for each committed valid player swap. */
  playSwapWave(): void {
    this.swapWave = Math.min(5, this.swapWave + 1);
    const wave = this.swapWave;
    if (!this.sfxOn || this.sfxVoices >= MAX_SFX_VOICES) return;
    if (this.playAssetById(swapWaveAsset(wave).id, "swap", wave)) return;
    this.playSynthCue("swap", wave);
  }

  resetSwapWave(): void {
    this.swapWave = 0;
  }

  /** Spoken gameplay callouts ride a dedicated bus so they sit above crystal SFX without extra duck. */
  playVoice(id: string): boolean {
    if (!this.sfxOn) return false;
    const asset = voiceAsset(id);
    const ctx = this.audio();
    if (!asset || !ctx || !this.voiceBus || typeof ctx.createBufferSource !== "function") return false;
    const buffer = this.buffers.get(asset.id);
    if (!buffer) return false;
    this.stopVoice();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    const cueGain = id === "ultimate" ? 1.28 : id === "combo" ? 1.18 : 1.05;
    const level = (this.intensity === "low" ? 0.7 : 1) * cueGain;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(level, t);
    src.connect(g).connect(this.voiceBus);
    src.onended = () => {
      if (this.voiceSource === src) this.stopVoice();
    };
    src.start(t);
    this.voiceSource = src;
    this.voiceGain = g;
    return true;
  }

  startMusic(): void {
    this.ensure();
    this.warm();
    if (!this.musicOn) return;
    if (this.director.bed !== "none") this.syncBed(this.director.bed);
  }

  stopMusic(): void {
    this.director.setBed("none");
    this.stopBed(false);
    this.clearTimers();
  }

  private stopVoice(): void {
    const src = this.voiceSource;
    const gain = this.voiceGain;
    this.voiceSource = null;
    this.voiceGain = null;
    if (src) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      try {
        src.disconnect();
      } catch {
        /* ignore */
      }
    }
    try {
      gain?.disconnect();
    } catch {
      /* ignore */
    }
  }

  dispose(): void {
    this.clearTimers();
    this.stopBed(false);
    this.stopVoice();
    this.buffers.clear();
    this.loadedFrom.clear();
    this.raw.clear();
    this.loading = false;
    this.prefetching = false;
    this.unlocked = false;
    this.catalogReady = false;
    this.ready = Promise.resolve();
    try {
      void this.ctx?.close();
    } catch {
      /* already closed */
    }
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.voiceBus = null;
    this.voiceSource = null;
    this.voiceGain = null;
    this.director.reset();
  }

  private audio(): AudioContext | null {
    if (typeof AudioContext === "undefined") return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.voiceBus = this.ctx.createGain();
      this.musicGain.connect(this.master);
      const sfxOut: AudioNode = this.attachSfxChain(this.ctx, this.sfxGain);
      sfxOut.connect(this.master);
      this.voiceBus.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyGains();
    }
    if (this.unlocked || this.ctx.state !== "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private attachSfxChain(ctx: AudioContext, input: GainNode): AudioNode {
    let node: AudioNode = input;
    if (typeof ctx.createBiquadFilter === "function") {
      const shelf = ctx.createBiquadFilter();
      if (shelf.gain && shelf.frequency) {
        shelf.type = "highshelf";
        shelf.frequency.value = 7200;
        shelf.gain.value = -3.2;
        node.connect(shelf);
        node = shelf;
      }
    }
    if (typeof ctx.createDynamicsCompressor === "function") {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 8;
      comp.ratio.value = 2.4;
      comp.attack.value = 0.002;
      comp.release.value = 0.12;
      node.connect(comp);
      node = comp;
    }
    return node;
  }

  private applyGains(): void {
    const silent = !this.sfxOn && !this.musicOn;
    if (this.master) this.master.gain.value = silent ? 0 : 1;
    if (this.musicGain) this.musicGain.gain.value = this.musicOn ? this.musicVolume : 0;
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxOn ? this.sfxVolume : 0;
    if (this.voiceBus) this.voiceBus.gain.value = this.sfxOn ? this.sfxVolume : 0;
  }

  private bedLevel(bed: MusicBed): number {
    if (!this.musicOn || bed === "none") return 0;
    const asset = musicAsset(bed);
    const file = Boolean(asset && this.buffers.has(asset.id));
    const table: Record<Exclude<MusicBed, "none">, number> = file
      ? { lobby: 0.38, battle: 0.75, victory: 0.46, defeat: 0.4, draw: 0.34 }
      : { lobby: 0.075, battle: 0.048, victory: 0.09, defeat: 0.08, draw: 0.07 };
    return table[bed];
  }

  private spawnBed(bed: MusicBed): void {
    if (!this.musicOn || bed === "none" || this.musicNodeCount) return;
    const ctx = this.audio();
    if (!ctx || !this.musicGain) return;
    const asset = musicAsset(bed);
    const buffer = asset ? this.buffers.get(asset.id) : undefined;
    if (bed === "battle" && !buffer) return;
    const bus = ctx.createGain();
    bus.gain.value = 0.0001;
    const t = ctx.currentTime;
    bus.gain.linearRampToValueAtTime(this.bedLevel(bed), t + (bed === "battle" ? 0.18 : bed === "lobby" ? 0.05 : 0.06));
    bus.connect(this.musicGain);
    this.musicBus = bus;
    if (buffer && typeof ctx.createBufferSource === "function") {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = Boolean(asset?.loop);
      if (src.loop && asset) {
        src.loopStart = asset.loopStartSec;
        src.loopEnd = Math.min(buffer.duration, asset.loopEndSec || buffer.duration);
      }
      src.connect(bus);
      src.start(t);
      src.onended = () => {
        this.musicSources.delete(src);
        if (this.musicSource === src) this.musicSource = null;
        try {
          src.disconnect();
        } catch {
          /* ignore */
        }
      };
      this.musicSources.add(src);
      this.musicSource = src;
      return;
    }
    if (bed === "lobby" || bed === "battle" || bed === "victory" || bed === "defeat" || bed === "draw") {
      this.spawnProcedural(ctx, bus, bed);
    }
  }

  private spawnProcedural(ctx: AudioContext, bus: GainNode, bed: Exclude<MusicBed, "none">): void {
    const patch = bedPatch(bed);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = patch.filter;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = patch.lfo;
    lfoGain.gain.value = patch.lfoDepth;
    patch.freqs.forEach((hz, i) => {
      this.startOsc(ctx, filter, patch.types[i] ?? "sine", hz, i === 2 ? -4 : i * 3);
    });
    if (bed === "battle") {
      const pulse = ctx.createOscillator();
      pulse.frequency.value = 1.8;
      const pulseGain = ctx.createGain();
      pulseGain.gain.value = 0.01;
      pulse.connect(pulseGain);
      pulseGain.connect(bus.gain);
      pulse.start();
      this.bedOsc.push(pulse);
      this.bedExtras.push(pulseGain);
    }
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    this.bedOsc.push(lfo);
    this.bedExtras.push(filter, lfoGain);
    filter.connect(bus);
  }

  private startOsc(ctx: AudioContext, dest: AudioNode, type: OscillatorType, freq: number, detune: number): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = type === "sawtooth" ? 0.2 : 0.48;
    osc.connect(g).connect(dest);
    osc.start();
    this.bedOsc.push(osc);
    this.bedExtras.push(g);
  }

  private stopBed(fade: boolean): void {
    const nodes = this.bedOsc;
    const extras = this.bedExtras;
    const gain = this.musicBus;
    const sources = new Set([...this.musicSources, ...this.fadingSources]);
    if (this.musicSource) sources.add(this.musicSource);
    this.bedOsc = [];
    this.bedExtras = [];
    this.musicSources.clear();
    this.fadingSources.clear();
    this.musicBus = null;
    this.musicSource = null;
    if (!gain) {
      this.disposeBed(nodes, extras, gain, [...sources]);
      return;
    }
    if (!fade || !this.ctx) {
      this.disposeBed(nodes, extras, gain, [...sources]);
      return;
    }
    for (const source of sources) this.fadingSources.add(source);
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
    gain.gain.linearRampToValueAtTime(0.0001, t + 0.22);
    this.defer(() => {
      this.disposeBed(nodes, extras, gain, [...sources]);
      for (const source of sources) this.fadingSources.delete(source);
    }, 260);
  }

  private disposeBed(
    nodes: OscillatorNode[],
    extras: AudioNode[],
    gain: GainNode | null,
    sources: AudioBufferSourceNode[],
  ): void {
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
    }
    for (const o of nodes) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
      try {
        o.disconnect();
      } catch {
        /* ignore */
      }
    }
    for (const extra of extras) {
      try {
        extra.disconnect();
      } catch {
        /* ignore */
      }
    }
    try {
      gain?.disconnect();
    } catch {
      /* ignore */
    }
  }

  private playAssetCue(cue: Cue, combo = 1): boolean {
    const ids = sfxVariantIds(cue);
    let id: string | undefined;
    if (ids.length > 1) {
      const idx = this.variantAt.get(cue) ?? 0;
      this.variantAt.set(cue, idx + 1);
      id = ids[idx % ids.length]!;
    } else {
      id = ids[0];
    }
    return id ? this.playAssetById(id, cue, combo) : false;
  }

  private playAssetById(id: string, cue: Cue, combo = 1): boolean {
    const buffer = this.buffers.get(id);
    const ctx = this.ctx;
    if (!buffer || !ctx || !this.sfxGain || typeof ctx.createBufferSource !== "function") return false;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const rate =
      cue === "swap" || cue === "place" || cue === "select" || cue === "match" || cue === "combo" || cue === "highcombo"
        ? 0.988 + Math.random() * 0.024
        : 1;
    src.playbackRate.value = rate;
    const extra =
      cue === "combo" || cue === "highcombo" ? Math.min(0.07, Math.max(0, combo - 2) * 0.014) : 0;
    const cueGain =
      cue === "swap" ? 0.7 :
      cue === "place" || cue === "select" ? 0.64 :
      cue === "match" ? 0.86 :
      cue === "combo" ? 0.95 + extra :
      cue === "highcombo" ? 1.04 + extra :
      cue === "clash" ? 0.8 :
      cue === "impact" || cue === "launch" || cue === "incoming" ? 0.72 :
      0.62;
    const level = (this.intensity === "low" ? 0.55 : 1) * cueGain;
    g.gain.setValueAtTime(level, t);
    src.connect(g).connect(this.sfxGain);
    this.sfxVoices += 1;
    src.onended = () => {
      this.sfxVoices = Math.max(0, this.sfxVoices - 1);
      try {
        src.disconnect();
        g.disconnect();
      } catch {
        /* ignore */
      }
    };
    src.start(t);
    return true;
  }

  private noise(dur: number, gain: number): void {
    const ctx = this.audio();
    if (!ctx || !this.sfxGain || typeof ctx.createBuffer !== "function") return;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const level = gain * (this.intensity === "low" ? 0.55 : 1);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(g).connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
  }

  tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
    if (!this.sfxOn && !this.allowTheme) return;
    const ctx = this.audio();
    if (!ctx || !this.sfxGain) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = Math.min(5200, freq * 4.2);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    const level = gain * (this.intensity === "low" ? 0.55 : 1);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter).connect(g).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  private allowTheme = false;

  private playTheme(kind: Extract<MusicSting, "win" | "lose" | "draw">): void {
    this.allowTheme = true;
    try {
      if (kind === "win") {
        this.tone(261.63, 0.16, "triangle", 0.05);
        this.tone(329.63, 0.18, "triangle", 0.055, 0.1);
        this.tone(392, 0.22, "sine", 0.06, 0.22);
        this.tone(523.25, 0.3, "sine", 0.06, 0.38);
        this.tone(659.25, 0.38, "sine", 0.045, 0.56);
        this.tone(783.99, 0.52, "triangle", 0.032, 0.74);
      } else if (kind === "lose") {
        this.tone(220, 0.32, "sine", 0.05);
        this.tone(174.61, 0.36, "triangle", 0.045, 0.16);
        this.tone(146.83, 0.44, "sine", 0.05, 0.34);
        this.tone(110, 0.52, "triangle", 0.04, 0.5);
        this.tone(82.41, 0.7, "sine", 0.032, 0.68);
      } else {
        this.tone(196, 0.24, "triangle", 0.045);
        this.tone(293.66, 0.3, "sine", 0.04, 0.14);
        this.tone(246.94, 0.34, "sine", 0.03, 0.3);
      }
    } finally {
      this.allowTheme = false;
    }
  }

  private playSynthCue(cue: Cue, combo: number): void {
    switch (cue) {
      case "ui":
        this.tone(980, 0.04, "sine", 0.02);
        this.tone(1560, 0.05, "triangle", 0.01, 0.012);
        break;
      case "confirm":
        this.tone(784, 0.07, "sine", 0.028);
        this.tone(1174.7, 0.09, "triangle", 0.018, 0.05);
        this.tone(1568, 0.08, "sine", 0.01, 0.08);
        break;
      case "select":
      case "place":
        this.tone(740, 0.07, "sine", 0.032);
        this.tone(1480, 0.05, "triangle", 0.014, 0.02);
        break;
      case "swap":
        this.tone(420, 0.08, "triangle", 0.032);
        this.tone(780, 0.1, "sine", 0.022, 0.05);
        break;
      case "invalid":
        this.tone(168, 0.14, "triangle", 0.03);
        this.tone(112, 0.16, "sine", 0.022, 0.05);
        break;
      case "match":
        this.tone(523.25 + combo * 18, 0.11, "triangle", 0.042);
        this.tone(659.25, 0.12, "sine", 0.028, 0.04);
        this.tone(783.99, 0.1, "sine", 0.018, 0.08);
        break;
      case "score":
        this.tone(980, 0.06, "sine", 0.026);
        this.tone(1310, 0.07, "triangle", 0.016, 0.03);
        break;
      case "oppscore":
        this.tone(420, 0.08, "triangle", 0.028);
        this.tone(310, 0.09, "sine", 0.02, 0.04);
        break;
      case "combo":
        this.tone(659.25 + combo * 24, 0.12, "triangle", 0.034);
        this.tone(880, 0.14, "sine", 0.03, 0.05);
        break;
      case "highcombo":
        this.tone(523.25, 0.12, "triangle", 0.04);
        this.tone(659.25, 0.14, "triangle", 0.04, 0.06);
        this.tone(783.99, 0.18, "sine", 0.05, 0.12);
        this.tone(1046.5, 0.2, "sine", 0.028, 0.2);
        break;
      case "warning":
        this.tone(880, 0.09, "sine", 0.03);
        this.tone(880, 0.1, "sine", 0.026, 0.16);
        break;
      case "critical":
        this.tone(740, 0.08, "triangle", 0.032);
        this.tone(620, 0.1, "sine", 0.03, 0.12);
        this.tone(494, 0.14, "sine", 0.034, 0.26);
        break;
      case "freeze":
        this.tone(1480, 0.08, "sine", 0.03);
        this.tone(920, 0.14, "triangle", 0.036, 0.04);
        this.tone(420, 0.22, "sine", 0.038, 0.1);
        this.tone(180, 0.3, "sine", 0.028, 0.16);
        break;
      case "timeshift":
        this.tone(180, 0.18, "triangle", 0.03);
        this.tone(480, 0.14, "sine", 0.032, 0.05);
        this.tone(960, 0.16, "sine", 0.036, 0.1);
        this.tone(1440, 0.12, "sine", 0.02, 0.18);
        break;
      case "rewind":
        this.tone(720, 0.08, "triangle", 0.03);
        this.tone(540, 0.12, "sine", 0.034, 0.05);
        this.tone(360, 0.16, "triangle", 0.034, 0.1);
        this.tone(180, 0.22, "sine", 0.028, 0.16);
        break;
      case "deny":
        this.tone(140, 0.14, "triangle", 0.032);
        this.tone(98, 0.16, "sine", 0.024, 0.05);
        break;
      case "search":
        this.tone(620, 0.12, "sine", 0.024);
        this.tone(820, 0.14, "triangle", 0.018, 0.55);
        break;
      case "found":
        this.tone(392, 0.14, "triangle", 0.036);
        this.tone(523.25, 0.18, "sine", 0.034, 0.1);
        this.tone(659.25, 0.22, "sine", 0.03, 0.22);
        break;
      case "power":
        this.tone(240, 0.16, "triangle", 0.038);
        this.tone(720, 0.12, "sine", 0.028, 0.06);
        break;
      case "countdown":
        this.tone(510, 0.08, "sine", 0.028);
        break;
      case "clash":
        this.tone(196, 0.14, "triangle", 0.04);
        this.tone(246.94, 0.16, "sine", 0.042, 0.05);
        this.tone(329.63, 0.18, "triangle", 0.044, 0.1);
        this.tone(392, 0.22, "sine", 0.048, 0.16);
        this.tone(523.25, 0.24, "sine", 0.03, 0.24);
        break;
      case "launch":
        this.tone(220, 0.1, "triangle", 0.03);
        this.tone(620, 0.12, "sine", 0.028, 0.05);
        break;
      case "incoming":
        this.tone(880, 0.1, "triangle", 0.028);
        this.tone(1100, 0.14, "sine", 0.03, 0.08);
        this.tone(740, 0.12, "sine", 0.02, 0.16);
        break;
      case "impact":
        this.impact("powerful");
        break;
      case "lifelost":
        this.tone(247, 0.18, "sine", 0.036);
        this.tone(185, 0.24, "triangle", 0.032, 0.1);
        break;
      case "lifead":
        this.tone(523.25, 0.14, "triangle", 0.034);
        this.tone(659.25, 0.18, "sine", 0.032, 0.1);
        this.tone(783.99, 0.22, "sine", 0.028, 0.22);
        break;
      case "livesreset":
        this.tone(329.63, 0.16, "sine", 0.032);
        this.tone(392, 0.18, "triangle", 0.03, 0.12);
        this.tone(523.25, 0.24, "sine", 0.034, 0.26);
        this.tone(659.25, 0.28, "sine", 0.026, 0.42);
        break;
    }
  }

  private promoteBedToFile(requestedBed?: MusicBed): void {
    const bed = requestedBed ?? this.director.bed;
    if (bed !== this.director.bed) return;
    const asset = musicAsset(bed);
    if (!this.musicOn || !asset || !this.buffers.has(asset.id)) return;
    if (this.musicSources.size) return;
    this.stopBed(false);
    this.spawnBed(bed);
  }

  private async prefetchLobbyThenRest(): Promise<void> {
    try {
      const assets = uniqueAudioAssets();
      const lobby = assets.filter((item) => item.id === "music-lobby");
      const rest = assets.filter((item) => item.id !== "music-lobby");
      await Promise.all(lobby.map((item) => this.fetchRaw(item)));
      const ctx = this.audio();
      if (ctx) {
        for (const item of lobby) await this.decodeItem(ctx, item);
        this.promoteBedToFile();
      }
      await Promise.all(rest.map((item) => this.fetchRaw(item)));
    } catch {
      /* decode can wait until the first gesture on locked autoplay browsers */
    }
  }

  private async fetchRaw(item: ReturnType<typeof uniqueAudioAssets>[number]): Promise<void> {
    if (this.raw.has(item.id) || this.buffers.has(item.id)) return;
    for (const url of candidateUrls(item.file)) {
      const found = await fetchAudioBuffer([url]);
      if (!found) continue;
      this.raw.set(item.id, found);
      return;
    }
  }

  private async decodeItem(ctx: AudioContext, item: ReturnType<typeof uniqueAudioAssets>[number]): Promise<void> {
    if (this.buffers.has(item.id)) return;
    const cached = this.raw.get(item.id);
    if (cached) {
      try {
        const buffer = await decodeAudioBuffer(ctx, cached.data);
        this.buffers.set(item.id, buffer);
        this.loadedFrom.set(item.id, cached.url);
        this.raw.delete(item.id);
        if (item.id === "music-battle") this.promoteBedToFile("battle");
        return;
      } catch {
        this.raw.delete(item.id);
      }
    }
    for (const url of candidateUrls(item.file)) {
      const found = await fetchAudioBuffer([url]);
      if (!found) continue;
      try {
        const buffer = await decodeAudioBuffer(ctx, found.data);
        this.buffers.set(item.id, buffer);
        this.loadedFrom.set(item.id, found.url);
        if (item.id === "music-battle") this.promoteBedToFile("battle");
        return;
      } catch {
        /* iOS cannot decode ogg; try the next format */
      }
    }
  }

  private async loadAssets(ctx: AudioContext): Promise<void> {
    try {
      try {
        await ctx.resume();
      } catch {
        /* autoplay may still resume after the gesture that called warm() */
      }
      const assets = uniqueAudioAssets();
      const lobby = assets.find((item) => item.id === "music-lobby");
      if (lobby) await this.decodeItem(ctx, lobby);
      this.promoteBedToFile();
      await Promise.all(assets.filter((item) => item.id !== "music-lobby").map((item) => this.decodeItem(ctx, item)));
    } finally {
      this.loading = false;
      this.catalogReady = true;
      this.promoteBedToFile();
    }
  }

  private defer(fn: () => void, ms: number): void {
    const id = globalThis.setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }

  private clearTimers(): void {
    for (const id of this.timers) globalThis.clearTimeout(id);
    this.timers.clear();
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
