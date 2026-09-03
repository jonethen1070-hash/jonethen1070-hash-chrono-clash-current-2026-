#!/usr/bin/env python3
"""Chrono-Crystal Gen-3 prototype beds.

Writes ONLY into this preview folder. Does not touch public/audio/ live masters.

Sonic reference: Wraghstep [v2] (the Gen-2 Defeat bed). All four cues are
re-composed from that same production — different sections, roles, and mix —
not copies of the Defeat sting.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import wave

import numpy as np

SR = 48000
PI2 = 2.0 * np.pi
OUT = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(OUT, "_work")
BOX = os.environ.get(
    "CHRONO_OFDN_DIR",
    "/tmp/cc-el/box2/Of Far Different Nature - LOOP PACK #2 (CC-BY) - OGG files",
)
WRAGH = os.path.join(BOX, "Of Far Different Nature - Wraghstep [v2] (CC-BY).ogg")
GEN2_SWIPE = os.path.join(os.path.dirname(OUT), "chrono-crystal-preview-gen2", "proto-swipe.wav")

BPM = 136.0
A2, A3, A4, A5 = 110.00, 220.00, 440.00, 880.00
E3, E4, E5 = 164.81, 329.63, 659.25
C4, C5, CS5 = 261.63, 523.25, 554.37
D3, D4, D5 = 146.83, 293.66, 587.33


def run(cmd: list[str]) -> None:
    subprocess.check_call(cmd)


def write_wav(path: str, audio: np.ndarray) -> None:
    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2")
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())


def read_wav(path: str) -> np.ndarray:
    with wave.open(path, "rb") as wf:
        ch = wf.getnchannels()
        raw = np.frombuffer(wf.readframes(wf.getnframes()), dtype="<i2").astype(np.float64) / 32768.0
        return np.column_stack([raw, raw]) if ch == 1 else raw.reshape(-1, ch)[:, :2]


def sl(audio: np.ndarray, t0: float, t1: float) -> np.ndarray:
    i0 = max(0, int(round(t0 * SR)))
    i1 = min(len(audio), int(round(t1 * SR)))
    return audio[i0:i1].copy()


def xfade_concat(a: np.ndarray, b: np.ndarray, fade: float = 0.55) -> np.ndarray:
    n = min(int(fade * SR), len(a) // 4, len(b) // 4)
    if n < 32:
        return np.vstack([a, b])
    ramp = np.linspace(0.0, 1.0, n)[:, None]
    mid = a[-n:] * (1.0 - ramp) + b[:n] * ramp
    return np.vstack([a[:-n], mid, b[n:]])


def fade_edges(audio: np.ndarray, fade_in: float, fade_out: float) -> np.ndarray:
    out = audio.copy()
    ni = min(len(out) - 2, int(fade_in * SR))
    no = min(len(out) - 2, int(fade_out * SR))
    if ni > 1:
        out[:ni] *= np.linspace(0.0, 1.0, ni)[:, None]
    if no > 1:
        out[-no:] *= np.linspace(1.0, 0.0, no)[:, None]
    return out


def loop_crossfade(audio: np.ndarray, fade_s: float = 1.25) -> np.ndarray:
    fade = min(len(audio) // 6, int(fade_s * SR))
    if fade < 64:
        return audio
    body = audio[:-fade].copy()
    ramp = np.linspace(0.0, 1.0, fade)[:, None]
    body[:fade] = audio[:fade] * ramp + audio[-fade:] * (1.0 - ramp)
    return body


def place(dst: np.ndarray, src: np.ndarray, t: float, gain: float = 1.0) -> None:
    i0 = int(round(t * SR))
    if i0 >= len(dst) or i0 < 0:
        return
    n = min(len(src), len(dst) - i0)
    dst[i0 : i0 + n] += src[:n] * gain


def sine(n: int, freq: np.ndarray | float) -> np.ndarray:
    freq_a = np.full(n, float(freq)) if np.isscalar(freq) else np.asarray(freq, dtype=np.float64)
    return np.sin(np.cumsum(PI2 * freq_a / SR))


def saw(n: int, freq: np.ndarray | float) -> np.ndarray:
    freq_a = np.full(n, float(freq)) if np.isscalar(freq) else np.asarray(freq, dtype=np.float64)
    return 2.0 * np.mod(np.cumsum(freq_a / SR), 1.0) - 1.0


def fft_band(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1.0 / SR)
    spec[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(spec, n=len(x)).astype(np.float64)


def supersaw(n: int, freq: float, voices: int = 5, detune: float = 0.009) -> np.ndarray:
    out = np.zeros(n)
    for d in np.linspace(-detune, detune, voices):
        out += saw(n, freq * (1.0 + d))
    return out / voices


def analog_lead(n: int, freq: float, bright: float = 0.55) -> np.ndarray:
    body = supersaw(n, freq, 5, 0.009) + 0.22 * sine(n, freq)
    air = fft_band(body, 900.0, 5200.0)
    low = fft_band(body, 180.0, 1400.0)
    t = np.arange(n) / SR
    env = (1.0 - np.exp(-t / 0.012)) * np.exp(-t / (0.42 + 0.25 * bright))
    hold = np.clip(1.0 - np.maximum(t - (n / SR - 0.16), 0) / 0.16, 0, 1)
    tone = (0.62 + 0.38 * bright) * air + (0.55 - 0.15 * bright) * low
    return tone * env * hold


def crystal_attack(n: int, f0: float) -> np.ndarray:
    ratios = (1.00, 2.63, 4.41, 6.92, 9.55)
    decays = (0.11, 0.07, 0.045, 0.03, 0.018)
    amps = (1.00, 0.38, 0.18, 0.10, 0.05)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for r, d, a in zip(ratios, decays, amps):
        out += a * np.sin(PI2 * f0 * r * t) * np.exp(-t / d)
    return out * (1.0 - np.exp(-t / 0.002))


def motif_note(freq: float, dur: float, bright: float, crystal: float) -> np.ndarray:
    n = int((dur + 0.05) * SR)
    lead = analog_lead(n, freq, bright)
    att = crystal_attack(n, freq)
    mono = 0.78 * lead + crystal * att
    delay = 28
    right = np.zeros_like(mono)
    right[delay:] = mono[:-delay]
    mid = (mono + right) * 0.5
    side = (mono - right) * 0.22
    return np.column_stack([mid + side, mid - side])


def render_motif_phrase(kind: str, bright: float) -> np.ndarray:
    beat = 60.0 / BPM
    if kind == "lobby":
        hits = [(0.00, A4, 0.90), (1.00, E5, 1.10), (2.20, C5, 0.70), (3.05, D5, 1.60)]
        length, crystal = 5.0 * beat, 0.22
    elif kind == "battle":
        hits = [(0.00, A4, 0.28), (0.50, E5, 0.28), (1.00, C5, 0.28), (1.50, D5, 0.70)]
        length, crystal = 4.0 * beat, 0.15
    elif kind == "battle_wide":
        hits = [(0.00, A3, 0.9), (1.00, E4, 1.0), (2.25, C4, 0.7), (3.10, D4, 1.4)]
        length, crystal = 8.0 * beat, 0.18
    elif kind == "drop":
        hits = [(0.00, A4, 0.22), (0.25, E5, 0.22), (0.50, C5, 0.22), (0.75, D5, 0.45), (1.50, A5, 0.9)]
        length, crystal = 4.0 * beat, 0.16
    elif kind == "victory":
        hits = [(0.00, A4, 0.40), (0.50, E5, 0.45), (1.05, CS5, 0.50), (1.65, A5, 1.9)]
        length, crystal, bright = 4.2 * beat, 0.28, 0.88
    else:
        hits = [(0.00, D4, 0.32), (0.40, C4, 0.32), (0.85, E4, 0.40), (1.35, A3, 0.35), (1.80, D4, 1.05)]
        length, crystal, bright = 4.6 * beat, 0.14, 0.40
    n = int(length * SR) + 8
    buf = np.zeros((n, 2))
    for beat_off, hz, dur_beats in hits:
        place(buf, motif_note(hz, dur_beats * beat, bright, crystal), beat_off * beat, 1.0)
    return buf


def overlay_motif(dst: np.ndarray, kind: str, t0: float, t1: float, gain: float, bright: float) -> None:
    phrase = render_motif_phrase(kind, bright)
    dur = len(phrase) / SR
    t = t0
    while t + 0.2 < t1 and t * SR < len(dst):
        place(dst, phrase, t, gain)
        t += dur


def riser(seconds: float) -> np.ndarray:
    n = int(seconds * SR)
    rng = np.random.default_rng(21)
    noise = rng.standard_normal(n)
    t = np.arange(n) / SR
    mono = np.zeros(n)
    for lo, hi_f, g in ((200, 800, 0.18), (600, 2400, 0.28), (1800, 7000, 0.35), (4000, 12000, 0.22)):
        band = fft_band(noise, lo, hi_f)
        ramp = (t / seconds) ** (0.7 + lo / 8000)
        mono += g * band * ramp
    mono *= (t / seconds) ** 1.1
    mono /= np.max(np.abs(mono)) + 1e-9
    tick_n = int(0.03 * SR)
    last = seconds - 0.85
    for k in range(8):
        click = fft_band(rng.standard_normal(tick_n), 1800, 9000)
        click *= np.exp(-np.arange(tick_n) / (0.012 * SR)) * (0.12 + 0.04 * k)
        i0 = int((last + k * (0.85 / 8)) * SR)
        nput = min(tick_n, n - i0)
        if nput > 0:
            mono[i0 : i0 + nput] += click[:nput]
    return np.column_stack([mono, np.roll(mono, 31)]) * 0.48


def drop_impact() -> np.ndarray:
    n = int(0.50 * SR)
    t = np.arange(n) / SR
    body = sine(n, 96.0 + 64.0 * np.exp(-t / 0.04)) * np.exp(-t / 0.16)
    click = fft_band(np.random.default_rng(3).standard_normal(n), 1400, 8000) * np.exp(-t / 0.012) * 0.30
    crash = fft_band(np.random.default_rng(4).standard_normal(n), 700, 6200) * np.exp(-t / 0.08) * 0.18
    mono = 0.88 * body + click + crash
    return np.column_stack([mono, np.roll(mono, 14)]) * 0.55


def load_wragh() -> np.ndarray:
    path = os.path.join(WORK, "wragh.wav")
    if not os.path.exists(path):
        run(
            [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                WRAGH,
                "-ar",
                str(SR),
                "-ac",
                "2",
                "-c:a",
                "pcm_s16le",
                path,
            ]
        )
    return read_wav(path)


def assemble_lobby(wragh: np.ndarray) -> np.ndarray:
    """Welcoming expansion of the Wraghstep palette — intro + groove, never the crush drop."""
    intro = fade_edges(sl(wragh, 0.05, 7.15), 0.02, 0.02)
    groove = sl(wragh, 10.05, 36.40)  # pre-drop groove, same synth/bass DNA
    cool = sl(wragh, 73.20, 84.80)  # outro color as a B-section, still the same track
    bed = xfade_concat(intro, groove, 0.55)
    bed = xfade_concat(bed, cool, 0.70)
    bed = loop_crossfade(bed, 1.20)
    seconds = len(bed) / SR
    mix = bed.copy()
    overlay_motif(mix, "lobby", 0.06, seconds - 1.2, gain=0.32, bright=0.64)
    hook = render_motif_phrase("lobby", 0.72)
    place(mix, hook, 0.05, 0.20)
    return fade_edges(mix, 0.03, 0.04)


def bass_until_drop(audio: np.ndarray, t_drop: float, fade: float = 2.4, pre: float = 0.30) -> np.ndarray:
    """Keep groove present but withhold full low end until the Defeat-quality drop."""
    n = len(audio)
    open_e = np.ones(n, dtype=np.float64)
    i_full = int(t_drop * SR)
    i0 = max(0, int((t_drop - fade) * SR))
    open_e[:i0] = pre
    if i_full > i0:
        open_e[i0:i_full] = np.linspace(pre, 1.0, i_full - i0)
    hp = np.zeros_like(audio)
    a = np.exp(-2.0 * np.pi * 210.0 / SR)
    for c in range(2):
        y = 0.0
        prev = 0.0
        col = audio[:, c]
        out = np.empty(n)
        for i in range(n):
            y = a * (y + col[i] - prev)
            prev = col[i]
            out[i] = y
        hp[:, c] = out
    g = open_e[:, None]
    return audio * g + hp * (1.0 - g) * 0.92


def assemble_battle(wragh: np.ndarray) -> np.ndarray:
    """Full Wraghstep arc as a competitive match: intro → groove → drop → peak → land."""
    # Natural drop lands ~38s. Ride the whole production, then button.
    bed = sl(wragh, 0.00, 88.40)
    mix = bass_until_drop(bed, t_drop=38.05, fade=2.6, pre=0.34)
    place(mix, riser(3.8), 34.2, 0.92)
    place(mix, drop_impact(), 37.95, 0.85)
    overlay_motif(mix, "battle_wide", 0.35, 9.5, gain=0.26, bright=0.48)
    overlay_motif(mix, "battle", 10.2, 36.5, gain=0.22, bright=0.56)
    overlay_motif(mix, "drop", 38.05, 61.5, gain=0.24, bright=0.70)
    overlay_motif(mix, "battle", 62.0, 84.0, gain=0.22, bright=0.58)
    last = render_motif_phrase("lobby", 0.70)
    place(mix, last, 84.4, 0.30)
    return fade_edges(mix, 0.02, 2.6)


def assemble_victory(wragh: np.ndarray) -> np.ndarray:
    """Same DNA, later/brighter section, major motif lift, hard stop."""
    bed = fade_edges(sl(wragh, 64.40, 76.55), 0.01, 0.04)
    mix = bed.copy()
    overlay_motif(mix, "victory", 0.04, 8.2, gain=0.38, bright=0.90)
    place(mix, motif_note(A5, 1.7, 0.92, 0.38), 6.4, 0.42)
    return fade_edges(mix, 0.01, 1.7)


def assemble_defeat(wragh: np.ndarray) -> np.ndarray:
    """Keep the premium dark peak that won Gen-2 — stylish rematch, not sad."""
    bed = fade_edges(sl(wragh, 39.50, 56.40), 0.02, 0.06)
    mix = bed.copy()
    overlay_motif(mix, "defeat", 0.08, len(mix) / SR - 1.2, gain=0.26, bright=0.40)
    return fade_edges(mix, 0.02, 1.25)


def peak_normalize(audio: np.ndarray, peak: float = 0.89) -> np.ndarray:
    m = float(np.max(np.abs(audio)))
    if m > 0:
        audio = audio * (peak / m)
    return audio


def master(wav: str, mp3: str, lufs: float, extra: str = "", preserve_dynamics: bool = False) -> None:
    head = (
        "highpass=f=82,lowpass=f=13800,"
        "equalizer=f=220:t=q:w=0.8:g=-1.6,"
        "equalizer=f=1650:t=q:w=0.9:g=2.2,"
        "equalizer=f=3100:t=q:w=1.15:g=-1.4,"
        "equalizer=f=6800:t=q:w=1.3:g=-1.8,"
    )
    if preserve_dynamics:
        tail = (
            "acompressor=threshold=-18dB:ratio=1.6:attack=8:release=90:makeup=1.0,"
            "crystalizer=i=1.15,"
            "extrastereo=m=1.10,"
            "alimiter=limit=0.89:attack=5:release=50"
        )
    else:
        tail = (
            "acompressor=threshold=-16dB:ratio=2.3:attack=7:release=70:makeup=1.4,"
            "crystalizer=i=1.3,"
            "extrastereo=m=1.10,"
            f"loudnorm=I={lufs}:TP=-1.3:LRA=8:linear=true"
        )
    filt = head + tail
    if extra:
        filt = extra + "," + filt
    staged = wav.replace(".wav", "-m.wav")
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", wav, "-af", filt, "-ar", str(SR), "-ac", "2", "-c:a", "pcm_s16le", staged])
    os.replace(staged, wav)
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "256k", "-ar", "48000", "-ac", "2", mp3])


def main() -> None:
    os.makedirs(WORK, exist_ok=True)
    wragh = load_wragh()
    jobs = (
        ("lobby", assemble_lobby, -14.2, "equalizer=f=120:t=q:w=0.7:g=-1.2,equalizer=f=4500:t=q:w=1.0:g=-1.0", False),
        ("battle", assemble_battle, -15.0, "crystalizer=i=0.25", True),
        ("victory", assemble_victory, -13.8, "highshelf=f=4200:g=3.2,lowshelf=f=130:g=-1.8", False),
        ("defeat", assemble_defeat, -14.4, "highshelf=f=8500:g=-1.6", False),
    )
    for kind, fn, lufs, extra, dyn in jobs:
        print("assembling", kind, flush=True)
        audio = peak_normalize(fn(wragh))
        wav = os.path.join(OUT, f"proto-{kind}.wav")
        mp3 = os.path.join(OUT, f"proto-{kind}.mp3")
        write_wav(wav, audio)
        master(wav, mp3, lufs, extra, preserve_dynamics=dyn)
        print("  wrote", mp3, os.path.getsize(mp3), f"dur={len(audio)/SR:.1f}s", flush=True)

    swipe_src = GEN2_SWIPE
    swipe_dst = os.path.join(OUT, "proto-swipe.wav")
    if os.path.exists(swipe_src):
        shutil.copy2(swipe_src, swipe_dst)
        print("copied swipe", swipe_dst, os.path.getsize(swipe_dst), flush=True)
    else:
        raise SystemExit("missing Gen-2 swipe to copy")


if __name__ == "__main__":
    main()
