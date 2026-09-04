/**
 * Chrono Clash premium audio catalog.
 *
 * Drop replacement files into `public/audio/` using these exact filenames.
 * Game logic reads this table only — swap masters without touching battle code.
 *
 * Identity: dark navy / cyan / crimson cosmic sci-fi. Instrumental score, not UI beeps.
 */
export type MusicBed = "none" | "lobby" | "battle" | "victory" | "defeat" | "draw";

export type Cue =
  | "ui"
  | "confirm"
  | "select"
  | "place"
  | "swap"
  | "invalid"
  | "match"
  | "combo"
  | "highcombo"
  | "score"
  | "oppscore"
  | "warning"
  | "critical"
  | "freeze"
  | "timeshift"
  | "rewind"
  | "deny"
  | "search"
  | "found"
  | "countdown"
  | "clash"
  | "win"
  | "lose"
  | "draw"
  | "power"
  | "launch"
  | "incoming"
  | "impact"
  | "lifelost"
  | "lifead"
  | "livesreset";

export interface AudioAsset {
  id: string;
  file: string;
  url: string;
  kind: "music" | "sfx";
  loop: boolean;
  durationSec: number;
  loopStartSec: number;
  loopEndSec: number;
  /** True until a matching .ogg/.mp3 drop-in is present. */
  standIn: boolean;
  note: string;
}

export const AUDIO_DIR = "/audio";

function asset(
  id: string,
  file: string,
  kind: AudioAsset["kind"],
  loop: boolean,
  durationSec: number,
  note: string,
): AudioAsset {
  return {
    id,
    file,
    url: `${AUDIO_DIR}/${file}`,
    kind,
    loop,
    durationSec,
    loopStartSec: 0,
    loopEndSec: durationSec,
    standIn: true,
    note,
  };
}

export const MUSIC_FILES: Record<Exclude<MusicBed, "none">, AudioAsset> = {
  lobby: asset(
    "music-lobby",
    "music-lobby.wav",
    "music",
    true,
    48.6,
    "Lobby theme. Stylish Cruiser identity — futuristic, catchy, not emotional. Loop.",
  ),
  battle: asset(
    "music-battle",
    "Arena_Pulse_1788563386140.m4a",
    "music",
    true,
    224.4,
    "Arena gameplay theme. Uploaded Arena Pulse master. Loop.",
  ),
  victory: asset(
    "music-victory",
    "music-victory.wav",
    "music",
    false,
    14.0,
    "Victory cue. Catchy energetic payoff from the same OFDN family. One-shot.",
  ),
  defeat: asset(
    "music-defeat",
    "music-defeat.wav",
    "music",
    false,
    16.5,
    "Defeat cue. Dark rematch energy. Never sad. One-shot.",
  ),
  draw: asset(
    "music-draw",
    "music-draw.wav",
    "music",
    false,
    16.0,
    "Draw sting. Unresolved electronic close. One-shot.",
  ),
};

export const SFX_FILES: Record<Cue, AudioAsset> = {
  ui: asset("sfx-ui", "sfx-ui.wav", "sfx", false, 0.22, "Soft crystalline button tick."),
  confirm: asset("sfx-confirm", "sfx-confirm.wav", "sfx", false, 0.38, "Affirming two-note chime."),
  select: asset("sfx-place", "sfx-place.wav", "sfx", false, 0.15, "Soft crystal gem tap."),
  place: asset("sfx-place", "sfx-place.wav", "sfx", false, 0.15, "Soft crystal gem tap (same file as select)."),
  swap: asset("sfx-move", "sfx-move.wav", "sfx", false, 0.18, "Polished two-crystal swipe. Contact clink, no whoosh."),
  invalid: asset("sfx-invalid", "sfx-invalid.wav", "sfx", false, 0.34, "Rejected swap."),
  match: asset("sfx-match", "sfx-match.wav", "sfx", false, 0.26, "Player-board tempered-glass shatter (normal clear)."),
  combo: asset("sfx-combo", "sfx-combo.wav", "sfx", false, 0.34, "Player-board glass shatter (chained clear)."),
  highcombo: asset("sfx-highcombo", "sfx-highcombo.wav", "sfx", false, 0.44, "Player-board glass shatter (major chain)."),
  score: asset("sfx-score", "sfx-score.wav", "sfx", false, 0.28, "Player score tick."),
  oppscore: asset("sfx-oppscore", "sfx-oppscore.wav", "sfx", false, 0.3, "Opponent score tick, darker."),
  warning: asset("sfx-warning", "sfx-warning.wav", "sfx", false, 0.55, "Timer warning pulse."),
  critical: asset("sfx-critical", "sfx-critical.wav", "sfx", false, 0.7, "Final-seconds critical alarm."),
  freeze: asset("sfx-freeze", "sfx-freeze.wav", "sfx", false, 0.85, "Freeze Time ice descent."),
  timeshift: asset("sfx-timeshift", "sfx-timeshift.wav", "sfx", false, 0.8, "Time Shift reverse sweep."),
  rewind: asset("sfx-rewind", "sfx-rewind.wav", "sfx", false, 0.7, "Rewind reverse cascade."),
  deny: asset("sfx-deny", "sfx-deny.wav", "sfx", false, 0.4, "Power unavailable / insufficient coins."),
  search: asset("sfx-search", "sfx-search.wav", "sfx", false, 1.6, "Matchmaking radar ping."),
  found: asset("sfx-found", "sfx-found.wav", "sfx", false, 0.9, "Match found resolve."),
  countdown: asset("sfx-countdown", "sfx-countdown.wav", "sfx", false, 0.28, "Pre-match countdown tick."),
  clash: asset("sfx-start", "sfx-start.wav", "sfx", false, 0.95, "Match start impact."),
  win: asset("sfx-victory", "sfx-victory.wav", "sfx", false, 1.35, "Victory SFX layered under victory music."),
  lose: asset("sfx-defeat", "sfx-defeat.wav", "sfx", false, 1.4, "Defeat SFX layered under defeat music."),
  draw: asset("sfx-draw", "sfx-draw.wav", "sfx", false, 1.05, "Draw SFX."),
  power: asset("sfx-power", "sfx-power.wav", "sfx", false, 0.55, "Generic power arm."),
  launch: asset("sfx-launch", "sfx-launch.wav", "sfx", false, 0.45, "Player attack launch."),
  incoming: asset("sfx-incoming", "sfx-incoming.wav", "sfx", false, 0.5, "Rival attack incoming."),
  impact: asset("sfx-impact", "sfx-impact.wav", "sfx", false, 0.42, "Attack impact."),
  lifelost: asset("sfx-lifelost", "sfx-lifelost.wav", "sfx", false, 0.7, "Daily life lost."),
  lifead: asset("sfx-lifead", "sfx-lifead.wav", "sfx", false, 0.85, "Rewarded-ad +1 life."),
  livesreset: asset("sfx-livesreset", "sfx-livesreset.wav", "sfx", false, 1.15, "UTC daily lives restored."),
};

