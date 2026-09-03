import { LOOPING_BEDS, MusicBed } from "./catalog";

export type { MusicBed } from "./catalog";
export type MusicSting = "start" | "win" | "lose" | "draw";

/** Procedural fallback voicing when drop-in WAV masters are not decoded yet. */
export const LOBBY_BED = {
  freqs: [55, 110, 164.81, 220],
  types: ["sine", "sine", "triangle", "sine"] as const,
  filter: 420,
  lfo: 0.07,
  lfoDepth: 36,
};

export const BATTLE_BED = {
  freqs: [73.42, 146.83, 196, 293.66],
  types: ["sine", "triangle", "sine", "sawtooth"] as const,
  filter: 640,
  lfo: 1.12,
  lfoDepth: 72,
};

export const VICTORY_BED = {
  freqs: [110, 164.81, 220, 329.63],
  types: ["sine", "sine", "triangle", "sine"] as const,
  filter: 920,
  lfo: 0.35,
  lfoDepth: 28,
};

export const DEFEAT_BED = {
  freqs: [82.41, 110, 146.83, 196],
  types: ["sine", "triangle", "sine", "sine"] as const,
  filter: 380,
  lfo: 0.12,
  lfoDepth: 18,
};

export const DRAW_BED = {
  freqs: [98, 146.83, 196, 293.66],
  types: ["sine", "sine", "triangle", "sine"] as const,
  filter: 520,
  lfo: 0.2,
  lfoDepth: 22,
};

export interface MusicSceneInput {
  screen: string;
  phase: string;
  outcome?: string | null;
}

export function bedFromOutcome(outcome: string | undefined | null): MusicBed {
  if (outcome === "win") return "victory";
  if (outcome === "loss") return "defeat";
  if (outcome === "tie") return "draw";
  return "none";
}

export function bedFromScene(input: MusicSceneInput): MusicBed {
  if (input.screen === "splash") return "none";
  if (input.screen === "match") {
    if (input.phase === "countdown" || input.phase === "playing" || input.phase === "paused") return "battle";
    if (input.phase === "ended") return bedFromOutcome(input.outcome);
    return "none";
  }
  if (input.screen === "results" || input.screen === "rewards") return bedFromOutcome(input.outcome);
  return "lobby";
}

export function stingFromOutcome(outcome: string | undefined | null): MusicSting | null {
  if (outcome === "win") return "win";
  if (outcome === "loss") return "lose";
  if (outcome === "tie") return "draw";
  return null;
}

export function bedLoops(bed: MusicBed): boolean {
  return LOOPING_BEDS.has(bed);
}

const RESULT_STINGS: MusicSting[] = ["win", "lose", "draw"];

export class MusicDirector {
  bed: MusicBed = "none";
  musicOn = true;
  private stings = new Set<string>();

  configure(musicOn: boolean): void {
    this.musicOn = musicOn;
    if (!musicOn) this.bed = "none";
  }

  setBed(next: MusicBed): "keep" | "start" | "replace" | "stop" {
    const wanted = this.musicOn ? next : "none";
    if (wanted === this.bed) return "keep";
    const prev = this.bed;
    if (wanted === "battle" && prev !== "battle") this.stings.clear();
    this.bed = wanted;
    if (wanted === "none") return "stop";
    return prev === "none" ? "start" : "replace";
  }

  takeSting(kind: MusicSting, key: string): boolean {
    if (!key) return false;
    const id = `${kind}:${key}`;
    if (this.stings.has(id)) return false;
    if (RESULT_STINGS.includes(kind)) {
      for (const sting of this.stings) {
        if (RESULT_STINGS.some((result) => sting.startsWith(`${result}:`))) return false;
      }
    }
    this.stings.add(id);
    return true;
  }

  reset(): void {
    this.stings.clear();
  }
}