export type VoiceCalloutId = "locked" | "combo" | "ultimate";

export const VOICE_FILES: Record<VoiceCalloutId, AudioAsset> = {
  locked: asset("voice-locked", "voice-locked.wav", "sfx", false, 0.44, "Calm human lock callout."),
  combo: asset("voice-combo", "voice-combo.wav", "sfx", false, 0.39, "Light-excitement combo callout."),
  ultimate: asset("voice-ultimate", "voice-ultimate.wav", "sfx", false, 0.43, "Powerful human ultimate callout."),
};

const GEM_VARIANT_STEMS = ["move", "place", "match", "combo", "highcombo"] as const;

/** Round-robin crystal variants so repeated swaps/matches are not the same sample. */
export const SFX_VARIANT_FILES: AudioAsset[] = GEM_VARIANT_STEMS.flatMap((stem) => [
  asset(`sfx-${stem}-b`, `sfx-${stem}-b.wav`, "sfx", false, SFX_FILES[stem === "move" ? "swap" : stem === "place" ? "place" : stem].durationSec, `Crystal variant B (${stem}).`),
  asset(`sfx-${stem}-c`, `sfx-${stem}-c.wav`, "sfx", false, SFX_FILES[stem === "move" ? "swap" : stem === "place" ? "place" : stem].durationSec, `Crystal variant C (${stem}).`),
]);

export function sfxVariantIds(cue: Cue): string[] {
  const primary = sfxAsset(cue === "select" ? "place" : cue).id;
  if (cue === "swap") return ["sfx-move", "sfx-move-b", "sfx-move-c"];
  if (cue === "place" || cue === "select") return ["sfx-place", "sfx-place-b", "sfx-place-c"];
  if (cue === "match") return ["sfx-match", "sfx-match-b", "sfx-match-c"];
  if (cue === "combo") return ["sfx-combo", "sfx-combo-b", "sfx-combo-c"];
  if (cue === "highcombo") return ["sfx-highcombo", "sfx-highcombo-b", "sfx-highcombo-c"];
  return [primary];
}

export const AUDIO_ASSETS: AudioAsset[] = [
  ...Object.values(MUSIC_FILES),
  ...new Map(Object.values(SFX_FILES).map((item) => [item.file, item])).values(),
  ...SFX_VARIANT_FILES,
  ...Object.values(VOICE_FILES),
];

MUSIC_FILES.battle.loopStartSec = 0;
MUSIC_FILES.battle.loopEndSec = 224.4;

export const LOOPING_BEDS: ReadonlySet<MusicBed> = new Set(["lobby", "battle"]);

export function musicAsset(bed: MusicBed): AudioAsset | null {
  if (bed === "none") return null;
  return MUSIC_FILES[bed];
}

export function sfxAsset(cue: Cue): AudioAsset {
  return SFX_FILES[cue];
}

export function voiceAsset(id: string): AudioAsset | null {
  if (id === "locked" || id === "combo" || id === "ultimate") return VOICE_FILES[id];
  return null;
}

export function uniqueAudioAssets(): AudioAsset[] {
  return [...new Map(AUDIO_ASSETS.map((item) => [item.id, item])).values()];
}
